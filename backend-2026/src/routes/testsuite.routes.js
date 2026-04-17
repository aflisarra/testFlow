const express = require('express');
const router = express.Router();
const controller = require('../controllers/testsuite.controller');
const authenticateUser = require('../middleware/authenticateUser');
const { requireTestSuiteAccess } = require('../middleware/testsuite-access.middleware');

router.use(authenticateUser);

router.post('/', controller.create);

router.get('/', controller.getAll);

router.get('/user/:userId', controller.getByUser);

router.get('/:id/plans', requireTestSuiteAccess, controller.getPlans)

router.patch('/:id/session', requireTestSuiteAccess, controller.saveSession);

router.get('/:id', requireTestSuiteAccess, controller.getById);

router.put('/:id', requireTestSuiteAccess, controller.update);

router.delete('/:id', requireTestSuiteAccess, controller.delete);

module.exports = router;
