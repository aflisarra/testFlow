const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../utils/jwt-secrets');

const authenticateUser = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'No token provided' });

  let secret = ''
  try {
    secret = getJwtSecret()
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'JWT secret not configured' })
  }

  jwt.verify(token, secret, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Token expired or invalid' });
    req.user = decoded;
    next();
  });
};



module.exports = authenticateUser;
