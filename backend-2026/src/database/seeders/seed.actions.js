const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../../.env') })
const mongoose = require('mongoose')
const Action = require('../../models/action.model')

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URL

// Fixed numeric ids (1..16) to keep compatibility with requireAction(6/7/8/...) and the frontend menu mapping.
const actions = [
  { _id: 1, name: 'dashboard', path: '/dashboard' },
  { _id: 2, name: 'add-user', path: '/dashboard/users/add' },
  { _id: 3, name: 'edit-user', path: '/dashboard/users/edit/:id' },
  { _id: 4, name: 'view-user', path: '/dashboard/users/view/:id' },
  { _id: 5, name: 'delete-user', path: '/dashboard/users/delete/:id' },
  { _id: 6, name: 'add-role', path: '/dashboard/roles/add' },
  { _id: 7, name: 'edit-role', path: '/dashboard/roles/edit/:id' },
  { _id: 8, name: 'view-role', path: '/dashboard/roles/view/:id' },
  { _id: 9, name: 'delete-role', path: '/dashboard/roles/delete/:id' },
  { _id: 10, name: 'list-users', path: '/admin/users' },
  { _id: 11, name: 'list-projects', path: '/projects' },
  { _id: 12, name: 'create-project', path: '/projects/create' },
  { _id: 13, name: 'view-project', path: '/projects/view/:id' },
  { _id: 14, name: 'edit-project', path: '/projects/edit/:id' },
  { _id: 15, name: 'delete-project', path: '/projects/delete/:id' },
  { _id: 16, name: 'invite-project', path: '/projects/invite/:id' },
]

async function seedActions() {
  try {
    if (!MONGODB_URI) throw new Error('MONGODB_URI manquant dans .env')

    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connecté à MongoDB')

    await Action.deleteMany({})
    console.log('🧹 Actions supprimées')

    const saved = await Action.insertMany(actions)
    console.log(`✅ ${saved.length} actions créées (IDs numériques)`)
    saved.forEach((a) => console.log(`   ${a._id} → ${a.name}`))

    process.exit(0)
  } catch (err) {
    console.error('❌ Erreur:', err)
    process.exit(1)
  }
}

seedActions()

