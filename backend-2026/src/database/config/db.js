/**
 * ================================================================================
 * MONGODB DATABASE CONNECTION (db.js)
 * ================================================================================
 * 
 * PURPOSE:
 * This module handles the connection to MongoDB using Mongoose ODM.
 * It provides a reusable connection function that can be imported
 * throughout the application.
 * 
 * FUNCTIONS:
 * - connectDB(): Async function that connects to MongoDB using the
 *                connection string from environment variables (MONGODB_URL)
 * 
 * DEPENDENCIES:
 * - mongoose: MongoDB Object Data Mapper (ODM) for Node.js
 * - dotenv: Reads MONGODB_URL from .env file
 * 
 * ERROR HANDLING:
 * - If connection fails, logs the error and exits the process (process.exit(1))
 * - This prevents the server from running without a database connection
 * 
 * USAGE:
 *   const connectDB = require('./path/to/db');
 *   await connectDB(); // Call this before starting the server
 * 
 * ================================================================================
 */

const mongoose = require('mongoose');

/**
 * Connect to MongoDB database
 * Uses MONGODB_URL from environment variables
 * @returns {Promise<void>} Resolves when connected, never rejects
 */
const connectDB = async () => {
  try {
    // Connect to MongoDB with connection options
    // useNewUrlParser: Use new URL parser (recommended)
    // useUnifiedTopology: Use new unified topology engine (recommended)
    await mongoose.connect(process.env.MONGODB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');
  } catch (err) {
    // Log error and exit application if database connection fails
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
  }
};

module.exports = connectDB;
