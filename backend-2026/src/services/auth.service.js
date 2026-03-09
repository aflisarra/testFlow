const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const User = require('../models/user.model');
const Role = require('../models/role.model');

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function generateToken(payload) {
  const secret = getRequiredEnv('JWT_SECRET');
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

function generateAccessToken(payload) {
  return generateToken(payload);
}

function generateRefreshToken(payload) {
  const refreshSecret = getRequiredEnv('JWT_REFRESH_SECRET');
  return jwt.sign(payload, refreshSecret, { expiresIn: '7d' });
}

async function sendEmail(to, subject, message) {
  // Fallback implementation to avoid runtime crashes when no mail provider is configured.
  console.log('[MAIL]', { to, subject, message });
  return true;
}

const registerUser = async ({ name, email, password, picture, roleName }) => {
  const existingUser = await User.findOne({ email });
  if (existingUser) throw new Error('Email already in use');

  const hashedPassword = await bcrypt.hash(password, 10);
  const existingUsers = await User.find();
  const role = existingUsers.length === 0 ? 'admin' : (roleName || 'user');

  const newUser = new User({
    name,
    email,
    password: hashedPassword,
    picture: picture ? `/api/uploads/${picture}` : null,
    role,
  });

  await newUser.save();
  return newUser;
};

async function refreshToken(refreshTokenValue) {
  if (!refreshTokenValue) {
    return { error: 'No refresh token provided' };
  }

  try {
    const refreshSecret = getRequiredEnv('JWT_REFRESH_SECRET');
    const decoded = jwt.verify(refreshTokenValue, refreshSecret);
    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshTokenValue) {
      return { error: 'Invalid refresh token' };
    }

    const payload = { userId: user._id, role: user.role };
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

    user.refreshToken = newRefreshToken;
    await user.save();

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  } catch {
    return { error: 'Invalid or expired refresh token' };
  }
}

const loginUser = async ({ email, password }) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error('Invalid email or password');

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error('Invalid email or password');

  const roleData = await Role.findOne({ name: user.role });
  const actions = roleData?.actions || [];

  const payload = {
    userId: user._id,
    role: user.role,
    actions,
  };

  const accessToken = generateAccessToken(payload);
  const refreshTokenValue = generateRefreshToken(payload);

  user.refreshToken = refreshTokenValue;
  await user.save();

  return {
    accessToken,
    refreshToken: refreshTokenValue,
    user: {
      email: user.email,
      role: user.role,
      actions,
    },
  };
};

async function forgotPassword(email) {
  const user = await User.findOne({ email });
  if (!user) throw new Error('Utilisateur non trouve');

  const resetCode = crypto.randomBytes(3).toString('hex');

  user.resetCode = resetCode;
  user.resetCodeExpires = Date.now() + 3600000;
  await user.save();

  const message = `Voici votre code de reinitialisation: ${resetCode}. Ce code expire dans 1 heure.`;
  await sendEmail(user.email, 'Reinitialisation de votre mot de passe', message);

  return true;
}

async function verifyResetCode(email, code) {
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
}

async function resetPassword(email, newPassword) {
  const user = await User.findOne({ email });
  if (!user) throw new Error('Utilisateur non trouve');

  user.password = await bcrypt.hash(newPassword, 10);
  user.resetCode = null;
  user.resetCodeExpires = null;

  await user.save();
  return true;
}

module.exports = {
  registerUser,
  loginUser,
  resetPassword,
  forgotPassword,
  verifyResetCode,
  generateToken,
  generateAccessToken,
  generateRefreshToken,
  refreshToken,
};
