// models/magictoken.js
const mongoose = require("mongoose");

const magicTokenSchema = new mongoose.Schema({
    jti: { type: String, required: true, unique: true }, // JWT ID unique
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    used: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
    codeHash: { type: String, required: false }, // added codeHash
}, { timestamps: true });

// Suppression automatique par MongoDB après expiration
magicTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("MagicToken", magicTokenSchema);