const User = require('../models/user.model');
const Role = require('../models/role.model');

// ✅ Create a new user
// Input:
//   - userData: { name, emailAdress, password, role, description, picture }
// Output:
//   - saved user object
const bcrypt = require('bcryptjs'); // bien importer si ce n'est pas déjà fait

exports.createUser = async (userData) => {
  const { email, password } = userData;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new Error('Email already in use');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const roleName = (userData.role || 'user').trim();
  const roleDoc = await Role.findOne({ name: roleName });
  if (!roleDoc) {
    throw new Error('Role not found');
  }

  const newUser = new User({
    name: userData.name,
    email: email,
    password: hashedPassword,
    roleId: roleDoc._id,
    role: roleDoc.name,
    
    description: userData.description,
    picture: userData.picture || null,
  });

  return await newUser.save();
};



// Get all users from the database (excluding passwords)
// Input: none
// Output: Array of user objects without passwords
exports.getAllUsers = async () => {
  return await User.find().select('-password');
};

// Get a specific user by ID (excluding password)
// Input: id (String) - the ID of the user
// Output: user object without password, or null if not found
exports.getUserById = async (id) => {
  return await User.findById(id).select('-password');
};

// Update a user by ID
// Input:
//   - userId (String): the ID of the user to update
//   - updateData (Object): fields to update (e.g., name, email, picture)
// Output: updated user object without password, or null if not found
exports.updateUser = async (userId, updateData) => {
  return await User.findByIdAndUpdate(userId, updateData, {
    new: true, // return the updated document
    runValidators: true // apply schema validation
  }).select('-password');
};

// Delete a user by ID
// Input: id (String) - the ID of the user to delete
// Output: deleted user object, or null if not found
exports.deleteUser = async (id) => {
  return await User.findByIdAndDelete(id);
};
