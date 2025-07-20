const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// 验证中间件
const validateEmail = body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('请输入有效的邮箱地址');

const validatePassword = body('password')
    .isLength({ min: 6 })
    .withMessage('密码长度至少6位');

const validateUsername = body('username')
    .isLength({ min: 2, max: 20 })
    .matches(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/)
    .withMessage('用户名只能包含字母、数字、下划线和中文字符');

const validateVerificationCode = body('verificationCode')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('验证码必须是6位数字');

// OAuth2相关路由
router.get('/oauth/url', asyncHandler(authController.getOAuthUrl));

// 邮箱认证路由
router.post('/email/send-verification', 
    validateEmail,
    asyncHandler(authController.sendEmailVerification)
);

router.post('/email/register',
    [validateUsername, validateEmail, validatePassword, validateVerificationCode],
    asyncHandler(authController.registerWithEmail)
);

router.post('/email/login',
    [validateEmail, validatePassword],
    asyncHandler(authController.loginWithEmail)
);

// 令牌管理路由
router.post('/refresh', asyncHandler(authController.refreshToken));
router.post('/logout', authenticateToken, asyncHandler(authController.logout));

// 用户信息路由
router.get('/me', authenticateToken, asyncHandler(authController.getCurrentUser));

module.exports = router;