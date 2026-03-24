const userService = require('../services/user.service');
const User = require('../models/user.model');
const Role = require('../models/role.model');

// ✅ Create a new user
// Route: POST /api/users
// Access: Private (admin only or similar logic)
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, description } = req.body;
    const picture = req.file ? `/api/uploads/users/${req.file.filename}` : null;

    const userData = { name, email, password, role, description, picture };
    const newUser = await userService.createUser(userData);

    const userObj = typeof newUser?.toObject === 'function' ? newUser.toObject() : newUser;
    if (userObj && userObj.password) delete userObj.password;

    res.status(201).json({ message: 'User created successfully', user: userObj });
  } catch (err) {
    console.error('Create user error:', err);
    if (err.message === 'Email already in use') {
      return res.status(400).json({ message: err.message });
    }
    if (err.message === 'Role not found') {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
};





// ✅ Get all users
// Route: GET /api/users
// Access: Private (admin or authenticated user)
exports.getUsers = async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ✅ Get single user by ID
// Route: GET /api/users/:id
// Access: Private (admin or authenticated user)
exports.getUser = async (req, res) => {
  try {
    const user = await userService.getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ✅ Update user (name, email, picture)
// Route: PUT /api/users/:id
// Access: Private (admin or user themselves)
// Input: FormData (name, email, optional picture)
exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, email, role, description } = req.body;

    const updatedFields = { name, email, description };

    if (role) {
      const roleDoc = await Role.findOne({ name: String(role).trim() });
      if (!roleDoc) return res.status(400).json({ message: 'Role not found' });
      updatedFields.roleId = roleDoc._id;
      updatedFields.role = roleDoc.name;
    }

    if (req.file) {
      updatedFields.picture = `/api/uploads/users/${req.file.filename}`;
    }

    const updatedUser = await userService.updateUser(userId, updatedFields);

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({
      message: 'User updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ✅ Delete user by ID
// Route: DELETE /api/users/:id
// Access: Private (admin or user themselves)
exports.deleteUser = async (req, res) => {
  try {
    const deletedUser = await userService.deleteUser(req.params.id);
    if (!deletedUser) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ✅ Get current authenticated user's profile
// Route: GET /api/users/profile
// Access: Private (requires JWT)
exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User Not Found' });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error('Error fetching profile', error);
    return res.status(500).json({ message: 'Server Error' });
  }
};
