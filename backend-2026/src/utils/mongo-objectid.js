const mongoose = require('mongoose')

function isMongoObjectId(value) {
  if (!value) return false
  if (value instanceof mongoose.Types.ObjectId) return true
  if (typeof value === 'string') return /^[a-fA-F0-9]{24}$/.test(value.trim())
  return false
}

module.exports = { isMongoObjectId }
