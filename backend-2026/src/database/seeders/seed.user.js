// seed-user.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../../models/user.model'); // Mets le bon chemin vers ton modèle User

const seedUser = async () => {
  try {
    // Connexion MongoDB
    await mongoose.connect(process.env.MONGODB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connecté à MongoDB');

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email: 'admin@example.com' });
    if (existingUser) {
      console.log('⚠️ Utilisateur déjà existant, aucun ajout.');
      process.exit();
    }

    // Créer un hash de mot de passe
    const hashedPassword = await bcrypt.hash('123', 10);

    // Créer un utilisateur
    const user = new User({
      name: 'Admin',
      email: 'admin@example.com',
      password: hashedPassword,
      role: 'admin',
      description: 'Compte administrateur initial',
      picture: null,
    });
    

    await user.save();
    console.log('✅ Utilisateur ajouté avec succès.');
    process.exit();
  } catch (error) {
    console.error('❌ Erreur lors de l’ajout :', error);
    process.exit(1);
  }
};

seedUser();
