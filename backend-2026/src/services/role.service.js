const Role = require('../models/role.model');
//const roleService = require('../services/role.service');
const RoleAction = require('../models/roleAction.model');
const User = require('../models/user.model')

// ✅ Create a new role
// Input: { name: String, description: String, actions: [ObjectId] }
// Output: saved Role object
exports.createRole = async ({ name, description, actions }) => {
  if (!name) {
    throw new Error('Name is required');
  }

  const exists = await Role.findOne({ name });
  if (exists) {
    throw new Error('Role already exists');
  }

  // Inclure actions directement
  const newRole = new Role({ name, description, actions: Array.isArray(actions) ? actions : [] });
  const savedRole = await newRole.save();

  // Optionnel : créer RoleAction séparée si nécessaire
  if (Array.isArray(actions) && actions.length) {
    const roleActions = actions.map(actionId => ({
      roleId: savedRole._id,
      actionId
    }));
    await RoleAction.insertMany(roleActions);
  }

  return savedRole;
};






// ✅ Get all roles
// Input: none
// Output: Array of Role objects
exports.getAllRoles = async () => {
  return await Role.find();
};

// ✅ Get a role by ID
// Input: id (ObjectId)
// Output: Role object or null if not found
exports.getRoleById = async (id) => {
  return await Role.findById(id);
};

// ✅ Update a role
// Input: id (ObjectId), updateData (object with updated fields)
// Output: Updated Role object or null if not found
exports.updateRole = async (id, updateData) => {
  return await Role.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true
  });
};

// ✅ Delete a role
// Input: id (ObjectId)
// Output: Deleted Role object or null if not found
exports.deleteRole = async (id) => {
  const role = await Role.findById(id)
  if (!role) return null

  const roleId = role._id
  const roleName = String(role.name || '').trim()

  const assignedCount = await User.countDocuments({
    $or: [
      { roleId: roleId },
      ...(roleName ? [{ role: roleName }] : []),
    ],
  })

  if (assignedCount > 0) {
    const err = new Error(
      `Vous ne pouvez pas supprimer ce rôle car ${assignedCount} utilisateur(s) sont assignés à ce rôle.`
    )
    err.statusCode = 409
    err.code = 'ROLE_IN_USE'
    throw err
  }

  await RoleAction.deleteMany({ roleId: roleId })
  return await Role.findByIdAndDelete(id)
};
