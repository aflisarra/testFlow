/////////////////////////importation des dependences///////

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const { generateToken } = require('../src/services/auth.service');

///////////////////////////////////////////////

///////////////////charge toutes les variables d'environnement du fichier .env//////////
dotenv.config();



//const User = require('./src/models/user.model');
//const db = require('./src/database/config/db');
const roleRoutes = require('../src/routes/role.routes');
//const userRoutes = require('./src/routes/user.routes');
const authRedirectRoute = require('../src/routes/authRedirect');
const actionRoutes = require('../src/routes/action.routes');



const app = express();
const port = 3000;

//app.use(cors());
app.use(express.json()); ///parser les données au format JSON




const allowedOrigins = ['http://localhost:4200', 'http://localhost:3000'];

const corsOptions = {
  origin: function(origin, callback) {
    if (!origin) return callback(null, true); // accepter Postman/CURL, etc.
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `L'origine ${origin} n'est pas autorisée par CORS.`;
      return callback(new Error(msg), false);
    }
    callback(null, origin);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
};

app.use((req, res, next) => {
  // Permet la communication entre fenêtres popup/parent mais reste sécuritaire
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

app.use(cors(corsOptions));
app.use(express.json());

// Test route


// Configuration CORS dynamique avec gestion des credentials
/*app.use(cors({
  origin: function(origin, callback) {
    console.log('Origine demandée pour CORS :', origin);
    
  
    // Les requêtes sans origine (Postman, CURL) sont acceptées
    if (!origin) return callback(null, true);

    // Vérifier si l'origine est dans la whitelist
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `Origine ${origin} non autorisée par CORS.`;
      console.error(msg);
      return callback(new Error(msg), false);
    }

    // Origine autorisée
    callback(null, origin);
  },
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // Autoriser envoi cookie & headers authentication
}));*/


//app.use('/api', userRoutes);
app.use('/api/uploads', express.static('uploads'));
app.use('/api', authRedirectRoute);
app.use('/api/auth', require('../src/routes/auth.routes'));
app.use('/api/users', require('../src/routes/user.routes'));
app.use('/api/roles', roleRoutes);
app.use('/api/actions', actionRoutes);


// 2️⃣ Middleware global pour rafraîchir le token si valide
app.use((req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return next();

  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (!err) {
      res.setHeader('x-new-token', generateToken({ id: user.id }));
    }
    next();
  });
});

mongoose.connect(process.env.MONGODB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('✅ Connecté à MongoDB');
  app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
  });
})
.catch(err => {
  console.error('❌ Erreur connexion MongoDB:', err);
});

//////////////////////////////////////////////////////////////////////////:

