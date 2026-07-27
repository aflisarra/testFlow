const authService = require('../services/auth.service');
const { registerUser, loginUser } = authService;
const Role = require('../models/role.model');
const MESSAGES = require('../constants/messages.js');
// Register a new user
exports.register = async (req, res) => {
  try {
    const { name, email, password, role: roleName } = req.body;
    const picture = req.file ? req.file.filename : null;

    const user = await registerUser({ name, email, password, picture, roleName });

    const userObj = typeof user?.toObject === MESSAGES.AUTH.FUNCTION ? user.toObject() : user;
    if (userObj && userObj.password) delete userObj.password;

    res.status(201).json({ message: MESSAGES.USER.REGISTERED, user: userObj });
  } catch (error) {
    console.error(MESSAGES.USER.SIGNUP_ERROR, error);
    const status = error.message === MESSAGES.USER.CANNOT_ASSIGN_ADMIN_ROLE ? 403 : 400;
    res.status(status).json({ message: error.message });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: MESSAGES.USER.EMAIL_AND_PASSWORD_REQUIRED });
    }

    const result = await loginUser({ email, password });

    res.status(200).json({
      message: MESSAGES.USER.LOGIN_SUCCESS,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (err) {
    console.error(MESSAGES.USER.LOGIN_ERROR, err);
    res.status(400).json({ message: err.message || MESSAGES.ERROR.SERVER });
  }
};

// Refresh access token
exports.refreshTokenController = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshToken(refreshToken);

    if (result.error) {
      return res.status(403).json({ message: result.error });
    }

    return res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || MESSAGES.ERROR.SERVER });
  }
};

// Logout user
exports.logout = async (req, res) => {
  try {
    const { userId } = req.body;
    await require('../models/user.model').updateOne({ _id: userId }, { $unset: { refreshToken: 1 } });
    res.json({ message: MESSAGES.USER.LOGGED_OUT });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Forgot password
/*exports.forgotPassword = async (req, res) => {
  if (!req.body.email) {
    return res.status(400).json({ message: 'Email requis' });
  }

  try {
    await authService.forgotPassword(req.body.email);
    res.json({ message: 'Email avec code envoye' });
  } catch (error) {
    console.error('Erreur dans forgotPassword :', error);
    res.status(400).json({ message: error.message });
  }
};*/

// Verify reset code
/*exports.verifyCode = async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ message: 'Email et code sont requis' });
  }

  try {
    await authService.verifyResetCode(email, code);
    res.json({ message: 'Code valide avec succes' });
  } catch (err) {
    console.error('Erreur verification code:', err.message);
    res.status(400).json({ message: err.message });
  }
};*/

// Reset password
/*exports.resetPassword = async (req, res) => {
  try {
    const { email, newPassword, confirmPassword } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email manquant' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Les mots de passe ne correspondent pas' });
    }

    await authService.resetPassword(email, newPassword);

    res.json({ message: 'Mot de passe reinitialise avec succes' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};*/

// Public: roles list to show in signup dropdown (exclude admin)
// Route: GET /api/auth/signup-roles
exports.getSignupRoles = async (req, res) => {
  try {
    const roles = await Role.find({ name: { $ne: MESSAGES.AUTH.ADMIN } }, { _id: 1, name: 1, description: 1 }).sort({ name: 1 });
    return res.json(roles);
  } catch (error) {
    console.error(MESSAGES.USER.SIGNUP_ROLES_ERROR, error);
    return res.status(500).json({ message: MESSAGES.ERROR.SERVER });
  }
};
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.body.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: MESSAGES.AUTH.CURRENT_PASSWORD });
    }

    await authService.changePassword({ userId, currentPassword, newPassword });
    res.json({ message: MESSAGES.AUTH.PASSWORD_UPDATE });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
