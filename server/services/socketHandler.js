const jwt = require('jsonwebtoken');
const config = require('../config/config');
const db = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const GameEngine = require('./gameEngine');

// 存储活跃的游戏房间
const activeRooms = new Map();
// 存储用户socket映射
const userSockets = new Map();

// Socket.IO认证中间件
async function authenticateSocket(socket, next) {
    try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
            return next(new Error('认证失败：缺少令牌'));
        }

        const decoded = jwt.verify(token, config.jwt.secret);
        
        // 获取用户信息
        const user = await db.findOne(
            'SELECT id, username, email, avatar_url, rating, rank_level FROM users WHERE id = ? AND is_active = 1',
            [decoded.userId]
        );

        if (!user) {
            return next(new Error('认证失败：用户不存在'));
        }

        socket.user = user;
        next();
    } catch (error) {
        next(new Error('认证失败：无效令牌'));
    }
}

// 主Socket处理器
function socketHandler(io, socket) {
    // Socket认证
    authenticateSocket(socket, (err) => {
        if (err) {
            logger.security('Socket认证失败', { 
                socketId: socket.id, 
                error: err.message 
            });
            socket.disconnect();
            return;
        }

        const userId = socket.user.id;
        const username = socket.user.username;

        // 存储用户socket映射
        userSockets.set(userId, socket);
        
        // 更新用户在线状态
        redis.hset(`user:${userId}`, 'socket_id', socket.id);
        redis.hset(`user:${userId}`, 'online', 'true');
        redis.expire(`user:${userId}`, 3600);

        logger.info(`用户 ${username} 连接成功`, { userId, socketId: socket.id });

        // 加入用户专属房间
        socket.join(`user:${userId}`);

        // 发送连接成功消息
        socket.emit('connected', {
            success: true,
            user: socket.user
        });

        // 广播在线用户数量更新
        broadcastOnlineCount(io);

        // ========== 游戏房间相关事件 ==========
        
        // 获取房间列表
        socket.on('rooms:list', async (callback) => {
            try {
                const rooms = await db.findMany(`
                    SELECT r.*, u.username as creator_name,
                           COUNT(DISTINCT CASE WHEN r.player1_id IS NOT NULL THEN r.player1_id END +
                                 CASE WHEN r.player2_id IS NOT NULL THEN r.player2_id END) as player_count
                    FROM game_rooms r
                    LEFT JOIN users u ON r.creator_id = u.id
                    WHERE r.status = 'waiting' AND r.is_private = 0
                    GROUP BY r.id
                    ORDER BY r.created_at DESC
                    LIMIT 20
                `);

                callback({
                    success: true,
                    data: rooms
                });
            } catch (error) {
                logger.error('获取房间列表失败:', error);
                callback({
                    success: false,
                    message: '获取房间列表失败'
                });
            }
        });

        // 创建房间
        socket.on('room:create', async (data, callback) => {
            try {
                const { roomName, password, timeLimit = 600, isPrivate = false } = data;

                if (!roomName || roomName.trim().length === 0) {
                    return callback({
                        success: false,
                        message: '房间名称不能为空'
                    });
                }

                // 生成房间代码
                const roomCode = generateRoomCode();

                // 创建房间记录
                const roomId = await db.insert('game_rooms', {
                    room_code: roomCode,
                    room_name: roomName.trim(),
                    password_hash: password ? await bcrypt.hash(password, 10) : null,
                    creator_id: userId,
                    player1_id: userId,
                    is_private: isPrivate,
                    time_limit: timeLimit,
                    status: 'waiting'
                });

                // 创建游戏引擎实例
                const gameEngine = new GameEngine(roomId, userId);
                activeRooms.set(roomId, gameEngine);

                // 加入房间
                socket.join(`room:${roomId}`);
                
                logger.gameEvent('房间创建', { 
                    roomId, 
                    roomCode, 
                    creatorId: userId, 
                    roomName 
                });

                callback({
                    success: true,
                    data: {
                        roomId,
                        roomCode,
                        roomName
                    }
                });

                // 广播房间列表更新
                socket.broadcast.emit('rooms:updated');

            } catch (error) {
                logger.error('创建房间失败:', error);
                callback({
                    success: false,
                    message: '创建房间失败'
                });
            }
        });

        // 加入房间
        socket.on('room:join', async (data, callback) => {
            try {
                const { roomCode, password } = data;

                if (!roomCode) {
                    return callback({
                        success: false,
                        message: '房间代码不能为空'
                    });
                }

                // 查找房间
                const room = await db.findOne(
                    'SELECT * FROM game_rooms WHERE room_code = ? AND status = "waiting"',
                    [roomCode]
                );

                if (!room) {
                    return callback({
                        success: false,
                        message: '房间不存在或已开始游戏'
                    });
                }

                // 检查密码
                if (room.password_hash && !password) {
                    return callback({
                        success: false,
                        message: '请输入房间密码'
                    });
                }

                if (room.password_hash) {
                    const isValidPassword = await bcrypt.compare(password, room.password_hash);
                    if (!isValidPassword) {
                        return callback({
                            success: false,
                            message: '房间密码错误'
                        });
                    }
                }

                // 检查房间是否已满
                if (room.player1_id && room.player2_id) {
                    return callback({
                        success: false,
                        message: '房间已满'
                    });
                }

                // 检查是否已在房间中
                if (room.player1_id === userId || room.player2_id === userId) {
                    return callback({
                        success: false,
                        message: '您已在此房间中'
                    });
                }

                // 更新房间信息
                let updateData = {};
                if (!room.player1_id) {
                    updateData.player1_id = userId;
                } else {
                    updateData.player2_id = userId;
                    updateData.status = 'playing';
                    updateData.started_at = new Date();
                }

                await db.update(
                    'game_rooms',
                    updateData,
                    'id = ?',
                    [room.id]
                );

                // 加入socket房间
                socket.join(`room:${room.id}`);

                // 获取或创建游戏引擎
                let gameEngine = activeRooms.get(room.id);
                if (!gameEngine) {
                    gameEngine = new GameEngine(room.id, room.player1_id || userId);
                    activeRooms.set(room.id, gameEngine);
                }

                // 如果房间已满，开始游戏
                if (updateData.player2_id) {
                    gameEngine.startGame(room.player1_id, userId);
                    
                    // 通知房间内所有用户游戏开始
                    io.to(`room:${room.id}`).emit('game:started', {
                        roomId: room.id,
                        player1: room.player1_id,
                        player2: userId,
                        gameState: gameEngine.getGameState()
                    });

                    logger.gameEvent('游戏开始', {
                        roomId: room.id,
                        player1: room.player1_id,
                        player2: userId
                    });
                }

                callback({
                    success: true,
                    data: {
                        roomId: room.id,
                        roomName: room.room_name,
                        gameState: gameEngine.getGameState()
                    }
                });

                // 广播房间列表更新
                socket.broadcast.emit('rooms:updated');

            } catch (error) {
                logger.error('加入房间失败:', error);
                callback({
                    success: false,
                    message: '加入房间失败'
                });
            }
        });

        // ========== 游戏操作相关事件 ==========

        // 走棋
        socket.on('game:move', async (data, callback) => {
            try {
                const { roomId, from, to } = data;

                const gameEngine = activeRooms.get(roomId);
                if (!gameEngine) {
                    return callback({
                        success: false,
                        message: '游戏不存在'
                    });
                }

                // 验证是否轮到该用户走棋
                if (!gameEngine.isPlayerTurn(userId)) {
                    return callback({
                        success: false,
                        message: '还没轮到您走棋'
                    });
                }

                // 执行走棋
                const moveResult = gameEngine.makeMove(userId, from, to);
                
                if (!moveResult.success) {
                    return callback({
                        success: false,
                        message: moveResult.message
                    });
                }

                // 广播走棋结果给房间内所有用户
                io.to(`room:${roomId}`).emit('game:moved', {
                    move: moveResult.move,
                    gameState: gameEngine.getGameState()
                });

                // 检查游戏是否结束
                if (gameEngine.isGameOver()) {
                    const gameResult = gameEngine.getGameResult();
                    
                    // 保存游戏记录
                    await saveGameRecord(roomId, gameEngine);
                    
                    // 更新用户统计
                    await updateUserStats(gameResult);
                    
                    // 通知游戏结束
                    io.to(`room:${roomId}`).emit('game:ended', gameResult);
                    
                    // 清理游戏实例
                    activeRooms.delete(roomId);
                    
                    logger.gameEvent('游戏结束', {
                        roomId,
                        result: gameResult
                    });
                }

                callback({
                    success: true,
                    data: moveResult
                });

            } catch (error) {
                logger.error('走棋失败:', error);
                callback({
                    success: false,
                    message: '走棋失败'
                });
            }
        });

        // 悔棋请求
        socket.on('game:regret', async (data, callback) => {
            try {
                const { roomId } = data;

                const gameEngine = activeRooms.get(roomId);
                if (!gameEngine) {
                    return callback({
                        success: false,
                        message: '游戏不存在'
                    });
                }

                const result = gameEngine.requestRegret(userId);
                
                if (result.success) {
                    // 通知对手悔棋请求
                    const opponentId = gameEngine.getOpponent(userId);
                    const opponentSocket = userSockets.get(opponentId);
                    
                    if (opponentSocket) {
                        opponentSocket.emit('game:regret_request', {
                            fromUser: socket.user.username
                        });
                    }
                }

                callback(result);

            } catch (error) {
                logger.error('悔棋请求失败:', error);
                callback({
                    success: false,
                    message: '悔棋请求失败'
                });
            }
        });

        // 悔棋回应
        socket.on('game:regret_response', async (data, callback) => {
            try {
                const { roomId, accept } = data;

                const gameEngine = activeRooms.get(roomId);
                if (!gameEngine) {
                    return callback({
                        success: false,
                        message: '游戏不存在'
                    });
                }

                const result = gameEngine.respondToRegret(userId, accept);
                
                if (result.success && accept) {
                    // 广播悔棋成功
                    io.to(`room:${roomId}`).emit('game:regret_accepted', {
                        gameState: gameEngine.getGameState()
                    });
                } else if (result.success && !accept) {
                    // 通知悔棋被拒绝
                    io.to(`room:${roomId}`).emit('game:regret_denied');
                }

                callback(result);

            } catch (error) {
                logger.error('悔棋回应失败:', error);
                callback({
                    success: false,
                    message: '悔棋回应失败'
                });
            }
        });

        // 认输
        socket.on('game:surrender', async (data, callback) => {
            try {
                const { roomId } = data;

                const gameEngine = activeRooms.get(roomId);
                if (!gameEngine) {
                    return callback({
                        success: false,
                        message: '游戏不存在'
                    });
                }

                const result = gameEngine.surrender(userId);
                
                if (result.success) {
                    // 保存游戏记录
                    await saveGameRecord(roomId, gameEngine);
                    
                    // 更新用户统计
                    await updateUserStats(result);
                    
                    // 通知游戏结束
                    io.to(`room:${roomId}`).emit('game:ended', result);
                    
                    // 清理游戏实例
                    activeRooms.delete(roomId);
                    
                    logger.gameEvent('认输', {
                        roomId,
                        surrenderedBy: userId
                    });
                }

                callback(result);

            } catch (error) {
                logger.error('认输失败:', error);
                callback({
                    success: false,
                    message: '认输失败'
                });
            }
        });

        // ========== 观战相关事件 ==========

        // 加入观战
        socket.on('spectate:join', async (data, callback) => {
            try {
                const { roomId } = data;

                // 检查房间是否存在且正在进行游戏
                const room = await db.findOne(
                    'SELECT * FROM game_rooms WHERE id = ? AND status = "playing"',
                    [roomId]
                );

                if (!room) {
                    return callback({
                        success: false,
                        message: '游戏房间不存在或未开始'
                    });
                }

                // 检查观战人数限制
                const spectatorCount = await redis.get(`room:${roomId}:spectators`) || 0;
                if (parseInt(spectatorCount) >= room.max_spectators) {
                    return callback({
                        success: false,
                        message: '观战人数已满'
                    });
                }

                // 加入观战房间
                socket.join(`room:${roomId}:spectators`);
                await redis.incr(`room:${roomId}:spectators`);

                const gameEngine = activeRooms.get(roomId);
                const gameState = gameEngine ? gameEngine.getGameState() : null;

                callback({
                    success: true,
                    data: {
                        roomId,
                        gameState
                    }
                });

                logger.info(`用户 ${username} 开始观战房间 ${roomId}`);

            } catch (error) {
                logger.error('加入观战失败:', error);
                callback({
                    success: false,
                    message: '加入观战失败'
                });
            }
        });

        // 离开观战
        socket.on('spectate:leave', async (data) => {
            try {
                const { roomId } = data;
                socket.leave(`room:${roomId}:spectators`);
                await redis.decr(`room:${roomId}:spectators`);
                
                logger.info(`用户 ${username} 停止观战房间 ${roomId}`);
            } catch (error) {
                logger.error('离开观战失败:', error);
            }
        });

        // ========== 聊天相关事件 ==========

        // 房间聊天
        socket.on('chat:room', async (data) => {
            try {
                const { roomId, message } = data;

                if (!message || message.trim().length === 0) {
                    return;
                }

                // 简单的敏感词过滤（实际项目中应该使用更完善的过滤系统）
                const filteredMessage = filterSensitiveWords(message.trim());

                const chatMessage = {
                    id: Date.now(),
                    userId,
                    username,
                    message: filteredMessage,
                    timestamp: new Date().toISOString()
                };

                // 广播聊天消息
                io.to(`room:${roomId}`).emit('chat:message', chatMessage);

                logger.info(`房间聊天: ${username} 在房间 ${roomId} 发送消息`);

            } catch (error) {
                logger.error('房间聊天失败:', error);
            }
        });

        // ========== 断开连接处理 ==========

        socket.on('disconnect', async () => {
            try {
                // 清理用户socket映射
                userSockets.delete(userId);
                
                // 更新用户离线状态
                await redis.hset(`user:${userId}`, 'online', 'false');
                await redis.hdel(`user:${userId}`, 'socket_id');
                
                // 广播在线用户数量更新
                broadcastOnlineCount(io);
                
                logger.info(`用户 ${username} 断开连接`, { userId, socketId: socket.id });

            } catch (error) {
                logger.error('断开连接处理失败:', error);
            }
        });
    });
}

