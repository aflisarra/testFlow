const express = require('express');
const router = express.Router();
const controller = require('../controllers/testsuite.controller');

router.post('/', controller.create);

router.get('/', controller.getAll);

router.get('/user/:userId', controller.getByUser);

router.get('/:id/plans', controller.getPlans)

router.patch('/:id/session', controller.saveSession);

router.get('/:id', controller.getById);

router.put('/:id', controller.update);

router.delete('/:id', controller.delete);

module.exports = router;
