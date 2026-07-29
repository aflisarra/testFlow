const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const User = require('../models/user.model');
const MagicToken = require('../models/magictoken.model');
const { getJwtSecret } = require('../utils/jwt-secrets');

// ── SMTP Transporter Configuration ──
if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV !== 'production') {
        console.warn('⚠️ AVERTISSEMENT: SMTP_HOST est manquant dans .env. Les emails ne pourront pas être envoyés.');
    }
}

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

/**
 * Generate password reset email HTML template.
 * Input: magicUrl (string), code (string/number).
 * Output: HTML string.
 * @param {string} magicUrl - Frontend link containing the magic JWT token.
 * @param {string} code - 6-digit OTP code shown to the user.
 * @returns {string} HTML email body.
 */
const generatePasswordResetEmailTemplate = (magicUrl, code) => {
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family:sans-serif;max-inline-size:480px;margin:0 auto;padding:24px;color:#1e293b">
        <h2 style="margin-block-end:8px">Réinitialisation du mot de passe</h2>
        <p style="color:#64748b;margin-block-end:24px">
          Cliquez sur le bouton ci-dessous. Ce lien expire dans <strong>15 minutes</strong>.
        </p>
        <a href="${magicUrl}"
           style="display:inline-block;background:#EC8A00;color:#ffffff;
                  font-weight:700;padding:14px 32px;border-radius:8px;
                  text-decoration:none;font-size:15px;margin-block-end:32px">
          Réinitialiser mon mot de passe
        </a>
        <hr style="border:none;border-block-start:1px solid #e2e8f0;margin:24px 0"/>
        <p style="font-size:13px;color:#94a3b8;margin-block-end:8px">
          Le bouton ne fonctionne pas ? Utilisez ce code :
        </p>
        <div style="font-size:28px;font-weight:900;letter-spacing:10px;color:#EC8A00;margin-block-end:8px">
          ${code}
        </div>
        <p style="font-size:12px;color:#cbd5e1">
          Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
        </p>
      </body>
      </html>
    `;
};

/**
 * ÉTAPE 1 : Send forgot password email.
 * Input: email string.
 * Output: safe response message (always generic).
 * @param {string} email
 * @returns {Promise<{message:string}>}
 */
const sendForgotPasswordEmail = async (email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
        throw new Error('Email requis');
    }

    const SAFE_RESPONSE = { message: 'Si cet email existe, un lien a été envoyé.' };

    try {
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) return SAFE_RESPONSE;

        const jti = crypto.randomUUID();

        const token = jwt.sign(
            { userId: String(user._id), purpose: 'magic-reset', jti },
            getJwtSecret(),
            { expiresIn: '15m' }
        );

        const code = String(Math.floor(100000 + Math.random() * 900000));
        const codeHash = await bcrypt.hash(code, 10);

        // Delete previous tokens for this user
        await MagicToken.deleteMany({ userId: user._id });

        // Create new token record
        await MagicToken.create({
            jti,
            userId: user._id,
            codeHash,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:50766/';
        const magicUrl = `${frontendUrl}/reset-password?token=${token}`;

        // Generate email template
        const htmlContent = generatePasswordResetEmailTemplate(magicUrl, code);

        // Send email
        const info = await transporter.sendMail({
            from: '"Support" <support@test.com>',
            to: normalizedEmail,
            subject: 'Reset your password',
            html: htmlContent,
        });

        if (process.env.NODE_ENV !== 'production') {
            console.log('📨 Email sent. Preview URL:', nodemailer.getTestMessageUrl(info));
        }

        return SAFE_RESPONSE;

    } catch (err) {
        console.error('forgot-password error:', err);
        throw new Error('Erreur serveur', { cause: err });
    }
};

/**
 * ÉTAPE 2a : Verify magic token (from URL query param).
 * Input: magic token string (JWT).
 * Output: `{ resetToken, valid: true }` if valid.
 * @param {string} token
 * @returns {Promise<{resetToken:string,valid:true}>}
 */
const verifyMagicToken = async (token) => {
    if (!token) {
        throw new Error('Token requis');
    }

    // Verify JWT signature
    let decoded;
    try {
        decoded = jwt.verify(token, getJwtSecret());
    } catch {
        throw new Error('Lien invalide ou expiré');
    }

    if (decoded.purpose !== 'magic-reset') {
        throw new Error('Token invalide');
    }

    // Check that jti exists and hasn't been used yet (one-time use)
    const record = await MagicToken.findOne({ jti: decoded.jti });
    if (!record || record.used) {
        throw new Error('Lien déjà utilisé ou expiré');
    }

    // Generate short-lived reset token (5 min) for next step
    const resetToken = jwt.sign(
        { userId: decoded.userId, purpose: 'reset-password', jti: decoded.jti },
        getJwtSecret(),
        { expiresIn: '5m' }
    );

    return { resetToken, valid: true };
};

/**
 * ÉTAPE 2b : Verify OTP code (fallback).
 * Input: email string, code string (6 digits).
 * Output: `{ resetToken, valid: true }` if valid.
 * @param {string} email
 * @param {string} code
 * @returns {Promise<{resetToken:string,valid:true}>}
 */
const verifyOTP = async (email, code) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedCode = String(code || '').trim();

    if (!normalizedEmail || !normalizedCode) {
        throw new Error('Email et code requis');
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
        throw new Error('Code invalide');
    }

    const record = await MagicToken.findOne({ userId: user._id, used: false });
    if (!record) {
        throw new Error('Code invalide ou expiré');
    }

    const isValid = await bcrypt.compare(normalizedCode, record.codeHash);
    if (!isValid) {
        throw new Error('Code incorrect');
    }

    const resetToken = jwt.sign(
        { userId: String(user._id), purpose: 'reset-password', jti: record.jti },
        getJwtSecret(),
        { expiresIn: '5m' }
    );

    return { resetToken, valid: true };
};

/**
 * ÉTAPE 3 : Reset password.
 * Input: resetToken (JWT), newPassword (string).
 * Output: success message.
 * @param {string} resetToken
 * @param {string} newPassword
 * @returns {Promise<{message:string}>}
 */
const resetPassword = async (resetToken, newPassword) => {
    if (!resetToken || !newPassword) {
        throw new Error('Token et mot de passe requis');
    }

    if (newPassword.length < 8) {
        throw new Error('Minimum 8 caractères');
    }

    let decoded;
    try {
        decoded = jwt.verify(resetToken, getJwtSecret());
    } catch {
        throw new Error('Token expiré, recommencez');
    }

    if (decoded.purpose !== 'reset-password') {
        throw new Error('Token invalide');
    }

    // Mark jti as used → guarantee one-time use
    const record = await MagicToken.findOneAndUpdate(
        { jti: decoded.jti, used: false },
        { used: true },
        { new: true }
    );

    if (!record) {
        throw new Error('Token déjà utilisé');
    }

    // Hash and save new password
    const hashed = await bcrypt.hash(newPassword, 12);
    await User.findByIdAndUpdate(decoded.userId, { password: hashed });

    return { message: 'Mot de passe réinitialisé avec succès' };
};

module.exports = {
    sendForgotPasswordEmail,
    verifyMagicToken,
    verifyOTP,
    resetPassword,
};