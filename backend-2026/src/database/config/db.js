const mongoose = require('mongoose');
const MESSAGES = require('../../constants/messages')
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    if (process.env.NODE_ENV !== MESSAGES.FASTAPI.PRODUCTION) {
      console.log(MESSAGES.MONGODB.CONNECTED);
    }
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
  }
};

module.exports = connectDB;
