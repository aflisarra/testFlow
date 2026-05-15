const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authenticateUser = require('../middleware/authenticateUser');
const upload = require('../middleware/upload');
const requireAction = require('../middleware/requireAction');

// appliquer authentification
router.use(authenticateUser);

// Add user
router.post('/add', requireAction(2), upload.single('picture'), userController.createUser);

// Get profile
router.get('/profile', userController.getUserProfile);

// Get all users
// Backward-compatible: allow either "list-users" (10) or legacy "view-user" (4)
router.get('/', requireAction([10, 4]), userController.getUsers);

// Get user by id
router.get('/:id', requireAction(4), userController.getUser);

// Update user
router.put('/:id', requireAction(3), upload.single('picture'), userController.updateUser);


// Delete user
router.delete('/:id', requireAction(5), userController.deleteUser);

module.exports = router;
