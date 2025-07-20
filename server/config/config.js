module.exports = {
    // 数据库配置
    database: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'password',
        database: process.env.DB_NAME || 'nl_chess',
        charset: 'utf8mb4',
        timezone: '+08:00',
        acquireTimeout: 60000,
        timeout: 60000,
        reconnect: true
    },

    // Redis配置
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || '',
        db: 0,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxRetriesPerRequest: null
    },

    // JWT配置
    jwt: {
        secret: process.env.JWT_SECRET || 'your_super_secret_jwt_key_here',
        expiresIn: '7d',
        refreshExpiresIn: '30d'
    },

    // NodeLoc OAuth2配置
    oauth: {
        clientId: 'd91699453e85d61454ecca3f2e41b556',
        clientSecret: process.env.NODELOC_CLIENT_SECRET,
        authUrl: 'http://conn.nodeloc.cc/oauth2/auth',
        tokenUrl: 'http://conn.nodeloc.cc/oauth2/token',
        userInfoUrl: 'http://conn.nodeloc.cc/oauth2/userinfo',
        redirectUri: 'https://oqo.us/auth/callback',
        scope: 'openid profile'
    },

    // 邮件配置
    email: {
        service: 'gmail', // 或其他邮件服务
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT || 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        }
    },

    // 游戏配置
    game: {
        // 积分规则
        scoring: {
            win: 10,
            loss: -5,
            draw: 0,
            consecutiveWinBonus: 2,
            firstWinOfDayMultiplier: 2,
            minConsecutiveWinsForBonus: 3
        },
        
        // AI难度配置
        aiLevels: {
            beginner: { depth: 2, rating: 800 },
            intermediate: { depth: 3, rating: 1200 },
            advanced: { depth: 4, rating: 1600 },
            expert: { depth: 5, rating: 2000 }
        },

        // 游戏时间限制（秒）
        timeLimit: {
            blitz: 180,      // 3分钟快棋
            rapid: 600,      // 10分钟快棋
            standard: 1800,  // 30分钟标准局
            unlimited: -1    // 不限时
        },

        // 房间配置
        room: {
            maxSpectators: 50,
            codeLength: 6,
            defaultTimeLimit: 600
        }
    },

    // 排行榜配置
    leaderboard: {
        topPlayersCount: 100,
        updateInterval: '0 */10 * * * *', // 每10分钟更新一次
        categories: ['rating', 'wins', 'winRate', 'consecutiveWins']
    },

    // 通知配置
    notification: {
        appointmentReminderMinutes: 10,
        maxUnreadNotifications: 100
    },

    // 安全配置
    security: {
        bcryptRounds: 12,
        maxLoginAttempts: 5,
        lockoutTime: 15 * 60 * 1000, // 15分钟
        sessionTimeout: 24 * 60 * 60 * 1000, // 24小时
        csrfTokenLength: 32
    },

    // 文件上传配置
    upload: {
        maxFileSize: 5 * 1024 * 1024, // 5MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif'],
        uploadPath: 'uploads/'
    },

    // 缓存配置
    cache: {
        defaultTTL: 300, // 5分钟
        leaderboardTTL: 600, // 10分钟
        userProfileTTL: 1800, // 30分钟
        gameStatsTTL: 3600 // 1小时
    },

    // 日志配置
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'combined',
        maxFiles: 10,
        maxSize: '10m'
    },

    // 应用配置
    app: {
        name: 'NL象棋',
        version: '1.0.0',
        description: '中国象棋在线对战平台',
        baseUrl: process.env.BASE_URL || 'https://oqo.us',
        port: process.env.PORT || 3000,
        env: process.env.NODE_ENV || 'development'
    }
};