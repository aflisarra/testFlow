/**
 * ================================================================================
 * AUTHENTICATION ROUTES (auth.routes.js)
 * ================================================================================
 * 
 * PURPOSE:
 * Defines all authentication-related API endpoints.
 * Maps HTTP methods and paths to controller functions.
 * 
 * BASE PATH: /api/auth
 * 
 * DEPENDENCIES:
 * - express: Router for defining routes
 * - multer: Middleware for file uploads (profile pictures)
 * - auth.controller: Contains request handlers
 * 
 * AVAILABLE ROUTES:
 * - GET  /signup-roles  → Get available roles for registration
 * - POST /signup        → Register new user
 * - POST /signin       → Login user
 * - POST /logout       → Logout user
 * - POST /refresh-token → Refresh access token
 * 
 * ================================================================================
 */

const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const authController = require('../controllers/auth.controller');
const { refreshTokenController } = require('../controllers/auth.controller');

/**
 * ================================================================================
 * ROUTE: GET /signup-roles
 * ================================================================================
 * Get list of available roles for user registration dropdown
 * Excludes 'admin' role (users cannot register as admin)
 * 
 * Request: None (no body required)
 * Response: Array of role objects [{ _id, name, description }]
 * Access: Public (no authentication required)
 * ================================================================================
 */

// Public: roles list for signup dropdown
router.get('/signup-roles', authController.getSignupRoles);

/**
 * ================================================================================
 * ROUTE: POST /signup
 * ================================================================================
 * Register a new user account
 * 
 * Request Body:
 *   - name: User's display name (string, required)
 *   - email: User's email (string, required, unique)
 *   - password: User's password (string, required)
 *   - role: Desired role name (string, optional, default 'user')
 * 
 * Form Data (multipart):
 *   - picture: Profile picture file (optional, .jpg/.png)
 * 
 * Response: { message, user: { id, name, email, role, picture, ... } }
 * Access: Public (no authentication required)
 * ================================================================================
 */

// ✅ Register
router.post('/signup', upload.single('picture'), authController.register);

/**
 * ================================================================================
 * ROUTE: POST /signin
 * ================================================================================
 * Authenticate user and return tokens
 * 
 * Request Body:
 *   - email: User's email (string, required)
 *   - password: User's password (string, required)
 * 
 * Response: { message, accessToken, refreshToken, user: {...} }
 * Access: Public (no authentication required)
 * ================================================================================
 */

// ✅ Login
router.post('/signin', authController.login);

/**
 * ================================================================================
 * ROUTE: POST /logout
 * ================================================================================
 * Logout user by invalidating their refresh token
 * 
 * Request Body:
 *   - userId: ID of the user to logout (string, required)
 * 
 * Response: { message: 'Logged out successfully' }
 * Access: Authenticated (requires valid JWT)
 * ================================================================================
 */

// ✅ Logout
router.post('/logout', authController.logout);

/**
 * ================================================================================
 * ROUTE: POST /refresh-token
 * ================================================================================
 * Refresh access token using a valid refresh token
 * 
 * Request Body:
 *   - refreshToken: The refresh token from previous login (string, required)
 * 
 * Response: { accessToken, refreshToken }
 * Access: Public (refresh tokens can be used without authentication)
 * ================================================================================
 */

// ✅ Refresh token
router.post('/refresh-token', refreshTokenController);

/**
 * ================================================================================
 * COMMENTED OUT: PASSWORD RESET ROUTES
 * ================================================================================
 * These routes were previously used for password reset functionality:
 * - POST /forgot-password: Request password reset email
 * - POST /verify-code: Verify reset code
 * - POST /reset-password: Set new password
 * 
 * Currently disabled - requires email service provider configuration.
 * ================================================================================
 */

/*router.post('/forgot-password', authController.forgotPassword);

// ✅ Reset password
router.post('/reset-password', authController.resetPassword);

// ✅ Verify code
router.post('/verify-code', authController.verifyCode);*/

/**
 * ================================================================================
 * EXPORT ROUTER
 * ================================================================================
 */

module.exports = router;
