const multer = require('multer')
const path = require('path')
const fsSync = require('fs')

function ensureSpecFile(file, cb) {
  const name = String(file?.originalname || '').toLowerCase()
  const ext = path.extname(name)
  const ok = ext === '.docx' || ext === '.md' || ext === '.txt'
  if (!ok) return cb(new Error('Only .docx, .md, or .txt files are allowed'))
  return cb(null, true)
}

function safeBasename(filename) {
  const base = path.basename(String(filename || '').trim() || 'spec')
  return base.replace(/[^\w.\-()\s]+/g, '_').replace(/\s+/g, ' ').trim() || 'spec'
}

function getSpecsUploadDir() {
  const backendRoot = path.resolve(__dirname, '../..')
  return path.join(backendRoot, 'uploads', 'specs')
}

function ensureDirExists(dir) {
  try {
    if (fsSync.existsSync(dir)) {
      const stat = fsSync.statSync(dir)
      if (stat.isDirectory()) return
      // Repo may contain a placeholder file named like the directory (e.g. uploads/specs)
      // to keep the path in git. Replace it with a real directory at runtime.
      fsSync.unlinkSync(dir)
    }
    fsSync.mkdirSync(dir, { recursive: true })
  } catch (err) {
    const message = err?.message || String(err)
    throw new Error(`Unable to prepare upload directory '${dir}': ${message}`)
  }
}

function createSpecsUpload() {
  return multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {
        try {
          const dir = getSpecsUploadDir()
          ensureDirExists(dir)
          cb(null, dir)
        } catch (err) {
          cb(err)
        }
      },
      filename: function (req, file, cb) {
        const original = safeBasename(file.originalname)
        cb(null, `${Date.now()}-${original}`)
      },
    }),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => ensureSpecFile(file, cb),
  })
}

module.exports = {
  createSpecsUpload,
}
