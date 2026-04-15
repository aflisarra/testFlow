/**
 * ================================================================================
 * JWT AUTHENTICATION MIDDLEWARE (authenticateUser.js)
 * ================================================================================
 * 
 * PURPOSE:
 * This middleware function validates JWT tokens on protected routes.
 * It checks for a valid Bearer token in the Authorization header
 * and rejects requests with missing or invalid tokens.
 * 
 * HOW IT WORKS:
 * 1. Extract the Authorization header from the request
 * 2. Parse the Bearer token (format: "Bearer <token>")
 * 3. Verify the token using JWT_SECRET from environment variables
 * 4. If valid, attach the decoded user data to req.user
 * 5. Call next() to pass control to the next middleware/route handler
 * 
 * DEPENDENCIES:
 * - jsonwebtoken: For token verification
 * 
 * USAGE:
 *   const authenticateUser = require('./middleware/authenticateUser');
 *   router.get('/protected', authenticateUser, controller.handleRequest);
 * 
 * ERROR RESPONSES:
 * - 401: No token provided
 * - 403: Token expired or invalid
 * 
 * ================================================================================
 */

// Import JWT for token verification
const jwt = require('jsonwebtoken');
const express = require('express');

// Create a test Express app instance for reference
const app = express();
app.use(express.json());

/**
 * Authentication middleware function
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next() callback
 */
const authenticateUser = (req, res, next) => {
  // Get the Authorization header from the request
  // Expected format: "Bearer <jwt_token>"
  const authHeader = req.headers['authorization'];
  
  // Extract the token part (remove "Bearer " prefix)
  // If no authHeader, token will be undefined
  const token = authHeader && authHeader.split(' ')[1];

  // If no token provided, return 401 Unauthorized
  if (!token) return res.status(401).json({ message: 'No token provided' });

  // Verify the token using the JWT_SECRET from environment variables
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    // If verification fails (expired, invalid signature, etc.)
    if (err) return res.status(403).json({ message: 'Token expired or invalid' });
    
    // Token is valid - attach decoded user data to the request object
    // This allows subsequent route handlers to access user info
    req.user = decoded;
    
    // Call next() to pass control to the next middleware/route handler
    next();
  });
};

// Export the middleware for use in routes
module.exports = authenticateUser;
