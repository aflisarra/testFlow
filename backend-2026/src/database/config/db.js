const mongoose = require('mongoose');
const MESSAGES = require('../../constants/messages');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_URL;

    if (!mongoUri) {
      throw new Error('MONGODB_URI or MONGODB_URL is not defined');
    }

    await mongoose.connect(mongoUri);

    if (process.env.NODE_ENV !== MESSAGES.FASTAPI.PRODUCTION) {
      console.log('✅ Connected to MongoDB:', mongoose.connection.name);
    }
  } catch (err) {
    console.error('❌ Error connecting to MongoDB:', err);
    process.exit(1);
  }
};

module.exports = connectDB;