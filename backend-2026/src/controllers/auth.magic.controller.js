const authMagicService = require('../services/auth.magic.service');

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
        console.error('forgotPassword error:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
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
        console.error('verifyMagicToken error:', err);
        const status = err.message.includes('expiré') ? 400 : 500;
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
        console.error('verifyOTP error:', err);
        const status = err.message.includes('invalid') ? 400 : 500;
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
        console.error('resetPassword error:', err);
        const status = err.message.includes('expiré') || err.message.includes('Minimum') ? 400 : 500;
        return res.status(status).json({ message: err.message });
    }
};
