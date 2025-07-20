const jwt = require('jsonwebtoken');
const config = require('../config/config');
const db = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');

// JWT认证中间件
async function authenticateToken(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                message: '缺少访问令牌'
            });
        }

        // 验证JWT令牌
        const decoded = jwt.verify(token, config.jwt.secret);
        
        // 检查令牌是否在黑名单中
        const isBlacklisted = await redis.get(`blacklist:${token}`);
        if (isBlacklisted) {
            return res.status(401).json({
                success: false,
                message: '令牌已失效'
            });
        }

        // 从数据库获取用户信息
        const user = await db.findOne(
            'SELECT id, username, email, nodeloc_user_id, avatar_url, rating, rank_level, is_active FROM users WHERE id = ?',
            [decoded.userId]
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: '用户不存在'
            });
        }

        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                message: '账户已被禁用'
            });
        }

        // 更新用户在线状态
        await redis.hset(`user:${user.id}`, 'last_activity', Date.now());
        await redis.expire(`user:${user.id}`, 3600); // 1小时过期

        // 将用户信息添加到请求对象
        req.user = user;
        next();

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: '无效的访问令牌'
            });
        } else if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: '访问令牌已过期'
            });
        } else {
            logger.error('认证中间件错误:', error);
            return res.status(500).json({
                success: false,
                message: '服务器内部错误'
            });
        }
    }
}

// 可选认证中间件（不强制要求登录）
async function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            const decoded = jwt.verify(token, config.jwt.secret);
            const user = await db.findOne(
                'SELECT id, username, email, avatar_url, rating, rank_level FROM users WHERE id = ? AND is_active = 1',
                [decoded.userId]
            );

            if (user) {
                req.user = user;
                // 更新在线状态
                await redis.hset(`user:${user.id}`, 'last_activity', Date.now());
                await redis.expire(`user:${user.id}`, 3600);
            }
        }

        next();
    } catch (error) {
        // 可选认证失败时不返回错误，继续处理请求
        next();
    }
}

// 检查用户权限中间件
function requirePermission(permission) {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: '需要登录'
                });
            }

            // 这里可以扩展更复杂的权限检查逻辑
            // 目前只检查基本的用户状态
            if (req.user.is_active) {
                next();
            } else {
                return res.status(403).json({
                    success: false,
                    message: '权限不足'
                });
            }
        } catch (error) {
            logger.error('权限检查错误:', error);
            return res.status(500).json({
                success: false,
                message: '服务器内部错误'
            });
        }
    };
}

// 管理员权限检查
async function requireAdmin(req, res, next) {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: '需要登录'
            });
        }

        // 检查是否为管理员（这里可以根据实际需求调整）
        const adminUsers = ['admin', 'administrator', 'root'];
        if (adminUsers.includes(req.user.username) || req.user.id === 1) {
            next();
        } else {
            return res.status(403).json({
                success: false,
                message: '需要管理员权限'
            });
        }
    } catch (error) {
        logger.error('管理员权限检查错误:', error);
        return res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
}

// 速率限制中间件（基于用户）
function userRateLimit(maxRequests = 100, windowMs = 15 * 60 * 1000) {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return next();
            }

            const key = `rate_limit:user:${req.user.id}`;
            const current = await redis.get(key);

            if (current === null) {
                await redis.set(key, 1, Math.floor(windowMs / 1000));
                return next();
            }

            if (parseInt(current) >= maxRequests) {
                return res.status(429).json({
                    success: false,
                    message: '请求过于频繁，请稍后再试'
                });
            }

            await redis.set(key, parseInt(current) + 1, Math.floor(windowMs / 1000));
            next();
        } catch (error) {
            logger.error('用户速率限制错误:', error);
            next(); // 出错时允许请求通过
        }
    };
}

// 生成JWT令牌
function generateToken(payload, expiresIn = config.jwt.expiresIn) {
    return jwt.sign(payload, config.jwt.secret, { expiresIn });
}

// 生成刷新令牌
function generateRefreshToken(payload) {
    return jwt.sign(payload, config.jwt.secret, { 
        expiresIn: config.jwt.refreshExpiresIn 
    });
}

// 验证刷新令牌
function verifyRefreshToken(token) {
    return jwt.verify(token, config.jwt.secret);
}

// 将令牌加入黑名单
async function blacklistToken(token) {
    try {
        const decoded = jwt.decode(token);
        if (decoded && decoded.exp) {
            const ttl = decoded.exp - Math.floor(Date.now() / 1000);
            if (ttl > 0) {
                await redis.set(`blacklist:${token}`, '1', ttl);
            }
        }
    } catch (error) {
        logger.error('令牌黑名单添加失败:', error);
    }
}

module.exports = {
    authenticateToken,
    optionalAuth,
    requirePermission,
    requireAdmin,
    userRateLimit,
    generateToken,
    generateRefreshToken,
    verifyRefreshToken,
    blacklistToken
};