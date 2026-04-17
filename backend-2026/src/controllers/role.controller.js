//const Role = require('../models/role.model');
//const RoleAction = require('../models/roleAction.model');
const roleService = require('../services/role.service');

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
      return res.status(400).json({ message: 'Name is required' });
    }

    const savedRole = await roleService.createRole({ name, description, actions });

    res.status(201).json(savedRole);
  } catch (error) {
    console.error('Error creating role:', error);
    const status = error.message === 'Role already exists' ? 409 : 500;
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
    console.error('Fetch roles error:', err);
    res.status(500).json({ message: 'Server error' });
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
    if (!role) return res.status(404).json({ message: 'Role not found' });
    res.json(role);
  } catch (err) {
    console.error('Get role error:', err);
    res.status(500).json({ message: 'Server error' });
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
    if (!updatedRole) return res.status(404).json({ message: 'Role not found' });
    res.json({ message: 'Role updated successfully', role: updatedRole });
  } catch (err) {
    console.error('Update role error:', err);
    res.status(500).json({ message: 'Server error' });
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
    if (!deleted) return res.status(404).json({ message: 'Role not found' });
    res.json({ message: 'Role deleted successfully' });
  } catch (err) {
    console.error('Delete role error:', err);
    res.status(err.statusCode || 500).json({ message: err.message || 'Server error' });
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



