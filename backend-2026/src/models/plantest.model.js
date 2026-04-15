// ============================================================
// models/plantest.js
// Chaque step du plan de test généré par Ollama
// ============================================================

const mongoose = require('mongoose');

const planTestSchema = new mongoose.Schema(
  {
    // Le texte du step (ex: "Aller sur /login et vérifier le formulaire")
    contenu: {
      type: String,
      required: true,
      trim: true
    },

    // Numéro d'ordre du step (1, 2, 3...)
    ordre: {
      type: Number,
      required: true
    },

    // Référence à la TestSuite parente
    testSuiteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestSuite',
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlanTest', planTestSchema);