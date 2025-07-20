const logger = require('../utils/logger');

// 自定义错误类
class AppError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.name = this.constructor.name;

        Error.captureStackTrace(this, this.constructor);
    }
}

// 验证错误类
class ValidationError extends AppError {
    constructor(message, field = null) {
        super(message, 400);
        this.field = field;
        this.name = 'ValidationError';
    }
}

// 认证错误类
class AuthenticationError extends AppError {
    constructor(message = '认证失败') {
        super(message, 401);
        this.name = 'AuthenticationError';
    }
}

// 授权错误类
class AuthorizationError extends AppError {
    constructor(message = '权限不足') {
        super(message, 403);
        this.name = 'AuthorizationError';
    }
}

// 资源未找到错误类
class NotFoundError extends AppError {
    constructor(message = '资源未找到') {
        super(message, 404);
        this.name = 'NotFoundError';
    }
}

// 冲突错误类
class ConflictError extends AppError {
    constructor(message = '资源冲突') {
        super(message, 409);
        this.name = 'ConflictError';
    }
}

// 速率限制错误类
class RateLimitError extends AppError {
    constructor(message = '请求过于频繁') {
        super(message, 429);
        this.name = 'RateLimitError';
    }
}

// 处理数据库错误
function handleDatabaseError(error) {
    let message = '数据库操作失败';
    let statusCode = 500;

    // MySQL错误处理
    if (error.code) {
        switch (error.code) {
            case 'ER_DUP_ENTRY':
                message = '数据重复，该记录已存在';
                statusCode = 409;
                break;
            case 'ER_NO_REFERENCED_ROW_2':
                message = '关联的数据不存在';
                statusCode = 400;
                break;
            case 'ER_ROW_IS_REFERENCED_2':
                message = '无法删除，该数据被其他记录引用';
                statusCode = 400;
                break;
            case 'ER_DATA_TOO_LONG':
                message = '数据长度超出限制';
                statusCode = 400;
                break;
            case 'ER_BAD_NULL_ERROR':
                message = '必填字段不能为空';
                statusCode = 400;
                break;
            case 'ECONNREFUSED':
                message = '数据库连接被拒绝';
                statusCode = 503;
                break;
            case 'ETIMEDOUT':
                message = '数据库连接超时';
                statusCode = 503;
                break;
            default:
                logger.error('未处理的数据库错误:', error);
        }
    }

    return new AppError(message, statusCode);
}

// 处理验证错误
function handleValidationError(error) {
    const errors = [];
    
    if (error.errors) {
        error.errors.forEach(err => {
            errors.push({
                field: err.path || err.param,
                message: err.msg || err.message,
                value: err.value
            });
        });
    }

    return {
        message: '数据验证失败',
        statusCode: 400,
        errors
    };
}

// 主错误处理中间件
function errorHandler(error, req, res, next) {
    let err = error;

    // 记录错误日志
    logger.error('应用错误:', {
        message: error.message,
        stack: error.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        user: req.user?.id || 'anonymous'
    });

    // 处理不同类型的错误
    if (error.name === 'ValidationError' && error.errors) {
        const validationError = handleValidationError(error);
        return res.status(validationError.statusCode).json({
            success: false,
            message: validationError.message,
            errors: validationError.errors
        });
    }

    // 处理数据库错误
    if (error.code && (error.code.startsWith('ER_') || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT')) {
        err = handleDatabaseError(error);
    }

    // 处理JWT错误
    if (error.name === 'JsonWebTokenError') {
        err = new AuthenticationError('无效的访问令牌');
    } else if (error.name === 'TokenExpiredError') {
        err = new AuthenticationError('访问令牌已过期');
    }

    // 处理Mongoose Cast错误
    if (error.name === 'CastError') {
        err = new ValidationError('无效的数据格式');
    }

    // 确保错误有状态码
    if (!err.statusCode) {
        err = new AppError(err.message || '服务器内部错误', 500);
    }

    // 开发环境返回详细错误信息
    if (process.env.NODE_ENV === 'development') {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            error: {
                name: err.name,
                stack: err.stack
            }
        });
    }

    // 生产环境只返回操作性错误的详细信息
    if (err.isOperational) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message
        });
    }

    // 非操作性错误返回通用错误信息
    return res.status(500).json({
        success: false,
        message: '服务器内部错误，请稍后重试'
    });
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
    logger.error('未捕获的异常:', error);
    process.exit(1);
});

// 处理未处理的Promise拒绝
process.on('unhandledRejection', (reason, promise) => {
    logger.error('未处理的Promise拒绝:', reason);
    process.exit(1);
});

// 404处理中间件
function notFoundHandler(req, res, next) {
    const error = new NotFoundError(`路由 ${req.originalUrl} 不存在`);
    next(error);
}

// 异步错误处理包装器
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

module.exports = {
    errorHandler,
    notFoundHandler,
    asyncHandler,
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    RateLimitError
};