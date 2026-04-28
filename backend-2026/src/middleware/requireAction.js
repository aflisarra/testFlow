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
            const numeric = [];
            let hasNonNumeric = false;
            for (const id of roleDoc.actions) {
              const n = typeof id === 'string' && /^\d+$/.test(id.trim()) ? Number(id.trim()) : Number(id);
              if (Number.isFinite(n)) numeric.push(n);
              else hasNonNumeric = true;
            }

            // Option A expects numeric action ids. If we ever migrate to ObjectIds,
            // keep allowing requests to pass via tokenActions, but warn loudly.
            effectiveActions = numeric;
            req.user.actions = effectiveActions;

            if (hasNonNumeric) {
              console.warn('[requireAction] roleDoc.actions contains non-numeric ids. Expected Numbers.', {
                userId,
                roleId: userDoc.roleId,
                roleName: userDoc.role,
              });
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
