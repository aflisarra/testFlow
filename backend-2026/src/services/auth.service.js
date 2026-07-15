const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');

const User = require('../models/user.model');
const Role = require('../models/role.model');
const Action = require('../models/action.model');
const { getJwtSecret, getJwtRefreshSecret } = require('../utils/jwt-secrets');
const { isMongoObjectId } = require('../utils/mongo-objectid');

/**
 * Create a signed JWT access token.
 * @param {object} payload - Token payload (e.g. userId, email, role, actions).
 * @returns {string} Signed JWT access token (1h expiration).
 */
function generateToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '1h' });
}

/**
 * Alias for generating an access token.
 * @param {object} payload - Token payload.
 * @returns {string} Signed JWT access token (1h expiration).
 */
function generateAccessToken(payload) {
  return generateToken(payload);
}

/**
 * Create a signed JWT refresh token.
 * @param {object} payload - Token payload (should include userId).
 * @returns {string} Signed JWT refresh token (7d expiration).
 */
function generateRefreshToken(payload) {
  return jwt.sign(payload, getJwtRefreshSecret(), { expiresIn: '7d' });
}

/**
 * Send an email (fallback stub).
 * Input: `to`, `subject`, `message` (string values).
 * Output: boolean success.
 * @param {string} to - Recipient email.
 * @param {string} subject - Subject line.
 * @param {string} message - Email body (plain text or HTML depending on provider).
 * @returns {Promise<boolean>} Always resolves true in this fallback implementation.
 */
async function sendEmail(to, subject, message) {
  // Fallback implementation to avoid runtime crashes when no mail provider is configured.
  return true;
}

/**
 * Register a new user account.
 * Input: user identity fields + optional role name.
 * Output: the created User mongoose document.
 * @param {{name:string,email:string,password:string,picture?:string|null,roleName?:string}} params
 * @returns {Promise<any>} Created user document.
 */
const registerUser = async ({ name, email, password, picture, roleName }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) throw new Error('Email already in use');

  const hashedPassword = await bcrypt.hash(password, 10);
  const existingUsers = await User.find();
  const role = existingUsers.length === 0 ? 'admin' : (roleName || 'user');

  const isFirstUser = existingUsers.length === 0;

  // Signup rules:
  // - First user becomes admin.
  // - Other users can only pick an existing role (except admin). If none provided, defaults to "user".
  let desiredRole = isFirstUser ? 'admin' : ((roleName || 'user').trim() || 'user');
  if (!isFirstUser && desiredRole === 'admin') {
    throw new Error('Cannot assign admin role on signup');
  }

  let roleDoc = await Role.findOne({ name: desiredRole });
  if (!roleDoc) {
    if (desiredRole === 'user') {
      roleDoc = await Role.create({ name: 'user', description: 'Basic access', actions: [] });
    } else if (desiredRole === 'admin') {
      const actions = (await Action.find({})).map((a) => a._id);
      roleDoc = await Role.create({ name: 'admin', description: 'Full access', actions });
    } else {
      throw new Error('Role not found');
    }
  }

  const newUser = new User({
    name,
    email: normalizedEmail,
    password: hashedPassword,
    picture: picture ? `/api/uploads/users/${picture}` : null,
    roleId: roleDoc._id,
    role: roleDoc.name,
  });

  await newUser.save();
  return newUser;
};

/**
 * Refresh access/refresh tokens from a refresh token value.
 * Input: refreshToken string.
 * Output: `{ accessToken, refreshToken }` on success or `{ error }` on failure.
 * @param {string} refreshTokenValue
 * @returns {Promise<{accessToken?:string,refreshToken?:string,error?:string}>}
 */
async function refreshToken(refreshTokenValue) {
  if (!refreshTokenValue) {
    return { error: 'No refresh token provided' };
  }

  try {
    const decoded = jwt.verify(refreshTokenValue, getJwtRefreshSecret());
    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshTokenValue) {
      return { error: 'Invalid refresh token' };
    }

    const roleName = String(user.role || '').trim()
    let roleData = null
    if (isMongoObjectId(user.roleId)) {
      roleData = await Role.findById(user.roleId)
      if (!roleData && roleName) roleData = await Role.findOne({ name: roleName })
    } else if (roleName) {
      roleData = await Role.findOne({ name: roleName })
    }
    const actions = roleData?.actions || [];

    const payload = {
      userId: user._id,
      name: user.name,
      email: user.email,
      picture: user.picture || null,
      role: roleData?.name || user.role,
      roleId: roleData?._id || user.roleId,
      actions
    };
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

    // Avoid failing refresh on legacy users that have an invalid roleId type (e.g. old numeric ids).
    // Also opportunistically migrate roleId when possible.
    const shouldMigrateRoleId = roleData?._id
      && (!isMongoObjectId(user.roleId) || String(user.roleId) !== String(roleData._id))

    const migrateRoleId = shouldMigrateRoleId
      ? { roleId: roleData._id, role: roleData.name }
      : {};

    await User.updateOne(
      { _id: user._id },
      { $set: { refreshToken: newRefreshToken, ...migrateRoleId } }
    );

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  } catch {
    return { error: 'Invalid or expired refresh token' };
  }
}

