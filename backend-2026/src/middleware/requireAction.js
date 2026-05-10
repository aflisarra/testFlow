const User = require('../models/user.model');
const Role = require('../models/role.model');
const { isMongoObjectId } = require('../utils/mongo-objectid');

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
          const roleName = String(userDoc.role || '').trim()
          let roleDoc = null
          if (isMongoObjectId(userDoc.roleId)) {
            roleDoc = await Role.findById(userDoc.roleId).select('actions').lean()
            // Fallback for users whose roleId points to a deleted role after reseeding/migration
            if (!roleDoc && roleName) {
              roleDoc = await Role.findOne({ name: roleName }).select('actions').lean()
            }
          } else if (roleName) {
            roleDoc = await Role.findOne({ name: roleName }).select('actions').lean()
          }

          if (roleDoc && Array.isArray(roleDoc.actions)) {
  const numeric = roleDoc.actions
    .map((id) => Number(id))
    .filter(Number.isFinite)

  // only override token actions if DB actions exist
  if (numeric.length > 0) {
    effectiveActions = numeric
    req.user.actions = effectiveActions
  }
}
        }
      }

      if (!effectiveActions || effectiveActions.length === 0) {
        console.warn('[requireAction] effectiveActions is empty. Check role actions seeding/migration.', {
          userId,
          required,
          tokenActions,
        });
      }

      const allowed = required.some(
  (id) => effectiveActions.includes(Number(id)) || tokenActions.includes(Number(id))
)
      if (!allowed) {
        return res.status(403).json({ message: "You don't have access to that action" });
      }

      return next();
    } catch (error) {
      console.error('requireAction error:', error);
      return res.status(500).json({ message: 'Authorization check failed' });
    }
  };
};
