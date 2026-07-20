const authMagicService = require('../services/auth.magic.service');
const MESSAGES = require('../constants/messages')
/**
 * POST /auth/forgot-password
 * Send password reset email with magic link
 */
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const result = await authMagicService.sendForgotPasswordEmail(email);
        return res.json(result);
    } catch (err) {
        console.error(MESSAGES.USER.FORGOT_PASSWORD, err);
        return res.status(500).json({ message: MESSAGES.ERROR.SERVER });
    }
};

/**
 * POST /auth/verify-magic-token
 * Verify token from URL query param and return reset token for next step
 */
exports.verifyMagicToken = async (req, res) => {
    try {
        const { token } = req.body;
        const result = await authMagicService.verifyMagicToken(token);
        return res.json(result);
    } catch (err) {
        console.error(MESSAGES.USER.VERIFY_MAGIC, err);
        const status = err.message.includes(MESSAGES.USER.EXPIRE) ? 400 : 500;
        return res.status(status).json({ message: err.message });
    }
};

/**
 * POST /auth/verify-otp
 * Fallback: Verify OTP code sent by email
 */
exports.verifyOTP = async (req, res) => {
    try {
        const { email, code } = req.body;
        const result = await authMagicService.verifyOTP(email, code);
        return res.json(result);
    } catch (err) {
        console.error(MESSAGES.USER.VERIFY_OTP, err);
        const status = err.message.includes(MESSAGES.USER.INVALID) ? 400 : 500;
        return res.status(status).json({ message: err.message });
    }
};

/**
 * POST /auth/reset-password
 * Reset password using reset token
 */
exports.resetPassword = async (req, res) => {
    try {
        const { resetToken, password } = req.body;
        const result = await authMagicService.resetPassword(resetToken, password);
        return res.json(result);
    } catch (err) {
        console.error(MESSAGES.USER.RESET_PASSWORD, err);
        const status = err.message.includes(MESSAGES.USER.EXPIRE) || err.message.includes(MESSAGES.USER.MINIMUM) ? 400 : 500;
        return res.status(status).json({ message: err.message });
    }
};
