const User = require('../models/user.model');

/**
 * Determines redirection path based on user role
 * @param {string} userId - The authenticated user's ID
 * @returns {string} - Redirect path (e.g., '/dashboard' or '/profile')
 * @throws {Error} - If user not found
 */
const getRedirectPath = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  return user.role === 'admin' ? '/dashboard' : '/profile'; // a changee 
};

module.exports = { getRedirectPath };
