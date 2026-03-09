const express = require('express');
const router = express.Router();
const Action = require('../models/action.model');

// GET all actions
router.get('/', async (req, res) => {
  try {
    const actions = await Action.find({}, { _id: 1, name: 1, path: 1 }); // garde _id
    res.json(actions);
  } catch (err) {
    console.error(err); // <-- Log de l’erreur pour ESLint satisfait
    res.status(500).json({ message: 'Failed to load actions' });
  }
});



module.exports = router;
