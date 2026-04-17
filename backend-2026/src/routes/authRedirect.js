const express = require('express');
const router = express.Router();

const { authRedirect } = require('../controllers/authRedirect');
const authenticateUser = require('../middleware/authenticateUser');

// ✅ Redirect based on role — GET /api/auth-redirect
router.get('/auth-redirect', authenticateUser, authRedirect);

module.exports = router;

///?????????????????,