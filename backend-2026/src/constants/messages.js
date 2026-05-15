module.exports = {
  USER: {
    CREATED: 'User created successfully',
    UPDATED: 'User updated successfully',
    DELETED: 'User deleted successfully',
    ERROR: 'Get users error',
    NOT_FOUND: 'User not found',
    ACTIVE_PROJECT_TEAM_MEMBER: 'Cannot delete this user because they are assigned to an unfinished project team.',
    REGISTERED: 'User registered successfully',
    SIGNUP_ERROR: 'Signup error:',
    CANNOT_ASSIGN_ADMIN_ROLE: 'Cannot assign admin role on signup',
    LOGIN_ERROR: 'Erreur login:',
    SIGNUP_ROLES_ERROR: 'Error fetching signup roles:',
    USER:'user',
    PASSWORD:'-password',
  },

  AUTH: {
    USER_NOT_FOUND: 'User Not Found',
  },

  ROLE: {
    NOT_FOUND: 'Role not found',
  },

  ERROR: {
    SERVER: 'Server error',
    EMAIL_EXISTS: 'Email already in use',
    NAME_EXISTS: "Name already exists"
  },
  PROFILE:{
    ERROR: 'Get profile error',
  },
  PROJECT:{
    CREATED: 'Project created successfully',
    UPDATED: 'Project updated successfully',
    DELETED: 'Project deleted successfully',
    ERROR: 'Get projects error',
    ERROR_ID:'Project ID is required',
    NOT_FOUND: 'Project not found',
  },
  TASK:{
    CREATED: 'Task created successfully',
    UPDATED: 'Task updated successfully',
    DELETED: 'Task deleted successfully',
    ERROR: 'Get tasks error',
    NOT_FOUND: 'Task not found',
  },
  ROLE:{
    ERROR_NAME:'Role name is required',
    ROLE_EXISTS:'Role already exists',
    CREATED: 'Role created successfully',
    UPDATED: 'Role updated successfully',
    DELETED: 'Role deleted successfully',
    ERROR: 'Get roles error',
    NOT_FOUND: 'Role not found',
  },
  INVITATION:{
    NOT_FOUND: 'Invitation not found',
    ERROR: 'Invitation error',
    UNAUTHORIZED: 'Unauthorized',
    FORBIDDEN: 'Forbidden',
    ACCEPTED: 'Invitation accepted',
    IGNORED: 'Invitation ignored',
  },
  PROJECT:{
    CREATED: 'Project created successfully',
    UPDATED: 'Project updated successfully',
    DELETED: 'Project deleted successfully',
    ERROR_TITLE: 'Project title is required',
    NOT_FOUND: 'Project not found',
  }

  ,
  TESTSUITE: {
    SESSION_SAVED: 'Session saved successfully',
    DELETED: 'Test suite deleted successfully',
    FAILED: 'FastAPI request failed',
    ERROR: 'FASTAPI_ERROR',
    NOT_FOUND: 'TestSuite not found',
  },

  AUTHREDIRECT:{
    ERROR: 'Get redirect path error',
  },
  DATABASECONFIG:{
    CONNECTED: 'MongoDB connected',
    ERROR: 'Error connecting to MongoDB:',
  },


  DATABASEMIGRATION:{
    MONGO:'✅ Connecté à MongoDB',
    //MIGRATION: `✅ Migration terminée : ${result.modifiedCount} utilisateur(s) mis à jour.`,
    MIGRATIONERROR:'❌ Erreur lors de la migration :',

  },

 

};
