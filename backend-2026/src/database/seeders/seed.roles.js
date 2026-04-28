const mongoose = require('mongoose')
const path = require('path')

require('dotenv').config({
  path: path.join(__dirname, '../../../.env'),
})

const Role = require('../../models/role.model')
const Action = require('../../models/action.model')

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URL

async function seedRoles() {
  try {
    if (!MONGODB_URI) throw new Error('MONGODB_URI manquant dans .env')

    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Ensure actions exist before creating roles
    const allActions = await Action.find({}).select('_id').lean()
    const actionIds = allActions.map((a) => Number(a._id)).filter((n) => Number.isFinite(n))
    if (actionIds.length === 0) {
      throw new Error("Aucune action trouvée. Lance seed.actions.js d'abord.")
    }

    // Clear roles to avoid duplicates/conflicts
    await Role.deleteMany({})

    const adminActions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
    const userActions = [1, 11, 12, 13]
    const managementActions = [1, 10, 11, 12, 13, 14, 15, 16]

    await Role.create({
      name: 'admin',
      description: 'Full access to all features',
      actions: adminActions,
    })

    await Role.create({
      name: 'user',
      description: 'Limited access',
      actions: userActions,
    })

    await Role.create({
      name: 'management',
      description: 'Management access (users + projects)',
      actions: managementActions,
    })

    console.log('✅ Seeded roles: admin, user, management')
    process.exit(0)
  } catch (err) {
    console.error('❌ Seeding failed:', err)
    process.exit(1)
  }
}

seedRoles()

