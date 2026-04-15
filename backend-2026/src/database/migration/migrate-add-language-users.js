// migrate-add-language-to-users.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../../models/user.model'); // Mets le bon chemin vers ton modèle User

const migrateAddLanguageToUsers = async () => {
  try {
    // Connexion MongoDB
    await mongoose.connect(process.env.MONGODB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connecté à MongoDB');

    // Mettre "fr" pour tous les utilisateurs sans langue
    const result = await User.updateMany(
      { $or: [{ language: { $exists: false } }, { language: null }] },
      { $set: { language: 'fr' } }
    );

    console.log(`✅ Migration terminée : ${result.modifiedCount} utilisateur(s) mis à jour.`);

    process.exit();
  } catch (error) {
    console.error('❌ Erreur lors de la migration :', error);
    process.exit(1);
  }
};

migrateAddLanguageToUsers();
