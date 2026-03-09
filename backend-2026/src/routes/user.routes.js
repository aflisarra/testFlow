const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authenticateUser = require('../middleware/authenticateUser');
const upload = require('../middleware/upload');

// appliquer authentification
router.use(authenticateUser);

// Add user
router.post('/add', upload.single('picture'), userController.createUser);

// Get profile
router.get('/profile', userController.getUserProfile);

// Get all users
router.get('/', userController.getUsers);

// Get user by id
router.get('/:id', userController.getUser);

// Update user
router.put('/:id', upload.single('picture'), userController.updateUser);

// Delete user
router.delete('/:id', userController.deleteUser);

module.exports = router;