// 辅助函数

// 生成房间代码
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 广播在线用户数量
async function broadcastOnlineCount(io) {
    try {
        const onlineCount = userSockets.size;
        io.emit('online:count', { count: onlineCount });
    } catch (error) {
        logger.error('广播在线用户数量失败:', error);
    }
}

// 保存游戏记录
async function saveGameRecord(roomId, gameEngine) {
    try {
        const gameResult = gameEngine.getGameResult();
        const moves = gameEngine.getMoves();
        
        await db.insert('games', {
            room_id: roomId,
            player1_id: gameResult.player1Id,
            player2_id: gameResult.player2Id,
            winner_id: gameResult.winnerId,
            result: gameResult.result,
            moves: JSON.stringify(moves),
            duration: gameResult.duration,
            player1_rating_before: gameResult.player1RatingBefore,
            player2_rating_before: gameResult.player2RatingBefore,
            player1_rating_after: gameResult.player1RatingAfter,
            player2_rating_after: gameResult.player2RatingAfter
        });
        
        logger.gameEvent('游戏记录已保存', { roomId });
    } catch (error) {
        logger.error('保存游戏记录失败:', error);
    }
}

// 更新用户统计
async function updateUserStats(gameResult) {
    try {
        // 更新玩家1统计
        await updateSingleUserStats(gameResult.player1Id, gameResult.result === 'win' ? 'win' : 'loss', gameResult.player1RatingAfter);
        
        // 更新玩家2统计
        await updateSingleUserStats(gameResult.player2Id, gameResult.result === 'win' ? 'loss' : 'win', gameResult.player2RatingAfter);
        
    } catch (error) {
        logger.error('更新用户统计失败:', error);
    }
}

