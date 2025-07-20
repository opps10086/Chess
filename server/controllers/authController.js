const axios = require('axios');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

const config = require('../config/config');
const db = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const { 
    generateToken, 
    generateRefreshToken, 
    verifyRefreshToken, 
    blacklistToken 
} = require('../middleware/auth');
const { 
    ValidationError, 
    AuthenticationError, 
    ConflictError,
    NotFoundError 
} = require('../middleware/errorHandler');

// 创建邮件发送器
const transporter = nodemailer.createTransporter(config.email);

// NodeLoc OAuth2授权URL生成
async function getOAuthUrl(req, res) {
    try {
        const state = crypto.randomBytes(32).toString('hex');
        
        // 将state存储到Redis，5分钟过期
        await redis.set(`oauth_state:${state}`, '1', 300);
        
        const authUrl = `${config.oauth.authUrl}?` +
            `client_id=${config.oauth.clientId}&` +
            `redirect_uri=${encodeURIComponent(config.oauth.redirectUri)}&` +
            `response_type=code&` +
            `scope=${encodeURIComponent(config.oauth.scope)}&` +
            `state=${state}`;

        res.json({
            success: true,
            data: {
                authUrl,
                state
            }
        });
    } catch (error) {
        logger.error('生成OAuth授权URL失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
}

// NodeLoc OAuth2回调处理
async function handleOAuthCallback(req, res) {
    try {
        const { code, state } = req.query;

        if (!code) {
            return res.redirect('/login?error=授权失败');
        }

        // 验证state参数防CSRF
        if (!state || !(await redis.get(`oauth_state:${state}`))) {
            return res.redirect('/login?error=无效的授权请求');
        }

        // 删除已使用的state
        await redis.del(`oauth_state:${state}`);

        // 交换授权码获取访问令牌
        const tokenResponse = await axios.post(config.oauth.tokenUrl, {
            client_id: config.oauth.clientId,
            client_secret: config.oauth.clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: config.oauth.redirectUri
        }, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token, refresh_token } = tokenResponse.data;

        // 获取用户信息
        const userResponse = await axios.get(config.oauth.userInfoUrl, {
            headers: {
                'Authorization': `Bearer ${access_token}`
            }
        });

        const { sub, username, email } = userResponse.data;

        // 查找或创建用户
        let user = await db.findOne(
            'SELECT * FROM users WHERE nodeloc_user_id = ?',
            [sub]
        );

        if (!user) {
            // 检查邮箱是否已被其他用户使用
            const existingUser = await db.findOne(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );

            if (existingUser) {
                // 关联已有账号
                await db.update(
                    'users',
                    {
                        nodeloc_user_id: sub,
                        nodeloc_username: username,
                        last_login: new Date()
                    },
                    'id = ?',
                    [existingUser.id]
                );
                
                user = await db.findOne(
                    'SELECT * FROM users WHERE id = ?',
                    [existingUser.id]
                );
            } else {
                // 创建新用户
                const userId = await db.insert('users', {
                    username: username,
                    email: email,
                    nodeloc_user_id: sub,
                    nodeloc_username: username,
                    email_verified: true,
                    last_login: new Date()
                });

                user = await db.findOne(
                    'SELECT * FROM users WHERE id = ?',
                    [userId]
                );
            }
        } else {
            // 更新最后登录时间
            await db.update(
                'users',
                { last_login: new Date() },
                'id = ?',
                [user.id]
            );
        }

        // 生成JWT令牌
        const token = generateToken({ userId: user.id });
        const refreshTokenJWT = generateRefreshToken({ userId: user.id });

        // 存储刷新令牌
        await redis.set(
            `refresh_token:${user.id}`,
            refreshTokenJWT,
            30 * 24 * 60 * 60 // 30天
        );

        // 更新用户在线状态
        await redis.hset(`user:${user.id}`, 'last_activity', Date.now());
        await redis.expire(`user:${user.id}`, 3600);

        logger.userAction(user.id, 'oauth_login', { provider: 'nodeloc' });

        // 重定向到前端，携带token
        res.redirect(`/login-success?token=${token}&refresh=${refreshTokenJWT}`);

    } catch (error) {
        logger.error('OAuth回调处理失败:', error);
        res.redirect('/login?error=登录失败，请重试');
    }
}

// 邮箱注册
async function registerWithEmail(req, res) {
    try {
        const { username, email, password, verificationCode } = req.body;

        // 验证输入
        if (!username || !email || !password || !verificationCode) {
            throw new ValidationError('请填写所有必填字段');
        }

        if (password.length < 6) {
            throw new ValidationError('密码长度至少6位');
        }

        // 验证邮箱验证码
        const storedCode = await redis.get(`email_verification:${email}`);
        if (!storedCode || storedCode !== verificationCode) {
            throw new ValidationError('验证码无效或已过期');
        }

        // 检查用户名和邮箱是否已存在
        const existingUser = await db.findOne(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existingUser) {
            throw new ConflictError('用户名或邮箱已被使用');
        }

        // 加密密码
        const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);

        // 创建用户
        const userId = await db.insert('users', {
            username,
            email,
            password_hash: passwordHash,
            email_verified: true
        });

        // 删除验证码
        await redis.del(`email_verification:${email}`);

        // 生成令牌
        const token = generateToken({ userId });
        const refreshTokenJWT = generateRefreshToken({ userId });

        // 存储刷新令牌
        await redis.set(
            `refresh_token:${userId}`,
            refreshTokenJWT,
            30 * 24 * 60 * 60
        );

        logger.userAction(userId, 'email_register');

        res.status(201).json({
            success: true,
            message: '注册成功',
            data: {
                token,
                refreshToken: refreshTokenJWT,
                user: {
                    id: userId,
                    username,
                    email
                }
            }
        });

    } catch (error) {
        throw error;
    }
}

// 邮箱登录
async function loginWithEmail(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            throw new ValidationError('请输入邮箱和密码');
        }

        // 查找用户
        const user = await db.findOne(
            'SELECT id, username, email, password_hash, is_active FROM users WHERE email = ?',
            [email]
        );

        if (!user) {
            throw new AuthenticationError('邮箱或密码错误');
        }

        if (!user.is_active) {
            throw new AuthenticationError('账户已被禁用');
        }

        // 验证密码
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            throw new AuthenticationError('邮箱或密码错误');
        }

        // 更新最后登录时间
        await db.update(
            'users',
            { last_login: new Date() },
            'id = ?',
            [user.id]
        );

        // 生成令牌
        const token = generateToken({ userId: user.id });
        const refreshTokenJWT = generateRefreshToken({ userId: user.id });

        // 存储刷新令牌
        await redis.set(
            `refresh_token:${user.id}`,
            refreshTokenJWT,
            30 * 24 * 60 * 60
        );

        // 更新在线状态
        await redis.hset(`user:${user.id}`, 'last_activity', Date.now());
        await redis.expire(`user:${user.id}`, 3600);

        logger.userAction(user.id, 'email_login');

        res.json({
            success: true,
            message: '登录成功',
            data: {
                token,
                refreshToken: refreshTokenJWT,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email
                }
            }
        });

    } catch (error) {
        throw error;
    }
}

