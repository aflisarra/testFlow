require('dotenv').config()
const mongoose = require('mongoose')

const User = require('../../models/user.model')
const Role = require('../../models/role.model')

function isMongoObjectIdString(value) {
  return typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value.trim())
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL
  if (!uri) {
    throw new Error('Missing MongoDB URI. Define MONGODB_URI (or MONGODB_URL) in .env')
  }

  await mongoose.connect(uri)

  const roles = await Role.find({}).select('_id name').lean()
  const byName = new Map(roles.map((r) => [String(r.name || '').trim(), r._id]))

  const users = await User.find({}).select('_id email role roleId').lean()
  let updated = 0

  for (const u of users) {
    const roleName = String(u.role || '').trim()
    const targetRoleId = byName.get(roleName)
    if (!targetRoleId) continue

    const roleId = u.roleId
    const ok =
      roleId instanceof mongoose.Types.ObjectId ||
      isMongoObjectIdString(roleId)

    if (ok) continue

    await User.updateOne({ _id: u._id }, { $set: { roleId: targetRoleId } })
    updated += 1
  }

  console.log(`✅ migrate-user-roleid: updated ${updated} user(s)`)
  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error('❌ migrate-user-roleid failed:', err)
  try { await mongoose.disconnect() } catch {}
  process.exit(1)
})

