require('dotenv').config()
const mongoose = require('mongoose')

const User = require('../../models/user.model')
const Role = require('../../models/role.model')
const MESSAGES = require('../../constants/messages')
function isMongoObjectIdString(value) {
  return typeof value === MESSAGES.CONSOLE.STRING && /^[a-fA-F0-9]{24}$/.test(value.trim())
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL
  if (!uri) {
    throw new Error(MESSAGES.MONGODB.MISSSING_MONGODB_URI)
  }

  await mongoose.connect(uri)

  const roles = await Role.find({}).select(MESSAGES.USER.ID_NAME).lean()
  const byName = new Map(roles.map((r) => [String(r.name || '').trim(), r._id]))

  const users = await User.find({}).select(MESSAGES.ROLE.ID_EMAIL).lean()
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
  console.error(MESSAGES.ROLE.MIGRATE_USER_ROLEID_FAILED, err)
  try { await mongoose.disconnect() } catch {}
  process.exit(1)
})

