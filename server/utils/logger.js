const fs = require('fs');
const path = require('path');

// 确保日志目录存在
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// 日志级别
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

// 当前日志级别
const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

// 格式化时间
function formatTime(date = new Date()) {
    return date.toISOString().replace('T', ' ').slice(0, 19);
}

// 格式化日志消息
function formatMessage(level, message, meta = {}) {
    const timestamp = formatTime();
    const metaString = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] ${message}${metaString}`;
}

// 写入日志文件
function writeToFile(level, message) {
    const logFile = path.join(logDir, `${level.toLowerCase()}.log`);
    const logEntry = message + '\n';
    
    fs.appendFile(logFile, logEntry, (err) => {
        if (err) {
            console.error('写入日志文件失败:', err);
        }
    });
    
    // 同时写入综合日志
    const combinedLogFile = path.join(logDir, 'combined.log');
    fs.appendFile(combinedLogFile, logEntry, (err) => {
        if (err) {
            console.error('写入综合日志文件失败:', err);
        }
    });
}

// 日志记录器
class Logger {
    error(message, meta = {}) {
        if (currentLogLevel >= LOG_LEVELS.ERROR) {
            const formattedMessage = formatMessage('ERROR', message, meta);
            console.error(formattedMessage);
            writeToFile('ERROR', formattedMessage);
        }
    }

    warn(message, meta = {}) {
        if (currentLogLevel >= LOG_LEVELS.WARN) {
            const formattedMessage = formatMessage('WARN', message, meta);
            console.warn(formattedMessage);
            writeToFile('WARN', formattedMessage);
        }
    }

    info(message, meta = {}) {
        if (currentLogLevel >= LOG_LEVELS.INFO) {
            const formattedMessage = formatMessage('INFO', message, meta);
            console.info(formattedMessage);
            writeToFile('INFO', formattedMessage);
        }
    }

    debug(message, meta = {}) {
        if (currentLogLevel >= LOG_LEVELS.DEBUG) {
            const formattedMessage = formatMessage('DEBUG', message, meta);
            console.debug(formattedMessage);
            writeToFile('DEBUG', formattedMessage);
        }
    }

    // 记录HTTP请求
    request(req, res, responseTime) {
        const message = `${req.method} ${req.originalUrl} - ${res.statusCode} - ${responseTime}ms - ${req.ip}`;
        this.info(message, {
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            responseTime,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
    }

    // 记录游戏事件
    gameEvent(event, data = {}) {
        this.info(`游戏事件: ${event}`, data);
    }

    // 记录用户操作
    userAction(userId, action, data = {}) {
        this.info(`用户操作: ${action}`, {
            userId,
            action,
            ...data
        });
    }

    // 记录安全事件
    security(event, data = {}) {
        this.warn(`安全事件: ${event}`, data);
    }
}

// 创建日志清理任务
function cleanOldLogs() {
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
    const now = Date.now();

    fs.readdir(logDir, (err, files) => {
        if (err) return;

        files.forEach(file => {
            const filePath = path.join(logDir, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;

                if (now - stats.mtime.getTime() > maxAge) {
                    fs.unlink(filePath, (err) => {
                        if (!err) {
                            console.log(`删除旧日志文件: ${file}`);
                        }
                    });
                }
            });
        });
    });
}

// 每天清理一次旧日志
setInterval(cleanOldLogs, 24 * 60 * 60 * 1000);

module.exports = new Logger();