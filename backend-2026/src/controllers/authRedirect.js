const { getRedirectPath } = require('../services/authRedirect');
const {MESSAGES} = require('../constants/messages.js');
/**
 * Controller: Returns redirect path based on role
 * Route: GET /api/auth-redirect
 */
exports.authRedirect = async (req, res) => {
  try {
    const redirectPath = await getRedirectPath(req.user.userId);
    return res.status(200).json({ path: redirectPath }); // ✅ Return path as JSON
  } catch (error) {
    console.error(MESSAGES.AUTHREDIRECT.ERROR, error);
    res.status(error.message === MESSAGES.AUTH.USER_NOT_FOUND ? 404 : 500).json({
      message: error.message || MESSAGES.ERROR.SERVER,
    });
  }
};
