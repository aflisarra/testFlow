const path = require('path')
const mongoose = require('mongoose')

require('dotenv').config({
  path: path.join(__dirname, '..', '..', '.env'),
  override: true,
})

async function runMigration() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_URL
  if (!mongoUri) throw new Error('MONGODB_URI or MONGODB_URL is required')

  await mongoose.connect(mongoUri)
  const items = mongoose.connection.db.collection('specingestionitems')

  const [resolved, pending] = await Promise.all([
    items.updateMany(
      {
        reviewState: { $exists: false },
        $or: [{ reviewed: true }, { role: { $ne: 'UNTAGGED' } }],
      },
      { $set: { reviewState: 'resolved', dismissedAt: null, dismissedBy: null, dismissalReason: null } }
    ),
    items.updateMany(
      { reviewState: { $exists: false }, role: 'UNTAGGED', reviewed: { $ne: true } },
      { $set: { reviewState: 'pending', dismissedAt: null, dismissedBy: null, dismissalReason: null } }
    ),
  ])

  return { resolved: resolved.modifiedCount || 0, pending: pending.modifiedCount || 0 }
}

if (require.main === module) {
  runMigration()
    .then((summary) => console.log(JSON.stringify(summary, null, 2)))
    .catch((error) => {
      console.error('Role review-state migration failed')
      console.error(error)
      process.exitCode = 1
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => {})
    })
}

module.exports = { runMigration }
