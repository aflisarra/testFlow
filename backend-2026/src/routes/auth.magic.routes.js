const express = require('express');
const authMagicController = require('../controllers/auth.magic.controller');

const router = express.Router();

/**
 * ÉTAPE 1 : POST /auth/forgot-password
 * Send password reset email with magic link
 */
router.post('/forgot-password', authMagicController.forgotPassword);

/**
 * ÉTAPE 2a : POST /auth/verify-magic-token
 * Verify token from URL query param and return reset token
 */
router.post('/verify-magic-token', authMagicController.verifyMagicToken);

/**
 * ÉTAPE 2b : POST /auth/verify-otp
 * Fallback: Verify OTP code sent by email
 */
router.post('/verify-otp', authMagicController.verifyOTP);

/**
 * ÉTAPE 3 : POST /auth/reset-password
 * Reset password using reset token
 */
router.post('/reset-password', authMagicController.resetPassword);

module.exports = router;
