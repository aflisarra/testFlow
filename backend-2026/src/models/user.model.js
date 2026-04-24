const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: {
    type: String,
  },
  picture: { type: String },
  language: {
    type: String,
    enum: ['fr', 'en', 'es'],
    default: 'fr'
  },
  // Reference au document Role avec ObjectId (pas Number)
  roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  role: {
    type: String,
    required: true,
  },
  description: String,
  refreshToken: { type: String },
  resetCode: { type: String },
  resetCodeExpires: { type: Date },
});

module.exports = mongoose.model('User', userSchema);
