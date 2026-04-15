/*
================================================================================
 EXPRESS SERVER ENTRY POINT (index.js)
================================================================================

 PURPOSE:
 This file is the main entry point for the backend Express.js server.
 It sets up middleware, connects to MongoDB, and registers all API routes.

 KEY FUNCTIONS:
 1. Load environment variables from .env file
 2. Initialize Express app with CORS and JSON parsing middleware
 3. Register all route modules (auth, users, roles, projects, test suites, etc.)
 4. Connect to MongoDB database
 5. Start the HTTP server on the specified port

 DEPENDENCIES:
 - express: Web framework for creating HTTP server
 - mongoose: MongoDB ODM for database operations
 - cors: Cross-Origin Resource Sharing middleware
 - jsonwebtoken: JWT token generation and verification
 - dotenv: Environment variable management

 CONFIGURATION:
 - PORT: Server listening port (default 3000)
 - MONGODB_URI: MongoDB connection string
 - JWT_SECRET: Secret key for signing JWT tokens

 ================================================================================*/

const path = require('path')

// Load environment variables from .env file
// This must happen before any other module that uses env vars
require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
  override: true,
})

// Import core Express.js framework
const express = require('express');

// Import mongoose for MongoDB ODM (Object Document Mapper)
const mongoose = require('mongoose');

// CORS allows cross-origin requests from frontend apps
const cors = require('cors');

// JWT for stateless authentication - generates and verifies tokens
const jwt = require('jsonwebtoken');

// Import token generation from auth service
const { generateToken } = require('../src/services/auth.service');

/*
 ROUTE MODULE IMPORTS
 These files contain route handlers for different API endpoints:
 - testsuite.routes: Test suite management (create, read, update, delete)
 - planTest.routes: Test plan CRUD operations
 - ai.routes: AI-powered test generation endpoints
 - auth.magic.routes: Magic link authentication
 - ollama.routes: Ollama AI integration (connects to Python FastAPI)
*/
const testSuiteRoutes = require('./routes/testsuite.routes');
const plantestRoutes = require("./routes/planTest.routes");
const aiRoutes = require("./routes/ai.routes");
const authMagic = require("./routes/auth.magic.routes");
const ollamaRoutes = require('./routes/ollama.routes');

// Additional route modules
const roleRoutes = require('../src/routes/role.routes');
const authRedirectRoute = require('../src/routes/authRedirect');
const actionRoutes = require('../src/routes/action.routes');
const projectRoutes = require('../src/routes/project.routes');


const app = express();
const port = Number(process.env.PORT || 3000);
console.log('MONGO URI =', process.env.MONGODB_URI);
app.use(express.json());




const allowedOrigins = ['http://localhost:4200', 'http://localhost:3000'];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `L'origine ${origin} n'est pas autorisée par CORS.`;
      return callback(new Error(msg), false);
    }
    callback(null, origin);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
};

app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

app.use(cors(corsOptions));
app.use(express.json());

app.use('/ollama', ollamaRoutes);

app.use('/api/uploads', express.static('uploads'));
app.use('/api', authRedirectRoute);
app.use('/api/auth', require('../src/routes/auth.routes'));
app.use('/api/users', require('../src/routes/user.routes'));
app.use('/api/roles', roleRoutes);
app.use('/api/actions', actionRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/testsuites', testSuiteRoutes);
app.use("/api/plantest", plantestRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/ollama", ollamaRoutes);
app.use("/auth", authMagic);

// Middleware global pour rafraîchir le token si valide
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

mongoose.connect(process.env.MONGODB_URI, {
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