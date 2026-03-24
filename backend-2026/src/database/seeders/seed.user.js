// seed-user.js
require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../../models/role.model');
const Action = require('../../models/action.model');
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

    // S'assurer que le role admin existe (et relier le user Ã  ce role)
    let adminRole = await Role.findOne({ name: 'admin' });
    if (!adminRole) {
      const allActionIds = (await Action.find({})).map((a) => a._id);
      adminRole = await Role.create({
        name: 'admin',
        description: 'Full access',
        actions: allActionIds,
      });
    }

    // Créer un utilisateur
    const user = new User({
      name: 'Admin',
      email: 'admin@example.com',
      password: hashedPassword,
      roleId: adminRole._id,
      role: adminRole.name,
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
