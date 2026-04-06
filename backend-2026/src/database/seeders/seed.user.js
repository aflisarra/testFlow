require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../../models/role.model');
const Action = require('../../models/action.model');
const bcrypt = require('bcryptjs');
const User = require('../../models/user.model');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URL;

const adminUsers = [
  {
    name: 'Admin',
    email: 'admin@example.com',
    password: '123',
    description: 'Compte administrateur initial',
  },
  {
    name: 'Admin 2',
    email: 'admin2@example.com',
    password: '123',
    description: 'Deuxieme compte administrateur',
  },
];

const seedUser = async () => {
  try {
    if (!MONGODB_URI) {
      throw new Error('Missing MongoDB URI. Define MONGODB_URI (or MONGODB_URL) in .env');
    }

    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    let adminRole = await Role.findOne({ name: 'admin' });
    if (!adminRole) {
      const allActionIds = (await Action.find({})).map((a) => a._id);
      adminRole = await Role.create({
        name: 'admin',
        description: 'Full access',
        actions: allActionIds,
      });
    }

    let createdCount = 0;
    for (const u of adminUsers) {
      const existingUser = await User.findOne({ email: u.email });
      if (existingUser) {
        console.log(`User already exists: ${u.email}`);
        continue;
      }

      const hashedPassword = await bcrypt.hash(u.password, 10);
      const user = new User({
        name: u.name,
        email: u.email,
        password: hashedPassword,
        roleId: adminRole._id,
        role: adminRole.name,
        description: u.description,
        picture: null,
      });

      await user.save();
      createdCount += 1;
      console.log(`User added: ${u.email}`);
    }

    console.log(`User seeding done. New users: ${createdCount}`);
    process.exit();
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seedUser();
