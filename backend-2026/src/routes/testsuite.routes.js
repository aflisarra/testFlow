const express = require('express');
const router = express.Router();
const controller = require('../controllers/testsuite.controller');
const exportController = require('../controllers/export.controller');
const authenticateUser = require('../middleware/authenticateUser');
const { requireTestSuiteAccess } = require('../middleware/testsuite-access.middleware');

router.use(authenticateUser);

router.post('/', controller.create);

router.get('/', controller.getAll);

router.get('/user/:userId', controller.getByUser);

router.get('/project/:projectId', controller.getByProject);

router.get('/:id/plans', requireTestSuiteAccess, controller.getPlans)

router.patch('/:id/session', requireTestSuiteAccess, controller.saveSession);
router.patch('/:id/status', requireTestSuiteAccess, controller.updateStatus);
router.patch('/:id/save', requireTestSuiteAccess, controller.save);
router.patch('/:id/project', requireTestSuiteAccess, controller.updateProject);
router.post('/:id/execute', requireTestSuiteAccess, controller.execute);

// Export Word (.docx)
// POST /api/testsuites/:id/export-word
router.post('/:id/export-word', requireTestSuiteAccess, exportController.exportWord);
// Backward-friendly alias
router.get('/:id/export-word', requireTestSuiteAccess, exportController.exportWord);

router.get('/:id', requireTestSuiteAccess, controller.getById);

router.put('/:id', requireTestSuiteAccess, controller.update);

router.delete('/:id', requireTestSuiteAccess, controller.delete);

module.exports = router;
