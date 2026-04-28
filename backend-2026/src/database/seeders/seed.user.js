const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Role = require('../../models/role.model');
const User = require('../../models/user.model');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URL;

const usersData = [
  {
    name: 'Admin',
    email: 'admin@example.com',
    password: '123456',
    roleName: 'admin',
    description: 'Compte administrateur principal',
  },
  {
    name: 'Admin 2',
    email: 'admin2@example.com',
    password: '123456',
    roleName: 'admin',
    description: 'Deuxième compte administrateur',
  },
];

async function seedUsers() {
  try {
    if (!MONGODB_URI) throw new Error('MONGODB_URI manquant dans .env');

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connecté à MongoDB');

    let created = 0;

    for (const u of usersData) {
      const role = await Role.findOne({ name: u.roleName });
      if (!role) {
        console.warn(`⚠️  Rôle "${u.roleName}" introuvable. Lance seed.roles.js d'abord !`);
        continue;
      }

      const exists = await User.findOne({ email: u.email });
      if (exists) {
        console.log(`⏭️  User déjà existant: ${u.email}`);
        continue;
      }

      const hashed = await bcrypt.hash(u.password, 10);
      await User.create({
        name: u.name,
        email: u.email,
        password: hashed,
        roleId: role._id,   // ObjectId ✅
        role: role.name,
        description: u.description,
        picture: null,
      });

      console.log(`✅ User créé: ${u.email} → rôle "${role.name}" (${role._id})`);
      created++;
    }

    console.log(`🎉 ${created} user(s) créé(s)`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur:', err);
    process.exit(1);
  }
}

seedUsers();