/**
 * Authenticate a user (email/password).
 * Input: `{ email, password }`.
 * Output: `{ accessToken, refreshToken, user }`.
 * @param {{email:string,password:string}} params
 * @returns {Promise<{accessToken:string,refreshToken:string,user:{id:any,name:any,email:any,picture:any,role:any,roleId:any,actions:any[]}}>}
 */
const loginUser = async ({ email, password }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) throw new Error('Invalid email or password');

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error('Invalid email or password');

  const roleName = String(user.role || '').trim()
  let roleData = null
  if (isMongoObjectId(user.roleId)) {
    roleData = await Role.findById(user.roleId)
    if (!roleData && roleName) roleData = await Role.findOne({ name: roleName })
  } else if (roleName) {
    roleData = await Role.findOne({ name: roleName })
  }
  const actions = roleData?.actions || [];

  const payload = {
    userId: user._id,
    name: user.name,
    email: user.email,
    picture: user.picture || null,
    role: roleData?.name || user.role,
    roleId: roleData?._id || user.roleId,
    actions,
  };

  const accessToken = generateAccessToken(payload);
  const refreshTokenValue = generateRefreshToken(payload);

  // Avoid failing login on legacy users that have an invalid roleId type (e.g. old numeric ids).
  // Also opportunistically migrate roleId when possible.
  const shouldMigrateRoleId = roleData?._id
    && (!isMongoObjectId(user.roleId) || String(user.roleId) !== String(roleData._id))

  const migrateRoleId = shouldMigrateRoleId
    ? { roleId: roleData._id, role: roleData.name }
    : {};

  await User.updateOne(
    { _id: user._id },
    { $set: { refreshToken: refreshTokenValue, ...migrateRoleId } }
  );

  return {
    accessToken,
    refreshToken: refreshTokenValue,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      picture: user.picture || null,
      role: migrateRoleId.role || user.role,
      roleId: migrateRoleId.roleId || user.roleId,
      actions,
    },
  };
};

/*async function forgotPassword(email) {
  const user = await User.findOne({ email });
  if (!user) throw new Error('Utilisateur non trouve');

  const resetCode = crypto.randomBytes(3).toString('hex');

  user.resetCode = resetCode;
  user.resetCodeExpires = Date.now() + 3600000;
  await user.save();

  const message = `Voici votre code de reinitialisation: ${resetCode}. Ce code expire dans 1 heure.`;
  await sendEmail(user.email, 'Reinitialisation de votre mot de passe', message);

  return true;
}*/

/*async function verifyResetCode(email, code) {
  const user = await User.findOne({ email });
  if (!user) throw new Error('Utilisateur non trouve');

  if (
    !user.resetCode ||
    user.resetCode !== code ||
    !user.resetCodeExpires ||
    user.resetCodeExpires < Date.now()
  ) {
    throw new Error('Code invalide ou expire');
  }

  return true;
}*/

/*async function resetPassword(email, newPassword) {
  const user = await User.findOne({ email });
  if (!user) throw new Error('Utilisateur non trouve');

  user.password = await bcrypt.hash(newPassword, 10);
  user.resetCode = null;
  user.resetCodeExpires = null;

  await user.save();
  return true;
}*/
/**
 * Change password d'un utilisateur connecté.
 * @param {{userId:string, currentPassword:string, newPassword:string}} params
 */
const changePassword = async ({ userId, currentPassword, newPassword }) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) throw new Error('Current password is incorrect');

  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters');
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  return true;
};

module.exports = {
  registerUser,
  loginUser,
  changePassword,
  /*resetPassword,*/
  /*forgotPassword,*/
  /*verifyResetCode,*/
  generateToken,
  generateAccessToken,
  generateRefreshToken,
  refreshToken,
};
