const express = require('express');
const router = express.Router();
const roleController = require('../controllers/role.controller');
const authenticateUser = require('../middleware/authenticateUser');
const requireAction = require('../middleware/requireAction');

// 🔒 Protect all role routes
router.use(authenticateUser);

// ✅ Create a new role
// POST /api/roles
router.post('/', requireAction(6), roleController.createRole);

// ✅ Get all roles
// GET /api/roles
router.get('/', requireAction([17, 8]), roleController.getRoles);

// ✅ Get a role by ID
// GET /api/roles/:id
router.get('/:id', requireAction([17, 8]), roleController.getRole);

// ✅ Update a role
// PUT /api/roles/:id
router.put('/:id', requireAction(7), roleController.updateRole);


router.post(
  '/reassign-delete',
  roleController.reassignAndDelete
)

// ✅ Delete a role
// DELETE /api/roles/:id
router.delete('/:id', requireAction(9), roleController.deleteRole);





module.exports = router;
