const userService = require('../services/user.service');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const { isMongoObjectId } = require('../utils/mongo-objectid');
const MESSAGES = require('../constants/messages.js');
// ✅ Create a new user
// Route: POST /api/users
// Access: Private (admin only or similar logic)
/*exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, description } = req.body;
    const picture = req.file ? `/api/uploads/users/${req.file.filename}` : null;

    const userData = { name, email, password, role, description, picture };
    const newUser = await userService.createUser(userData);

    const userObj = typeof newUser?.toObject === 'function' ? newUser.toObject() : newUser;
    if (userObj && userObj.password) delete userObj.password;

    res.status(201).json({ message: MESSAGES.USER.CREATED, user: userObj });
  } catch (err) {
    console.error(MESSAGES.ERROR.EMAIL_EXISTS, err);
    if (err.message === MESSAGES.ERROR.EMAIL_EXISTS) {
      return res.status(400).json({ message: err.message });
    }
    if (err.message === MESSAGES.ROLE.NOT_FOUND) {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: MESSAGES.ERROR.SERVER });
  }
};*/

exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, description } = req.body;

    const picture = req.file
      ? `/api/uploads/users/${req.file.filename}`
      : null;

    const userData = {
      name,
      email,
      password,
      role,
      description,
      picture
    };

    const newUser = await userService.createUser(userData);

    const userObj =
      typeof newUser?.toObject === 'function'
        ? newUser.toObject()
        : newUser;

    if (userObj && userObj.password) {
      delete userObj.password;
    }

    res.status(201).json({
      message: MESSAGES.USER.CREATED,
      user: userObj
    });

  } catch (err) {
    console.error(err);

    if (err.message === MESSAGES.ERROR.EMAIL_EXISTS) {
      return res.status(400).json({
        message: err.message
      });
    }

    // ADD THIS
    if (err.message === MESSAGES.ERROR.NAME_EXISTS) {
      return res.status(400).json({
        message: err.message
      });
    }

    if (err.message === MESSAGES.ROLE.NOT_FOUND) {
      return res.status(400).json({
        message: err.message
      });
    }

    res.status(500).json({
      message: MESSAGES.ERROR.SERVER
    });
  }
};


// ✅ Get all users
// Route: GET /api/users
// Access: Private (admin or authenticated user)
exports.getUsers = async (req, res) => {
  try {
    const users = await userService.getAllUsers();

    // 200 : Succès
    res.status(200).json(users);

  } catch (error) {
    console.error(MESSAGES.USER.ERROR, error);

    // 400 : Requête invalide (si besoin selon logique métier)
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: MESSAGES.ERROR.BAD_REQUEST
      });
    }

    // 500 : Erreur serveur
    res.status(500).json({
      message: MESSAGES.ERROR.SERVER
    });
  }
};

// ✅ Get single user by ID
// Route: GET /api/users/:id
// Access: Private (admin or authenticated user)
exports.getUser = async (req, res) => {
  try {
    const user = await userService.getUserById(req.params.id);

    // 404 : Utilisateur introuvable
    if (!user) {
      return res.status(404).json({
        message: MESSAGES.USER.NOT_FOUND
      });
    }

    // 200 : Succès
    res.status(200).json(user);

  } catch (error) {
    console.error(MESSAGES.USER.ERROR, error);

    // 400 : ID invalide
    if (error.name === 'CastError') {
      return res.status(400).json({
        message: MESSAGES.ERROR.BAD_REQUEST
      });
    }

    // 500 : Erreur serveur
    res.status(500).json({
      message: MESSAGES.ERROR.SERVER
    });
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
      if (!roleDoc) return res.status(400).json({ message: MESSAGES.ROLE.NOT_FOUND });
      updatedFields.roleId = roleDoc._id;
      updatedFields.role = roleDoc.name;
    }

    if (req.file) {
      updatedFields.picture = `/api/uploads/users/${req.file.filename}`;
    }

    const updatedUser = await userService.updateUser(userId, updatedFields);

    if (!updatedUser) {
      return res.status(404).json({ message:MESSAGES.USER.NOT_FOUND });
    }

    res.status(200).json({
      message: MESSAGES.USER.UPDATED,
      user: updatedUser,
    });
  } catch (error) {
    console.error(MESSAGES.USER.ERROR, error);
    res.status(500).json({ message: MESSAGES.ERROR.SERVER });
  }
};

// ✅ Delete user by ID
// Route: DELETE /api/users/:id
// Access: Private (admin or user themselves)
exports.deleteUser = async (req, res) => {
  try {
    const deletedUser = await userService.deleteUser(req.params.id);

    // 404 : Utilisateur introuvable
    if (!deletedUser) {
      return res.status(404).json({
        message: MESSAGES.USER.NOT_FOUND
      });
    }

    // 200 : Suppression réussie
    res.status(200).json({
      message: MESSAGES.USER.DELETED
    });

  } catch (error) {
    if (error.code === 'USER_IN_ACTIVE_PROJECT') {
      return res.status(error.statusCode || 409).json({
        code: error.code,
        message: error.message,
        projects: error.projects || [],
      });
    }

    console.error(MESSAGES.USER.ERROR, error);

    // 400 : ID invalide
    if (error.name === 'CastError') {
      return res.status(400).json({
        message: MESSAGES.ERROR.BAD_REQUEST
      });
    }

    // 500 : Erreur serveur
    res.status(500).json({
      message: MESSAGES.ERROR.SERVER
    });
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
      return res.status(404).json({ message: MESSAGES.USER.NOT_FOUND });
    }

    const roleDoc = isMongoObjectId(user.roleId)
      ? await Role.findById(user.roleId).select('actions')
      : await Role.findOne({ name: String(user.role || '').trim() }).select('actions');

    return res.status(200).json({
      user,
      actions: Array.isArray(roleDoc?.actions) ? roleDoc.actions : [],
    });
  } catch (error) {
    console.error(MESSAGES.PROFILE.ERROR, error);
    return res.status(500).json({ message: MESSAGES.ERROR.SERVER });
  }
};
