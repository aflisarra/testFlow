require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../../models/role.model');
const Action = require('../../models/action.model');
const RoleAction = require('../../models/roleAction.model');

const MONGODB_URI = process.env.mongodb_URL;

async function seedDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 1️⃣ Seed Actions existantes
    const allActions = await Action.find({});
    const allActionIds = allActions.map(a => a._id);

    // 2️⃣ Seed Roles
    await Role.deleteMany({});
    const adminRole = await Role.create({
      name: 'admin',
      description: 'Full access',
      actions: allActionIds
    });

    const userRole = await Role.create({
      name: 'user',
      description: 'Basic access',
      actions: [1] // juste dashboard
    });

    console.log('✅ Roles seeded');

    // 3️⃣ Seed RoleActions
    await RoleAction.deleteMany({});
    console.log('🧹 Cleared RoleAction collection');

    const mapping = [
      { roleId: adminRole._id, actionIds: allActionIds }, // admin: toutes les actions
      { roleId: userRole._id, actionIds: [1] }            // user: seulement dashboard
    ];

    const toInsert = [];
    for (const map of mapping) {
      for (const actionId of map.actionIds) {
        toInsert.push({ roleId: map.roleId, actionId });
      }
    }

    await RoleAction.insertMany(toInsert);
    console.log('✅ RoleActions seeded');

    console.log('🎉 Database seeding completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
}

seedDatabase();
