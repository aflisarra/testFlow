const { getRedirectPath } = require('../services/authRedirect');

/**
 * Controller: Returns redirect path based on role
 * Route: GET /api/auth-redirect
 */
exports.authRedirect = async (req, res) => {
  try {
    const redirectPath = await getRedirectPath(req.user.userId);
    return res.status(200).json({ path: redirectPath }); // ✅ Return path as JSON
  } catch (error) {
    console.error('Redirect error:', error);
    res.status(error.message === 'User not found' ? 404 : 500).json({
      message: error.message || 'Server error during redirect',
    });
  }
};
