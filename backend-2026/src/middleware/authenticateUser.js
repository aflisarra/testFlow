const jwt = require('jsonwebtoken');
const express = require('express');

const app = express();
app.use(express.json());

const authenticateUser = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'No token provided' });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Token expired or invalid' });
    req.user = decoded;
    next();
  });
};



module.exports = authenticateUser;
