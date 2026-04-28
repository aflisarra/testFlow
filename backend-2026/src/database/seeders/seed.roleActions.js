require('dotenv').config()
const path = require('path')
const mongoose = require('mongoose')

require('dotenv').config({
  path: path.join(__dirname, '../../../.env'),
})

const Role = require('../../models/role.model')
const RoleAction = require('../../models/roleAction.model')

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URL

async function seedRoleActions() {
  try {
    if (!MONGODB_URI) throw new Error('MONGODB_URI manquant dans .env')

    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    const roles = await Role.find({}).select('_id name actions').lean()
    if (!roles.length) {
      throw new Error("Aucun rôle trouvé. Lance seed.roles.js d'abord.")
    }

    await RoleAction.deleteMany({})
    console.log('🧹 Cleared RoleAction collection')

    const toInsert = []
    for (const role of roles) {
      const actionIds = Array.isArray(role.actions) ? role.actions : []
      for (const actionId of actionIds) {
        const numericActionId = Number(actionId)
        if (!Number.isFinite(numericActionId)) continue
        toInsert.push({ roleId: role._id, actionId: numericActionId })
      }
    }

    if (toInsert.length) {
      await RoleAction.insertMany(toInsert)
    }

    console.log(`✅ RoleActions seeded (${toInsert.length} links)`)
    process.exit(0)
  } catch (error) {
    console.error('❌ Seeding error:', error)
    process.exit(1)
  }
}

seedRoleActions()

