/**
 * ================================================================================
 * AUTHENTICATION SERVICE (auth.service.js)
 * ================================================================================
 * 
 * PURPOSE:
 * This service handles all authentication-related operations including:
 * - User registration (signup)
 * - User login
 * - Token generation (access and refresh tokens)
 * - Token refresh
 * 
 * DEPENDENCIES:
 * - bcrypt: Password hashing for secure storage
 * - jsonwebtoken: JWT token generation and verification
 * - crypto: For generating random tokens (reset codes)
 * - User model: MongoDB user collection
 * - Role model: MongoDB roles collection
 * - Action model: MongoDB permissions/actions collection
 * 
 * ================================================================================
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Import MongoDB models
const User = require('../models/user.model');
const Role = require('../models/role.model');
const Action = require('../models/action.model');

/**
 * ================================================================================
 * ENVIRONMENT VARIABLE HELPERS
 * ================================================================================
 * These functions retrieve and validate required environment variables.
 * Throws an error if the required variable is not set.
 * ================================================================================
 */

/**
 * Get a required environment variable or throw an error
 * @param {string} name - Environment variable name
 * @returns {string} The value of the environment variable
 * @throws {Error} If the variable is not set
 */
function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * ================================================================================
 * TOKEN GENERATION FUNCTIONS
 * ================================================================================
 * These functions create JWT tokens for authentication.
 * Access tokens are short-lived (1 hour) for security.
 * Refresh tokens are longer-lived (7 days) to allow session persistence.
 * ================================================================================
 */

/**
 * Generate a JWT token (access token)
 * @param {Object} payload - Data to encode in the token
 * @returns {string} Signed JWT token
 */
