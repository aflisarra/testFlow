// Verifies that the authenticated user has the given action id.
// `req.user` is populated by `authenticateUser` from the JWT payload.
module.exports = function requireAction(actionIdOrList) {
  return (req, res, next) => {
    const actions = Array.isArray(req.user?.actions) ? req.user.actions : [];
    const required = Array.isArray(actionIdOrList) ? actionIdOrList : [actionIdOrList];

    const allowed = required.some((id) => actions.includes(id));
    if (!allowed) {
      return res.status(403).json({ message: "Vous n'avez pas l'acces a ca" });
    }

    return next();
  };
};
