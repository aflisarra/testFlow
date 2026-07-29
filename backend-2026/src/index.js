/////////////////////////importation des dependences///////
const path = require('path')
require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
  override: true,
})
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { generateToken } = require('./services/auth.service');
const { getJwtSecret } = require('./utils/jwt-secrets');
const testSuiteRoutes = require('./routes/testsuite.routes');
//const aiRoutes = require("./routes/ai.routes");
const authMagic = require("./routes/auth.magic.routes");
// Routes
const ollamaRoutes = require('./routes/ollama.routes')
const seleniumRoutes = require('./routes/selenium.routes')
const aiFixRoutes = require('./routes/ai-fix.routes')
const specificationRoutes = require('./routes/specification.routes');
///////////////////////////////////////////////



//const User = require('./src/models/user.model');
//const db = require('./src/database/config/db');
const roleRoutes = require('./routes/role.routes');
//const userRoutes = require('./src/routes/user.routes');
const authRedirectRoute = require('./routes/authRedirect');
const actionRoutes = require('./routes/action.routes');
const projectRoutes = require('./routes/project.routes');
const projectInvitationRoutes = require('./routes/projectInvitation.routes');



const app = express();
const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_URL

//app.use(cors());


const corsOptions = {
  origin: [
    'http://localhost:61358',
    'http://localhost:4200'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));


app.use(express.json()); ///parser les données au format JSON
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
app.use('/api/uploads', express.static(path.resolve(__dirname, '..', 'uploads')));

// Middleware global pour rafraîchir le token si valide
app.use((req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return next();

  const token = authHeader.split(' ')[1];
  let secret;
  try {
    secret = getJwtSecret()
  } catch {
    return next()
  }

  jwt.verify(token, secret, (err, user) => {
    if (!err) {
      res.setHeader('x-new-token', generateToken({ id: user.id }));
    }
    next();
  });
});
app.use('/api', authRedirectRoute);
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/roles', roleRoutes);
app.use('/api/actions', actionRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/project-invitations', projectInvitationRoutes);
app.use('/api/testsuites', testSuiteRoutes);
//app.use("/api/ai", aiRoutes);
app.use("/api/ollama", ollamaRoutes);
app.use('/api/selenium', seleniumRoutes)
app.use('/api/ai', aiFixRoutes)
app.use("/auth", authMagic);
app.use('/api', specificationRoutes);


app.use(
  '/api/uploads',
  express.static(
    path.join(__dirname, '../uploads')
  )
)






// ✅ UNE SEULE FOIS !
app.use('/api/uploads', express.static(
  path.join(__dirname, '..', 'uploads')
))




console.log('🔗 MongoDB URI:', mongoUri);
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ Connecté à MongoDB');
      
    }
    
    app.listen(port, () => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🚀 Server running at http://localhost:${port}`);
      }
    });
  })
  .catch(err => {
    console.error('❌ Erreur connexion MongoDB:', err);
  });

//////////////////////////////////////////////////////////////////////////: