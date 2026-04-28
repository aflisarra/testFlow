const mongoose = require('mongoose')
const Role = require('../models/role.model')
const RoleAction = require('../models/roleAction.model')
const User = require('../models/user.model')
const { isMongoObjectId } = require('../utils/mongo-objectid')

function parseRoleId(id) {
  const raw = String(id ?? '').trim()
  if (!raw) return { kind: 'invalid', value: null }
  if (isMongoObjectId(raw)) return { kind: 'objectid', value: raw }
  if (/^\d+$/.test(raw)) return { kind: 'number', value: Number(raw) }
  return { kind: 'invalid', value: null }
}

function toObjectId(hexString) {
  try {
    return new mongoose.Types.ObjectId(hexString)
  } catch {
    return null
  }
}

// ✅ Create a new role
// Input: { name: String, description: String, actions: [Number] }
// Output: saved Role object
exports.createRole = async ({ name, description, actions }) => {
  if (!name) {
    throw new Error('Name is required')
  }

  const exists = await Role.findOne({ name })
  if (exists) {
    throw new Error('Role already exists')
  }

  const newRole = new Role({
    name,
    description,
    actions: Array.isArray(actions) ? actions : [],
  })
  const savedRole = await newRole.save()

  if (Array.isArray(actions) && actions.length) {
    const roleActions = actions.map((actionId) => ({
      roleId: savedRole._id,
      actionId,
    }))
    await RoleAction.insertMany(roleActions)
  }

  return savedRole
}

// ✅ Get all roles
exports.getAllRoles = async () => {
  return await Role.find()
}

// ✅ Get a role by ID (supports legacy numeric _id)
exports.getRoleById = async (id) => {
  const parsed = parseRoleId(id)
  if (parsed.kind === 'invalid') return null

  if (parsed.kind === 'objectid') {
    return await Role.findById(parsed.value)
  }

  return await Role.collection.findOne({ _id: parsed.value })
}

// ✅ Update a role (supports legacy numeric _id)
exports.updateRole = async (id, updateData) => {
  const parsed = parseRoleId(id)
  if (parsed.kind === 'invalid') return null

  const safeUpdate = { ...(updateData || {}) }
  delete safeUpdate._id

  if (parsed.kind === 'objectid') {
    return await Role.findByIdAndUpdate(parsed.value, safeUpdate, {
      new: true,
      runValidators: true,
    })
  }

  const result = await Role.collection.findOneAndUpdate(
    { _id: parsed.value },
    { $set: safeUpdate },
    { returnDocument: 'after' }
  )
  return result?.value || null
}

// ✅ Delete a role (supports legacy numeric _id)
exports.deleteRole = async (id) => {
  const parsed = parseRoleId(id)
  if (parsed.kind === 'invalid') return null

  const role =
    parsed.kind === 'objectid'
      ? await Role.findById(parsed.value).lean()
      : await Role.collection.findOne({ _id: parsed.value })

  if (!role) return null

  const roleName = String(role?.name || '').trim()
  const roleObjectId = parsed.kind === 'objectid' ? toObjectId(parsed.value) : null
  const roleIdFilterValue =
    parsed.kind === 'objectid' && roleObjectId ? roleObjectId : parsed.value

  const assignedCount = await User.collection.countDocuments({
    $or: [{ roleId: roleIdFilterValue }, ...(roleName ? [{ role: roleName }] : [])],
  })

  if (assignedCount > 0) {
    const err = new Error(
      `Vous ne pouvez pas supprimer ce rôle car ${assignedCount} utilisateur(s) sont assignés à ce rôle.`
    )
    err.statusCode = 409
    err.code = 'ROLE_IN_USE'
    throw err
  }

  await RoleAction.collection.deleteMany({ roleId: roleIdFilterValue })

  if (parsed.kind === 'objectid') {
    await Role.findByIdAndDelete(parsed.value)
    return role
  }

  await Role.collection.deleteOne({ _id: parsed.value })
  return role
}

