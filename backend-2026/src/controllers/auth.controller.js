/**
 * ================================================================================
 * AUTHENTICATION CONTROLLER (auth.controller.js)
 * ================================================================================
 * 
 * PURPOSE:
 * This controller handles HTTP requests related to user authentication.
 * It receives requests from routes, calls service functions, and sends
 * responses back to the client.
 * 
 * DEPENDENCIES:
 * - authService: Contains business logic for authentication (register, login, etc.)
 * - Role model: Used to fetch available roles for signup dropdown
 * 
 * EXPORTS (used by routes):
 * - register: Handle new user registration
 * - login: Handle user login
 * - logout: Handle user logout
 * - refreshTokenController: Handle token refresh
 * - getSignupRoles: Get available roles for registration dropdown
 * 
 * ================================================================================
 */

const authService = require('../services/auth.service');
const { registerUser, loginUser } = authService;
const Role = require('../models/role.model');

/**
 * ================================================================================
 * USER REGISTRATION
 * ================================================================================
 * Endpoint: POST /api/auth/signup
 * 
 * Process:
 * 1. Extract user data from request body (name, email, password, role)
 * 2. Extract uploaded picture (if any) from request file
 * 3. Call registerUser service to create the user
 * 4. Remove password from response for security
 * 5. Return success response with user object
 * 
 * Error Handling:
 * - 400: Invalid input or email already in use
 * - 403: Attempting to register as admin (not allowed)
 * - 500: Server error
 * ================================================================================
 */

// Register a new user
exports.register = async (req, res) => {
  try {
    // Extract user data from request body
    const { name, email, password, role: roleName } = req.body;
    
    // Get uploaded picture filename if file was uploaded
    const picture = req.file ? req.file.filename : null;

    // Call the service to create the user
    const user = await registerUser({ name, email, password, picture, roleName });

    // Convert to plain JavaScript object to safely remove password
    const userObj = typeof user?.toObject === 'function' ? user.toObject() : user;
    
    // Remove password from response for security
    if (userObj && userObj.password) delete userObj.password;

    // Send success response with 201 status (created)
    res.status(201).json({ message: 'User registered successfully', user: userObj });
  } catch (error) {
    console.error('Signup error:', error);
    
    // Return appropriate status code based on error type
    const status = error.message === 'Cannot assign admin role on signup' ? 403 : 400;
    res.status(status).json({ message: error.message });
  }
};

/**
 * ================================================================================
 * USER LOGIN
 * ================================================================================
 * Endpoint: POST /api/auth/signin
 * 
 * Process:
 * 1. Validate that email and password are provided
 * 2. Call loginUser service to verify credentials
 * 3. Return access token, refresh token, and user info
 * 
 * Error Handling:
 * - 400: Missing email or password, or invalid credentials
 * - 500: Server error
 * ================================================================================
 */

// Login user
exports.login = async (req, res) => {
  try {
    // Extract credentials from request body
    const { email, password } = req.body;

    // Validate that both email and password are provided
    if (!email || !password) {
      return res.status(400).json({ message: 'Email et mot de passe requis' });
    }

    // Call login service to verify credentials and generate tokens
    const result = await loginUser({ email, password });

    // Return success response with tokens and user data
    res.status(200).json({
      message: 'Connexion reussie',
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(400).json({ message: err.message || 'Server error' });
  }
};

/**
 * ================================================================================
 * TOKEN REFRESH
 * ================================================================================
 * Endpoint: POST /api/auth/refresh-token
 * 
 * Process:
 * 1. Extract refresh token from request body
 * 2. Call refreshToken service to validate and generate new tokens
 * 3. Return new access and refresh tokens
 * 
 * Error Handling:
 * - 403: Invalid or expired refresh token
 * - 500: Server error
 * ================================================================================
 */

// Refresh access token
exports.refreshTokenController = async (req, res) => {
  try {
    // Extract refresh token from request body
    const { refreshToken } = req.body;
    
    // Call service to validate and refresh tokens
    const result = await authService.refreshToken(refreshToken);

    // If there's an error, return 403
    if (result.error) {
      return res.status(403).json({ message: result.error });
    }

    // Return new tokens
    return res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

/**
 * ================================================================================
 * USER LOGOUT
 * ================================================================================
 * Endpoint: POST /api/auth/logout
 * 
 * Process:
 * 1. Extract userId from request body
 * 2. Remove the refresh token from the user's database record
 * 3. Return success message
 * 
 * Note: This effectively invalidates the user's session.
 * ================================================================================
 */

// Logout user
exports.logout = async (req, res) => {
  try {
    // Extract userId from request body
    const { userId } = req.body;
    
    // Remove the refresh token from the user's record
    // Using $unset removes the field entirely
    await require('../models/user.model').updateOne({ _id: userId }, { $unset: { refreshToken: 1 } });
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * ================================================================================
 * GET AVAILABLE ROLES FOR SIGNUP
 * ================================================================================
 * Endpoint: GET /api/auth/signup-roles
 * 
 * Process:
 * 1. Query Role collection excluding the 'admin' role
 * 2. Return list of available roles for the registration dropdown
 * 
 * Note: The 'admin' role is excluded because regular users
 * cannot self-register as administrators for security reasons.
 * ================================================================================
 */

// Public: roles list to show in signup dropdown (exclude admin)
// Route: GET /api/auth/signup-roles
exports.getSignupRoles = async (req, res) => {
  try {
    // Find all roles except 'admin', return only essential fields
    const roles = await Role.find(
      { name: { $ne: 'admin' } }, 
      { _id: 1, name: 1, description: 1 }
    ).sort({ name: 1 });
    
    return res.json(roles);
  } catch (error) {
    console.error('Error fetching signup roles:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * ================================================================================
 * COMMENTED OUT: PASSWORD RESET FUNCTIONALITY
 * ================================================================================
 * The following functions were previously used for password reset:
 * - forgotPassword: Send reset code to user's email
 * - verifyCode: Validate the reset code
 * - resetPassword: Update password with new password
 * 
 * These are currently disabled but can be re-enabled when
 * an email service provider is configured.
 * ================================================================================
 */

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
