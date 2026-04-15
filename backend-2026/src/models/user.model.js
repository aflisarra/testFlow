const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
 password: {
  type: String,
  required: true,
},


  picture: { type: String },
    language: {
    type: String,
    enum: ['fr', 'en','es'], // pour éviter les valeurs invalides
    default: 'fr'       // Français par défaut
  },
  // Keep role name, but also store a reference to the Role document.
  roleId: { type: Number, ref: 'Role' },
  role: {
    type: String,
    required: true,
  },
  description: String,
  refreshToken: { type: String } ,// 👈 ajouté pour stocker le refresh


   resetCode: { type: String }, // Code temporaire de réinitialisation du mot de passe
  resetCodeExpires: { type: Date },
});

module.exports = mongoose.model('User', userSchema);
