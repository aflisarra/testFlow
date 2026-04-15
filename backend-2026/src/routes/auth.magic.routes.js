// routes/auth.magic.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const User = require("../models/user.model");
const MagicToken = require("../models/magictoken.model");

const router = express.Router();

// ── SMTP Transporter Configuration ──
if (!process.env.SMTP_HOST) {
    console.warn("⚠️ AVERTISSEMENT: SMTP_HOST est manquant dans .env. Les emails ne pourront pas être envoyés.");
}

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false, // true s'il s'agit du port 465, false pour 587 avec STARTTLS
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// ── ÉTAPE 1 : POST /auth/forgot-password ───────────────────
router.post("/forgot-password", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "Email requis" });

    const SAFE_RESPONSE = { message: "Si cet email existe, un lien a été envoyé." };

    try {
        const user = await User.findOne({ email });
        if (!user) return res.json(SAFE_RESPONSE);

        const jti = crypto.randomUUID();

        const token = jwt.sign(
            { userId: String(user._id), purpose: "magic-reset", jti },
            process.env.JWT_SECRET,
            { expiresIn: "15m" }
        );

        const code = String(Math.floor(100000 + Math.random() * 900000));
        const codeHash = await bcrypt.hash(code, 10);

        await MagicToken.deleteMany({ userId: user._id });

        await MagicToken.create({
            jti,
            userId: user._id,
            codeHash,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });

        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:4200";
        const magicUrl = `${frontendUrl}/reset-password?token=${token}`;

        const info = await transporter.sendMail({
            from: '"Support" <support@test.com>',
            to: email,
            subject: "Réinitialiser votre mot de passe",
            html: `
              <!DOCTYPE html>
              <html>
              <body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e293b">
                <h2 style="margin-bottom:8px">Réinitialisation du mot de passe</h2>
                <p style="color:#64748b;margin-bottom:24px">
                  Cliquez sur le bouton ci-dessous. Ce lien expire dans <strong>15 minutes</strong>.
                </p>
                <a href="${magicUrl}"
                   style="display:inline-block;background:#EC8A00;color:#ffffff;
                          font-weight:700;padding:14px 32px;border-radius:8px;
                          text-decoration:none;font-size:15px;margin-bottom:32px">
                  Réinitialiser mon mot de passe
                </a>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
                <p style="font-size:13px;color:#94a3b8;margin-bottom:8px">
                  Le bouton ne fonctionne pas ? Utilisez ce code :
                </p>
                <div style="font-size:28px;font-weight:900;letter-spacing:10px;color:#EC8A00;margin-bottom:8px">
                  ${code}
                </div>
                <p style="font-size:12px;color:#cbd5e1">
                  Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
                </p>
              </body>
              </html>
            `,
        });

        // ✅ Lien pour voir l'email dans le navigateur
        console.log("📨 Preview URL:", nodemailer.getTestMessageUrl(info));

        return res.json(SAFE_RESPONSE);

    } catch (err) {
        console.error("forgot-password error:", err);
        return res.status(500).json({ message: "Server error" });
    }
});

// ... reste du fichier inchangé


// ── ÉTAPE 2a : POST /auth/verify-magic-token ───────────────
// Appelé quand Angular lit le ?token= dans l'URL
router.post("/verify-magic-token", async (req, res) => {
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ message: "Token requis" });

    try {
        // Vérifier la signature JWT
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch {
            return res.status(400).json({ message: "Invalid or expired link" });
        }

        if (decoded.purpose !== "magic-reset") {
            return res.status(400).json({ message: "Invalid token" });
        }

        // Verify the jti exists and has not been used (single-use)
        const record = await MagicToken.findOne({ jti: decoded.jti });
        if (!record || record.used) {
            return res.status(400).json({ message: "Link already used or expired" });
        }

        // Valid token → return a short resetToken (5 min) for the next step
        const resetToken = jwt.sign(
            { userId: decoded.userId, purpose: "reset-password", jti: decoded.jti },
            process.env.JWT_SECRET,
            { expiresIn: "5m" }
        );

        return res.json({ resetToken, valid: true });

    } catch (err) {
        return res.status(500).json({ message: "Server error" });
    }
});


// ── ÉTAPE 2b : POST /auth/verify-otp (fallback code) ───────
router.post("/verify-otp", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.code || "").trim();

    if (!email || !code) return res.status(400).json({ message: "Email and code are required" });

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: "Invalid code" });

        const record = await MagicToken.findOne({ userId: user._id, used: false });
        if (!record) return res.status(400).json({ message: "Invalid or expired code" });

        const isValid = await bcrypt.compare(code, record.codeHash);
        if (!isValid) return res.status(400).json({ message: "Incorrect code" });

        const resetToken = jwt.sign(
            { userId: String(user._id), purpose: "reset-password", jti: record.jti },
            process.env.JWT_SECRET,
            { expiresIn: "5m" }
        );

        return res.json({ resetToken, valid: true });

    } catch (err) {
        return res.status(500).json({ message: "Server error" });
    }
});


// ── ÉTAPE 3 : POST /auth/reset-password ────────────────────
router.post("/reset-password", async (req, res) => {
    const resetToken = String(req.body?.resetToken || "").trim();
    const newPassword = String(req.body?.password || "").trim();

    if (!resetToken || !newPassword)
        return res.status(400).json({ message: "Token and password are required" });
    if (newPassword.length < 8)
        return res.status(400).json({ message: "Minimum 8 characters" });

    try {
        let decoded;
        try {
            decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
        } catch {
            return res.status(400).json({ message: "Token expired, please retry" });
        }

        if (decoded.purpose !== "reset-password")
            return res.status(400).json({ message: "Invalid token" });

        // Marquer le jti comme utilisé → usage unique garanti
        const record = await MagicToken.findOneAndUpdate(
            { jti: decoded.jti, used: false },
            { used: true },
            { new: true }
        );
        if (!record) return res.status(400).json({ message: "Token already used" });

        // Hash and save
        const hashed = await bcrypt.hash(newPassword, 12);
        await User.findByIdAndUpdate(decoded.userId, { password: hashed });

        return res.json({ message: "Password reset successfully" });

    } catch (err) {
        return res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;