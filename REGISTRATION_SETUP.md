# User Registration Setup - Complete Implementation Guide

## Overview
User registration has been fully implemented in both the Angular frontend and Node.js backend with proper validation, error handling, and security measures.

---

## Backend Setup (Node.js + Express + MongoDB)

### API Endpoint
```
POST http://localhost:3000/api/auth/register
```

### Request Body
```json
{
  "username": "string (3+ characters)",
  "email": "string (valid email)",
  "password": "string (6+ characters)",
  "confirmPassword": "string (must match password)"
}
```

### Response (Success - 201)
```json
{
  "message": "User registered successfully",
  "token": "jwt_token_here",
  "user": {
    "id": "mongo_user_id",
    "username": "john_doe",
    "email": "john@example.com"
  }
}
```

### Response (Error - 400/500)
```json
{
  "error": "Error message describing the issue"
}
```

### Backend Features
✅ **User Model Validation:**
- Username: Required, unique, 3+ characters, trimmed
- Email: Required, unique, valid email format
- Password: Required, 6+ characters, hashed with bcrypt (salt 10)
- Timestamps: createdAt and updatedAt

✅ **Security:**
- Passwords are hashed using bcrypt before storage
- Password comparison uses bcrypt.compare()
- Validation on both frontend and backend
- JWT tokens generated with 7-day expiration

✅ **Error Handling:**
- Missing field validation
- Password mismatch detection
- Duplicate user prevention (email/username)
- Comprehensive error messages

---

## Frontend Setup (Angular)

### SignUp Component Files
- [signup.component.ts](./Reback-Angular_v1.0/Admin/src/app/views/auth/signup/signup.component.ts)
- [signup.component.html](./Reback-Angular_v1.0/Admin/src/app/views/auth/signup/signup.component.html)

### Component Features
✅ **Reactive Forms with Validation:**
- FormBuilder for form creation
- Custom password match validator
- Real-time validation feedback
- Form controls for: username, email, password, confirmPassword, termsAccepted

✅ **User Experience:**
- Password visibility toggle (eye icon)
- Loading state during submission
- Error/success messages display
- Form validation messages per field
- Submit button disabled during loading
- Disabled submit if form is invalid

✅ **Form Validations:**
| Field | Rules |
|-------|-------|
| Username | Required, min 3 characters |
| Email | Required, valid email format |
| Password | Required, min 6 characters |
| Confirm Password | Required, must match password |
| Terms | Must be checked |

### Authentication Service Integration
The [auth.service.ts](./Reback-Angular_v1.0/Admin/src/app/core/services/auth.service.ts) includes:
```typescript
register(username: string, email: string, password: string, confirmPassword: string)
```

This method:
1. Sends POST request to backend `/register` endpoint
2. Stores JWT token in cookies on success
3. Sets user session data
4. Returns user object with token

---

## Testing the Registration Flow

### 1. Start Backend Server
```bash
cd backend-2026
npm install
npm start
```
Server runs on: `http://localhost:3000`

### 2. Start Angular Dev Server
```bash
cd Reback-Angular_v1.0/Admin
npm install
ng serve
```
Angular runs on: `http://localhost:4200`

### 3. Test Registration
1. Navigate to signup page: `http://localhost:4200/auth/sign-up`
2. Fill in the form:
   - Username: `testuser123`
   - Email: `test@example.com`
   - Password: `password123`
   - Confirm Password: `password123`
   - Check "I accept Terms and Condition"
3. Click "Sign Up"

### Expected Results
✅ **Success Case:**
- No validation errors
- Form submits
- Loading spinner appears
- User redirected to home page `/`
- Token stored in cookies

❌ **Failure Cases (tested automatically):**
- Missing fields → Field errors shown
- Password mismatch → Error message displayed
- Duplicate email → Backend error: "User already exists"
- Invalid email format → Validation error shown
- Short password (< 6 chars) → Validation error shown
- Unchecked terms → Cannot submit

---

## Password Visibility Toggle
The signup form includes a password visibility toggle button:
- Click eye icon to show/hide password
- Applies to both password and confirm password fields
- Uses `showPassword` boolean flag in component

---

## Error Handling Flow

### Frontend Error Handling
1. Component catches HTTP errors via `error` callback
2. Displays `error.error.error` message to user
3. Falls back to generic message if no specific error
4. Shows error alert in template with dismiss button

### Backend Error Handling
1. Validation errors return 400 status
2. Duplicate user returns 400 status
3. Server errors return 500 status
4. All errors include descriptive messages

---

## Security Considerations

1. **Password Hashing:** Bcrypt with 10 salt rounds
2. **Token Storage:** JWT in secure HTTP-only cookies
3. **Validation:** Both client and server-side
4. **Error Messages:** Generic enough to not leak information
5. **CORS:** Configure based on your environment
6. **HTTPS:** Use in production

---

## Database Schema
MongoDB User Collection:
```json
{
  "_id": ObjectId,
  "username": "string",
  "email": "string",
  "password": "hashed_string",
  "createdAt": "ISO Date",
  "updatedAt": "ISO Date"
}
```

---

## Next Steps

1. ✅ Verify both servers are running
2. ✅ Test the complete registration flow
3. ✅ Check browser console for logs (starts with 📱, ✅, ❌)
4. Consider adding:
   - Email verification/confirmation
   - Rate limiting on registration endpoint
   - CAPTCHA for bot prevention
   - User roles/permissions system

---

## Support
Check browser console and Node server logs for detailed debugging information.
Frontend logs use prefixes: 📱 (call), ✅ (success), ❌ (error), 💾 (save)
