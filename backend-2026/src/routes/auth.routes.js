const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const authController = require('../controllers/auth.controller');
const { refreshTokenController } = require('../controllers/auth.controller');

// ✅ Register
router.post('/signup', upload.single('picture'), authController.register);

// ✅ Login
router.post('/signin', authController.login);

// ✅ Logout
router.post('/logout', authController.logout);

// ✅ Refresh token
router.post('/refresh-token', refreshTokenController);

// ✅ Forgot password
router.post('/forgot-password', authController.forgotPassword);

// ✅ Reset password
router.post('/reset-password', authController.resetPassword);

// ✅ Verify code
router.post('/verify-code', authController.verifyCode);

module.exports = router;