function generateToken(payload) {
  const secret = getRequiredEnv('JWT_SECRET');
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

/**
 * Generate an access token (short-lived, 1 hour)
 * @param {Object} payload - Data to encode in the token
 * @returns {string} Signed JWT access token
 */
function generateAccessToken(payload) {
  return generateToken(payload);
}

/**
 * Generate a refresh token (long-lived, 7 days)
 * @param {Object} payload - Data to encode in the token
 * @returns {string} Signed JWT refresh token
 */
function generateRefreshToken(payload) {
  const refreshSecret = getRequiredEnv('JWT_REFRESH_SECRET');
  return jwt.sign(payload, refreshSecret, { expiresIn: '7d' });
}

/**
 * ================================================================================
 * EMAIL SERVICE (Placeholder/Fallback)
 * ================================================================================
 * This is a fallback implementation that logs email to console.
 * In production, this would integrate with an email provider (SendGrid, etc.)
 * ================================================================================
 */

/**
 * Send an email (placeholder implementation)
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject line
 * @param {string} message - Email body content
 * @returns {boolean} Returns true (logs to console in fallback mode)
 */
async function sendEmail(to, subject, message) {
  // Fallback implementation to avoid runtime crashes when no mail provider is configured.
  console.log('[MAIL]', { to, subject, message });
  return true;
}

/**
 * ================================================================================
 * USER REGISTRATION
 * ================================================================================
 * Creates a new user account with hashed password.
 * The first user registered becomes admin automatically.
 * Subsequent users are assigned 'user' role by default.
 * ================================================================================
 */

/**
 * Register a new user
 * @param {Object} params - User registration data
 * @param {string} params.name - User's display name
 * @param {string} params.email - User's email address (must be unique)
 * @param {string} params.password - User's plaintext password (will be hashed)
 * @param {string} params.picture - Optional profile picture filename
 * @param {string} params.roleName - Desired role (optional, 'user' by default)
 * @returns {Object} Newly created user object
 * @throws {Error} If email is already in use or role is invalid
 */
const registerUser = async ({ name, email, password, picture, roleName }) => {
  // Check if user with this email already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) throw new Error('Email already in use');

  // Hash the password using bcrypt with 10 salt rounds
  const hashedPassword = await bcrypt.hash(password, 10);
  
  // Check existing users to determine role assignment
  const existingUsers = await User.find();
  
  // First user becomes admin automatically
  // Other users default to 'user' role unless specified
  const role = existingUsers.length === 0 ? 'admin' : (roleName || 'user');

  const isFirstUser = existingUsers.length === 0;

  // Signup rules:
  // - First user becomes admin.
  // - Other users can only pick an existing role (except admin). If none provided, defaults to "user".
  let desiredRole = isFirstUser ? 'admin' : ((roleName || 'user').trim() || 'user');
  if (!isFirstUser && desiredRole === 'admin') {
    throw new Error('Cannot assign admin role on signup');
  }

  // Find or create the role document
  let roleDoc = await Role.findOne({ name: desiredRole });
  if (!roleDoc) {
    if (desiredRole === 'user') {
      // Create default user role with no permissions
      roleDoc = await Role.create({ name: 'user', description: 'Basic access', actions: [] });
    } else if (desiredRole === 'admin') {
      // Admin gets all permissions
      const actions = (await Action.find({})).map((a) => a._id);
      roleDoc = await Role.create({ name: 'admin', description: 'Full access', actions });
    } else {
      throw new Error('Role not found');
    }
  }

  // Create the new user with hashed password and role
  const newUser = new User({
    name,
    email,
    password: hashedPassword,
    picture: picture ? `/api/uploads/users/${picture}` : null,
    roleId: roleDoc._id,
    role: roleDoc.name,
  });

  // Save user to database
  await newUser.save();
  return newUser;
};

/**
 * ================================================================================
 * TOKEN REFRESH
 * ================================================================================
 * Validates a refresh token and issues new access/refresh tokens.
 * This allows users to stay logged in without re-entering credentials.
 * ================================================================================
 */

/**
 * Refresh access and refresh tokens
 * @param {string} refreshTokenValue - The refresh token from the client
 * @returns {Object} Object containing new accessToken and refreshToken, or error
 */
async function refreshToken(refreshTokenValue) {
  if (!refreshTokenValue) {
    return { error: 'No refresh token provided' };
  }

  try {
    const refreshSecret = getRequiredEnv('JWT_REFRESH_SECRET');
    
    // Verify the refresh token
    const decoded = jwt.verify(refreshTokenValue, refreshSecret);
    
    // Find the user associated with this token
    const user = await User.findById(decoded.userId);

    // Validate that the refresh token matches the one stored in DB
    if (!user || user.refreshToken !== refreshTokenValue) {
      return { error: 'Invalid refresh token' };
    }

    // Get user's role and permissions
    const roleData = user.roleId
      ? await Role.findById(user.roleId)
      : await Role.findOne({ name: user.role });
    const actions = roleData?.actions || [];

    // Build the payload for new tokens
    const payload = {
      userId: user._id,
      name: user.name,
      email: user.email,
      picture: user.picture || null,
      role: user.role,
      roleId: user.roleId,
      actions
    };
    
    // Generate new tokens
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

    // Store the new refresh token in database (rotation)
    user.refreshToken = newRefreshToken;
    await user.save();

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  } catch {
    return { error: 'Invalid or expired refresh token' };
  }
}

/**
 * ================================================================================
 * USER LOGIN
 * ================================================================================
 * Validates user credentials and returns tokens + user info.
 * ================================================================================
 */

/**
 * Login a user with email and password
 * @param {Object} params - Login credentials
 * @param {string} params.email - User's email address
 * @param {string} params.password - User's plaintext password
 * @returns {Object} Object containing accessToken, refreshToken, and user data
 * @throws {Error} If credentials are invalid
 */
const loginUser = async ({ email, password }) => {
  // Find user by email
  const user = await User.findOne({ email });
  if (!user) throw new Error('Invalid email or password');

  // Compare provided password with stored hashed password
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error('Invalid email or password');

  // Get user's role and permissions
  const roleData = user.roleId
    ? await Role.findById(user.roleId)
    : await Role.findOne({ name: user.role });
  const actions = roleData?.actions || [];

  // Build payload for tokens
  const payload = {
    userId: user._id,
    name: user.name,
    email: user.email,
    picture: user.picture || null,
    role: user.role,
    roleId: user.roleId,
    actions,
  };

  // Generate tokens
  const accessToken = generateAccessToken(payload);
  const refreshTokenValue = generateRefreshToken(payload);

  // Store refresh token in database for future token refresh
  user.refreshToken = refreshTokenValue;
  await user.save();

  return {
    accessToken,
    refreshToken: refreshTokenValue,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      picture: user.picture || null,
      role: user.role,
      roleId: user.roleId,
      actions,
    },
  };
};

/**
 * ================================================================================
 * EXPORTS
 * ================================================================================
 * Export all authentication functions for use in controllers/routes
 * ================================================================================
 */

module.exports = {
  registerUser,
  loginUser,
  generateToken,
  generateAccessToken,
  generateRefreshToken,
  refreshToken,
};
