//const Role = require('../models/role.model');
//const RoleAction = require('../models/roleAction.model');
const roleService = require('../services/role.service');
const MESSAGES = require('../constants/messages.js');
// ✅ Create a new role
// Input: req.body = { name: String, description: String, actions: [ObjectId] }
// Output: 201 -> saved Role object
//         400 -> { message: "Name and description are required" }
//         409 -> { message: "Role already exists" }
//         500 -> { message: error.message }
exports.createRole = async (req, res) => {
  try {
    const { name, description, actions } = req.body;

    if (!name) {
      return res.status(400).json({ message: MESSAGES.ROLE.ERROR_NAME });
    }

    const savedRole = await roleService.createRole({ name, description, actions });

    res.status(201).json(savedRole);
  } catch (error) {
    console.error(MESSAGES.ROLE.ERROR, error);
    const status = error.message === MESSAGES.ROLE.ROLE_EXISTS ? 409 : 500;
    res.status(status).json({ message: error.message });
  }
};


// ✅ Get all roles
// Input: none
// Output: 200 -> Array of Role objects
//         500 -> { message: "Server error" }
exports.getRoles = async (req, res) => {
  try {
    const roles = await roleService.getAllRoles();
    res.json(roles);
  } catch (err) {
    console.error(MESSAGES.ROLE.ERROR, err);
    res.status(500).json({ message: MESSAGES.ERROR.SERVER });
  }
};

// ✅ Get role by ID
// Input: req.params.id (ObjectId)
// Output: 200 -> Role object
//         404 -> { message: "Role not found" }
//         500 -> { message: "Server error" }
exports.getRole = async (req, res) => {
  try {
    const role = await roleService.getRoleById(req.params.id);
    if (!role) return res.status(404).json({ message: MESSAGES.ROLE.NOT_FOUND });
    res.json(role);
  } catch (err) {
    console.error(MESSAGES.ROLE.ERROR, err);
    res.status(500).json({ message: MESSAGES.ERROR.SERVER });
  }
};

// ✅ Update role
// Input: req.params.id (ObjectId), req.body = { name?, description?, actions? }
// Output: 200 -> { message: "Role updated successfully", role: updatedRole }
//         404 -> { message: "Role not found" }
//         500 -> { message: "Server error" }
exports.updateRole = async (req, res) => {
  try {
    const updatedRole = await roleService.updateRole(req.params.id, req.body);
    if (!updatedRole) return res.status(404).json({ message: MESSAGES.ROLE.NOT_FOUND });
    res.json({ message: MESSAGES.ROLE.UPDATED, role: updatedRole });
  } catch (err) {
    console.error(MESSAGES.ROLE.ERROR, err);
    res.status(500).json({ message: MESSAGES.ERROR.SERVER });
  }
};

// ✅ Delete role
// Input: req.params.id (ObjectId)
// Output: 200 -> { message: "Role deleted successfully" }
//         404 -> { message: "Role not found" }
//         500 -> { message: "Server error" }
exports.deleteRole = async (req, res) => {
  try {
    const deleted = await roleService.deleteRole(req.params.id);
    if (!deleted) return res.status(404).json({ message: MESSAGES.ROLE.NOT_FOUND });
    res.json({ message: MESSAGES.ROLE.DELETED });
  } catch (err) {
    console.error(MESSAGES.ROLE.ERROR, err);
    const status = err?.statusCode || 500
    res.status(status).json({ message: err?.message || MESSAGES.ERROR.SERVER });
  }
};


//const Role = require('../models/role.model');

/*exports.createRole = async ({ name, description, actions }) => {
  const exists = await Role.findOne({ name });
  if (exists) throw new Error('Role already exists');

  const newRole = new Role({ name, description });
  const savedRole = await newRole.save();

  const roleActions = actions.map(actionId => ({
    roleId: savedRole._id,
    actionId
  }));

  await RoleAction.insertMany(roleActions);

  return savedRole;
};*/


