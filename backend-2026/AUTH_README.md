# User Authentication System Documentation

## Overview
This is a complete user authentication system with login, logout, and protected routes.

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the backend directory (copy from `.env.example`):
```
MONGO_URI=mongodb://localhost:27017/pfe-2026
JWT_SECRET=your-secret-key-pfe-2026-change-in-production
PORT=3000
NODE_ENV=development
```

### 3. Install MongoDB
- Download and install MongoDB Community Edition from https://www.mongodb.com/try/download/community
- Or use Docker: `docker run -d -p 27017:27017 --name mongodb mongo`

### 4. Seed the Database
```bash
npm run seed
```

This will create sample users:
- **admin** / admin@example.com / password: admin123
- **user1** / user1@example.com / password: user123
- **user2** / user2@example.com / password: user123

### 5. Start the Server
```bash
npm run dev  # Development with auto-reload
npm start    # Production
```

## API Endpoints

### Authentication Routes

#### Register User
```http
POST /auth/register
Content-Type: application/json

{
  "username": "newuser",
  "email": "newuser@example.com",
  "password": "password123",
  "confirmPassword": "password123"
}
```

**Response (201):**
```json
{
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "newuser",
    "email": "newuser@example.com"
  }
}
```

#### Login User
```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "admin123"
}
```

**Response (200):**
```json
{
  "message": "Logged in successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "admin",
    "email": "admin@example.com"
  }
}
```

#### Logout User
```http
POST /auth/logout
Authorization: Bearer <your_jwt_token>
```

**Response (200):**
```json
{
  "message": "Logged out successfully"
}
```

#### Get User Profile
```http
GET /auth/profile
Authorization: Bearer <your_jwt_token>
```

**Response (200):**
```json
{
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "admin",
    "email": "admin@example.com",
    "createdAt": "2026-02-10T12:00:00.000Z"
  }
}
```

## Project Structure

```
backend-2026/
├── src/
│   ├── config/
│   │   └── database.ts          # MongoDB configuration
│   ├── controllers/
│   │   ├── auth.controller.ts   # Authentication logic
│   │   └── chat.controller.ts   # Chat logic
│   ├── middleware/
│   │   └── auth.middleware.ts   # JWT verification middleware
│   ├── models/
│   │   └── User.ts              # User schema and model
│   ├── routes/
│   │   ├── auth.routes.ts       # Auth endpoints
│   │   └── chat.routes.ts       # Chat endpoints
│   ├── scripts/
│   │   └── seed.ts              # Database seeder
│   └── index.js                 # Main application file
├── .env                         # Environment variables
├── .env.example                 # Example environment file
├── package.json
└── tsconfig.json
```

## Key Features

✅ **User Registration** - Create new user accounts with validation
✅ **User Login** - Authenticate with email and password
✅ **JWT Tokens** - Secure token-based authentication
✅ **Password Hashing** - bcrypt encryption for secure storage
✅ **Protected Routes** - Middleware to protect sensitive endpoints
✅ **User Profile** - Retrieve authenticated user information
✅ **Database Seeding** - Pre-populate database with sample data

## Security Features

- Password hashing with bcryptjs (10 salt rounds)
- JWT token expiration (7 days)
- Password field excluded from queries by default
- Input validation and error handling
- Email and username uniqueness checks

## Technologies Used

- **Node.js + Express** - Server framework
- **MongoDB + Mongoose** - Database and ODM
- **JWT** - Token-based authentication
- **bcryptjs** - Password hashing
- **TypeScript** - Type safety
- **dotenv** - Environment configuration

## Testing the API

You can test the API using:
- **Postman** - Import and test requests
- **VS Code Thunder Client** - Built-in REST client
- **cURL** - Command line testing

Example with cURL:
```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'

# Get Profile (replace TOKEN with actual token)
curl -X GET http://localhost:3000/auth/profile \
  -H "Authorization: Bearer TOKEN"
```

## Error Handling

All endpoints return appropriate HTTP status codes:
- **200** - Success
- **201** - Created
- **400** - Bad Request (validation error)
- **401** - Unauthorized (invalid credentials or token)
- **404** - Not Found
- **500** - Server Error

## Database Seeding

To clear and reseed the database:
```bash
npm run seed
```

To remove a user from database, you can modify the seed.ts file or use MongoDB compass/CLI.

## Next Steps

1. Connect this backend to your Angular frontend
2. Store JWT token in localStorage/sessionStorage
3. Add the token to request headers for protected routes
4. Implement logout to clear token from frontend

## Troubleshooting

### MongoDB Connection Failed
- Ensure MongoDB is running
- Check MONGO_URI in .env file
- Verify network connectivity

### JWT Token Errors
- Token might be expired (valid for 7 days)
- Check that token format is `Bearer <token>`
- Verify JWT_SECRET matches between auth and middleware

### Port Already in Use
- Change PORT in .env file
- Or kill the process using port 3000
