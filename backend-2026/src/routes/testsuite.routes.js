const express = require('express');
const router = express.Router();
const controller = require('../controllers/testsuite.controller');

router.post('/', controller.create);

router.get('/', controller.getAll);

router.get('/:id', controller.getById);

router.get('/user/:userId', controller.getByUser);

router.put('/:id', controller.update);

router.delete('/:id', controller.delete);

router.get('/:id/plans', controller.getPlans)

module.exports = router;