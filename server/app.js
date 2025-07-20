const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cron = require('node-cron');

// 导入配置和中间件
const config = require('./config/config');
const dbConnection = require('./config/database');
const redisClient = require('./config/redis');
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// 导入路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const gameRoutes = require('./routes/game');
const roomRoutes = require('./routes/room');
const appointmentRoutes = require('./routes/appointment');
const leaderboardRoutes = require('./routes/leaderboard');
const friendRoutes = require('./routes/friend');

// 导入Socket处理
const socketHandler = require('./services/socketHandler');

// 导入定时任务
const scheduledTasks = require('./services/scheduledTasks');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? ['https://oqo.us'] 
            : ['http://localhost:3000', 'http://localhost:8080'],
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// 安全中间件
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            scriptSrc: ["'self'"],
            connectSrc: ["'self'", "ws:", "wss:"]
        }
    }
}));

// 速率限制
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 100, // 每个IP最多100个请求
    message: {
        error: '请求过于频繁，请稍后再试'
    }
});
app.use(limiter);

// CORS配置
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://oqo.us'] 
        : ['http://localhost:3000', 'http://localhost:8080'],
    credentials: true
}));

// 基础中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(path.join(__dirname, '../dist')));

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/games', authMiddleware, gameRoutes);
app.use('/api/rooms', authMiddleware, roomRoutes);
app.use('/api/appointments', authMiddleware, appointmentRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/friends', authMiddleware, friendRoutes);

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// OAuth回调处理
app.get('/auth/callback', require('./controllers/authController').handleOAuthCallback);

// SPA路由处理
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Socket.IO连接处理
io.on('connection', (socket) => {
    logger.info(`用户连接: ${socket.id}`);
    socketHandler(io, socket);
});

// 错误处理中间件
app.use(errorHandler);

// 启动定时任务
scheduledTasks.start();

// 优雅关闭处理
process.on('SIGTERM', async () => {
    logger.info('收到SIGTERM信号，开始优雅关闭...');
    
    server.close(() => {
        logger.info('HTTP服务器已关闭');
    });
    
    try {
        await dbConnection.end();
        logger.info('数据库连接已关闭');
        
        await redisClient.quit();
        logger.info('Redis连接已关闭');
        
        process.exit(0);
    } catch (error) {
        logger.error('关闭过程中出现错误:', error);
        process.exit(1);
    }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    logger.info(`服务器运行在端口 ${PORT}`);
    logger.info(`环境: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;