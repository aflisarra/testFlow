const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
const mongoose = require('mongoose');
const Role = require('../../models/role.model');       // ton modèle Role
const Action = require('../../models/action.model');   // ton modèle Action
const RoleAction = require('../../models/roleAction.model'); // ton modèle RoleAction

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URL;

// --- Liste des actions à seed ---
const actions = [
  { _id: 1, name: 'dashboard', path: '/dashboard' },
  { _id: 10, name: 'list-users', path: '/admin/users' },
  { _id: 2, name: 'add user', path: '/dashboard/users/add' },
  { _id: 3, name: 'edit user', path: '/dashboard/users/edit/:id' },
  { _id: 4, name: 'view user', path: '/dashboard/users/view/:id' },
  { _id: 5, name: 'delete user', path: '/dashboard/users/delete/:id' },
  { _id: 6, name: 'add role', path: '/dashboard/roles/add' },
  { _id: 7, name: 'edit role', path: '/dashboard/roles/edit/:id' },
  { _id: 8, name: 'view role', path: '/dashboard/roles/view/:id' },
  { _id: 9, name: 'delete role', path: '/dashboard/roles/delete/:id' },


  // Actions Projet — accessibles à tous les users (même sans projet)
  { _id: 11, name: 'list-projects', path: '/projects' },
  { _id: 12, name: 'create-project', path: '/projects/create' },
  { _id: 13, name: 'view-project', path: '/projects/view/:id' },

  // Actions Projet — réservées au owner/membre
  { _id: 14, name: 'edit-project', path: '/projects/edit/:id' },
  { _id: 15, name: 'delete-project', path: '/projects/delete/:id' },
  { _id: 16, name: 'invite-project', path: '/projects/invite/:id' },

];

// --- Mapping RoleActions ---
const mapping = [
  { roleName: 'admin', actionIds: actions.map((a) => a._id) }, // admin: toutes les actions
  {
    roleName: 'user', actionIds: [1, 11, 12, 13],

  }, // user: dashboard seulement (ajouter selon besoin)
  {
    roleName: 'management',
    actionIds: [1, 10, 11, 12, 13, 14, 15, 16],
  },
];

async function seedDatabase() {
  try {
    if (!MONGODB_URI) {
      throw new Error('Missing MongoDB URI. Define MONGODB_URI (or MONGODB_URL) in .env');
    }

    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // --- Vider les collections ---
    await Action.deleteMany({});
    await Role.deleteMany({});
    await RoleAction.deleteMany({});
    console.log('🧹 Collections cleared');

    // --- Seed Actions ---
    const savedActions = await Action.insertMany(actions);
    console.log(`✅ ${savedActions.length} actions seeded`);
    // --- Seed Roles et RoleActions ---
    for (const map of mapping) {
      const role = await Role.create({
        name: map.roleName,
        description: map.roleName === 'admin' ? 'Full access to all features' : 'Limited access',
        actions: map.actionIds
      });

      // Seed RoleAction
      const roleActions = map.actionIds.map(actionId => ({
        roleId: role._id,
        actionId
      }));
      await RoleAction.insertMany(roleActions);

      console.log(`✅ Role "${role.name}" seeded with actions [${map.actionIds.join(', ')}]`);
    }

    console.log('🎉 Database seeding completed!');
    process.exit(0);

  } catch (err) {
    console.error('❌ Seeding error:', err);
    process.exit(1);
  }
}

seedDatabase();