// 更新单个用户统计
async function updateSingleUserStats(userId, result, newRating) {
    try {
        const user = await db.findOne('SELECT * FROM users WHERE id = ?', [userId]);
        
        let updateData = {
            total_games: user.total_games + 1,
            rating: newRating
        };

        if (result === 'win') {
            updateData.wins = user.wins + 1;
            updateData.consecutive_wins = user.consecutive_wins + 1;
            updateData.max_consecutive_wins = Math.max(user.max_consecutive_wins, updateData.consecutive_wins);
        } else if (result === 'loss') {
            updateData.losses = user.losses + 1;
            updateData.consecutive_wins = 0;
        } else {
            updateData.draws = user.draws + 1;
        }

        // 更新段位等级
        updateData.rank_level = calculateRankLevel(newRating);

        await db.update('users', updateData, 'id = ?', [userId]);
        
    } catch (error) {
        logger.error('更新单个用户统计失败:', error);
    }
}

// 计算段位等级
function calculateRankLevel(rating) {
    if (rating >= 2000) return '大师';
    if (rating >= 1600) return '专家';
    if (rating >= 1200) return '高级';
    if (rating >= 800) return '中级';
    if (rating >= 500) return '初级';
    return '新手';
}

// 敏感词过滤
function filterSensitiveWords(message) {
    const sensitiveWords = ['傻逼', '操你妈', '去死', '垃圾']; // 实际项目中应该从配置文件或数据库读取
    let filteredMessage = message;
    
    sensitiveWords.forEach(word => {
        const regex = new RegExp(word, 'gi');
        filteredMessage = filteredMessage.replace(regex, '*'.repeat(word.length));
    });
    
    return filteredMessage;
}

module.exports = socketHandler;