// 发送邮箱验证码
async function sendEmailVerification(req, res) {
    try {
        const { email } = req.body;

        if (!email) {
            throw new ValidationError('请输入邮箱地址');
        }

        // 检查邮箱格式
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new ValidationError('邮箱格式不正确');
        }

        // 检查发送频率限制
        const rateLimitKey = `email_rate_limit:${email}`;
        const lastSent = await redis.get(rateLimitKey);
        if (lastSent) {
            throw new ValidationError('请等待60秒后再次发送验证码');
        }

        // 生成验证码
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        // 存储验证码，5分钟过期
        await redis.set(`email_verification:${email}`, verificationCode, 300);
        
        // 设置发送频率限制，60秒
        await redis.set(rateLimitKey, '1', 60);

        // 发送邮件
        const mailOptions = {
            from: config.email.auth.user,
            to: email,
            subject: 'NL象棋 - 邮箱验证码',
            html: `
                <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
                    <h2 style="color: #8B4513; text-align: center;">NL象棋</h2>
                    <div style="background: #f5f5f5; padding: 20px; border-radius: 8px;">
                        <h3 style="color: #333;">邮箱验证</h3>
                        <p>您的验证码是：</p>
                        <div style="font-size: 24px; font-weight: bold; color: #8B4513; text-align: center; margin: 20px 0; padding: 10px; background: white; border-radius: 4px;">
                            ${verificationCode}
                        </div>
                        <p style="color: #666; font-size: 14px;">
                            验证码将在5分钟后过期，请及时使用。<br>
                            如果这不是您的操作，请忽略此邮件。
                        </p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        logger.info(`邮箱验证码已发送: ${email}`);

        res.json({
            success: true,
            message: '验证码已发送到您的邮箱'
        });

    } catch (error) {
        if (error.code === 'EAUTH' || error.code === 'ECONNECTION') {
            logger.error('邮件发送失败:', error);
            throw new Error('邮件发送服务暂时不可用');
        }
        throw error;
    }
}

// 刷新令牌
async function refreshToken(req, res) {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            throw new ValidationError('缺少刷新令牌');
        }

        // 验证刷新令牌
        const decoded = verifyRefreshToken(refreshToken);
        const userId = decoded.userId;

        // 检查刷新令牌是否存在
        const storedToken = await redis.get(`refresh_token:${userId}`);
        if (!storedToken || storedToken !== refreshToken) {
            throw new AuthenticationError('无效的刷新令牌');
        }

        // 检查用户是否存在且活跃
        const user = await db.findOne(
            'SELECT id, username, email, is_active FROM users WHERE id = ?',
            [userId]
        );

        if (!user || !user.is_active) {
            throw new AuthenticationError('用户不存在或已被禁用');
        }

        // 生成新的访问令牌
        const newToken = generateToken({ userId });

        res.json({
            success: true,
            data: {
                token: newToken
            }
        });

    } catch (error) {
        throw error;
    }
}

// 登出
async function logout(req, res) {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            // 将令牌加入黑名单
            await blacklistToken(token);
        }

        if (req.user) {
            // 删除刷新令牌
            await redis.del(`refresh_token:${req.user.id}`);
            
            // 删除用户在线状态
            await redis.del(`user:${req.user.id}`);

            logger.userAction(req.user.id, 'logout');
        }

        res.json({
            success: true,
            message: '登出成功'
        });

    } catch (error) {
        throw error;
    }
}

// 获取当前用户信息
async function getCurrentUser(req, res) {
    try {
        if (!req.user) {
            throw new AuthenticationError('未登录');
        }

        const user = await db.findOne(`
            SELECT id, username, email, nodeloc_user_id, avatar_url, 
                   total_games, wins, losses, draws, rating, consecutive_wins, 
                   max_consecutive_wins, rank_level, created_at
            FROM users 
            WHERE id = ?
        `, [req.user.id]);

        if (!user) {
            throw new NotFoundError('用户不存在');
        }

        res.json({
            success: true,
            data: { user }
        });

    } catch (error) {
        throw error;
    }
}

module.exports = {
    getOAuthUrl,
    handleOAuthCallback,
    registerWithEmail,
    loginWithEmail,
    sendEmailVerification,
    refreshToken,
    logout,
    getCurrentUser
};