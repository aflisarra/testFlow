const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join('uploads', 'users');
    try {
      if (fs.existsSync(dir)) {
        const stat = fs.statSync(dir);
        if (!stat.isDirectory()) {
          fs.unlinkSync(dir);
        }
      }
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: function (req, file, cb) {
    const original = path.basename(String(file.originalname || 'avatar'));
    // eslint-disable-next-line no-control-regex
    const safe = original.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/\s+/g, ' ').trim();
    cb(null, `${Date.now()}-${safe}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) return cb(null, true);
    cb(new Error('Only images are allowed'));
  }
});

module.exports = upload;