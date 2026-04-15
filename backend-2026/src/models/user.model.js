/**
 * ================================================================================
 * USER MODEL (user.model.js)
 * ================================================================================
 * 
 * PURPOSE:
 * Defines the MongoDB schema/structure for the User collection.
 * This model represents all registered users in the system.
 * 
 * SCHEMA FIELDS:
 * - name: User's display name (required, unique)
 * - email: User's email address (required, unique) - used for login
 * - password: Hashed password (required) - never stored in plaintext
 * - picture: Optional profile picture filename/path
 * - language: User's preferred language (fr/en/es), defaults to French
 * - roleId: Reference to Role document (Number type, links to roles collection)
 * - role: Role name string (admin/user/etc.) - stored for quick access
 * - description: Optional user bio/description
 * - refreshToken: JWT refresh token (stored for session persistence)
 * - resetCode: Temporary code for password reset functionality
 * - resetCodeExpires: Expiration time for the reset code
 * 
 * DEPENDENCIES:
 * - mongoose: MongoDB ODM for defining schemas and models
 * 
 * ================================================================================
 */

const mongoose = require('mongoose');

/**
 * User Schema Definition
 * Each field has a type and optional validation rules
 */
const userSchema = new mongoose.Schema({
  // User's display name (required, must be unique across all users)
  name: { type: String, required: true, unique: true },
  
  // User's email address (required, must be unique) - used as login identifier
  email: { type: String, required: true, unique: true },
  
  // User's password - ALWAYS hashed before storage (using bcrypt)
  // This field should NEVER be returned in API responses
  password: {
    type: String,
    required: true,
  },

  // Optional profile picture - stores the filename, served from /api/uploads/users/
  picture: { type: String },
  
  // User's preferred language for UI localization
  // Restricted to: French (fr), English (en), Spanish (es)
  // Defaults to French ('fr') for new users
  language: {
    type: String,
    enum: ['fr', 'en','es'], // pour éviter les valeurs invalides
    default: 'fr'       // Français par défaut
  },
  
  // Reference to the Role document (stores role ID for population)
  // Links to the 'Role' model for role-based access control
  // Keep role name, but also store a reference to the Role document.
  roleId: { type: Number, ref: 'Role' },
  
  // Role name (required) - stored as string for quick access without population
  // Common values: 'admin', 'user', 'manager', etc.
  role: {
    type: String,
    required: true,
  },
  
  // Optional user description/bio
  description: String,
  
  // JWT refresh token - stored to enable session persistence
  // When user logs in, this token is stored; used to generate new access tokens
  refreshToken: { type: String }, // 👈 ajouté pour stocker le reset

  // Password reset code (temporary, short-lived)
  // Generated when user requests password reset
  resetCode: { type: String }, // Code temporaire de réinitialisation du mot de passe
  
  // Expiration time for the reset code
  // Reset codes are typically valid for 1 hour
  resetCodeExpires: { type: Date },
});

// Export the User model for use throughout the application
// This creates a 'User' collection in MongoDB
module.exports = mongoose.model('User', userSchema);
