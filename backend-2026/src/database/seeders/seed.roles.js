const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const envPath = path.join(__dirname, '../../../.env');
dotenv.config({ path: envPath });

const Role = require('../../models/role.model');
const Action = require('../../models/action.model');

const MONGODB_URI = process.env.MONGODB_URI;

async function seedRoles() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Vider la collection pour éviter doublons / conflits
    await Role.deleteMany({});

    const allActions = await Action.find({});
    const allActionIds = allActions.map(a => a._id);

    // Créer admin et user, _id est auto-incrémenté par le plugin donc NE PAS le fournir ici
    await Role.create({
      name: 'admin',
      description: 'Full access to all features',
      actions: allActionIds
    });

    await Role.create({
      name: 'user',
      description: 'Basic user with dashboard access',
      actions: []
    });

    console.log('✅ Seeded roles: admin, user');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seedRoles();
