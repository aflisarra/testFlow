const User = require('../models/user.model');
const Role = require('../models/role.model');

// Verifies user permissions against DB role actions (not only JWT payload),
// so role/action updates are effective immediately without re-login.
module.exports = function requireAction(actionIdOrList) {
  return async (req, res, next) => {
    try {
      const required = (Array.isArray(actionIdOrList) ? actionIdOrList : [actionIdOrList]).map((id) => Number(id));
      const tokenActions = Array.isArray(req.user?.actions) ? req.user.actions.map((id) => Number(id)) : [];

      let effectiveActions = tokenActions;
      const userId = String(req.user?.userId || req.user?.id || req.user?._id || '').trim();

      if (userId) {
        const userDoc = await User.findById(userId).select('roleId role').lean();
        if (userDoc) {
          const roleDoc = userDoc.roleId != null
            ? await Role.findById(userDoc.roleId).select('actions').lean()
            : await Role.findOne({ name: String(userDoc.role || '').trim() }).select('actions').lean();

          if (roleDoc && Array.isArray(roleDoc.actions)) {
            effectiveActions = roleDoc.actions.map((id) => Number(id));
            req.user.actions = effectiveActions;
          }
        }
      }

      const allowed = required.some((id) => effectiveActions.includes(id));
      if (!allowed) {
        return res.status(403).json({ message: "Vous n'avez pas l'acces a ca" });
      }

      return next();
    } catch (error) {
      console.error('requireAction error:', error);
      return res.status(500).json({ message: 'Authorization check failed' });
    }
  };
};
