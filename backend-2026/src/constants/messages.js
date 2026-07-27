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
    LOGIN_ERROR:'Erreur login:',
    SIGNUP_ROLES_ERROR: 'Error fetching signup roles:',
    USER:'user',
    PASSWORD:'-password',
    NAME_PICTURE:'name picture email',
    ID: '_id',
    FORGOT_PASSWORD:'forgotPassword error:',
    VERIFY_MAGIC:'verifyMagicToken error:',
    EXPIRE:'expiré',
    VERIFY_OPT :'verifyOTP error:',
    INVALID:'invalid',
    RESETPASSWORD:'resetPassword error:',
    MINIMUM: 'Minimum',
    FAILED_ACTION:'Failed to load actions',
    ID_NAME:'_id name',
  },

  AUTH: {
    USER_NOT_FOUND: 'User Not Found',
    FUNCTION:'function' ,
    ADMIN:'admin',
    CURRENT_PASSWORD: 'currentPassword et newPassword requis',
    PASSWORD_UPDATE :'Mot de passe modifié avec succès',
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
    ERROR_TITLE: 'Project title is required',
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
    ROLE_DELETE:'Role deleted',
    ROLE_REASSIGNED_AND_DELETED:'ROLE_REASSIGNED_AND_DELETED',
    SUCCESS:'Success',
    ID_EMAIL:'_id email role roleId',
    MIGRATE_USER_ROLEID_FAILED:'❌ migrate-user-roleid failed:',
  },
  INVITATION:{
    NOT_FOUND: 'Invitation not found',
    ERROR: 'Invitation error',
    UNAUTHORIZED: 'Unauthorized',
    FORBIDDEN: 'Forbidden',
    ACCEPTED: 'Invitation accepted',
    IGNORED: 'Invitation ignored',
  },

  TESTSUITE: {
    SESSION_SAVED: 'Session saved successfully',
    DELETED: 'Test suite deleted successfully',
    FAILED: 'FastAPI request failed',
    ERROR: 'FASTAPI_ERROR',
    NOT_FOUND: 'TestSuite not found',
    ERROR_EXPECTED : 'Unexpected server error',
    START_EXECUTION:'[EXECUTE] Starting background execution for suite',
    NOT_FOUND:'Suite not found',
    TESTSUITE_ID_REQUIRED:'Valid testSuiteId required',
  },

  TESTCASES:{
    EXECUTE:'[EXECUTE] Running test case',
    SAVED:'[EXECUTE] Test case saved', 
    ERROR_EXECUTE:'[EXECUTE] Test case execution error:',
    FINISHED :'[EXECUTE] Background execution finished for suite',
    FAILED:'[EXECUTE] Background execution failed:', 
   DELETED:'TestCase deleted successfully',
   NO_TEST_CASES:'No test cases found for this plan',
   STEPS_REQUIRED:'testCase.steps is required',
   GENERATE_ERROR:'Generate test cases failed',
   CANCEL_GENERATE:'Cancel generation failed',
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

  STATUSTEST:{
    PASSED: 'passed',
    FAILED_ASSERTION: 'failed_assertion',
    ERROR: 'error',
    FAILED_EXECUTION: 'failed_execution',
   ABORTED: 'aborted',
   FAIL:'fail',
  },
 SELENIUM :{
RUNNER_NOT_AVAILABLE:'[EXECUTE] Selenium runner not available:',
EXECUTION_NOT_IMPLEMENTED:'Execution not implemented. Selenium runner not available.',
EXECUTION_STARTED:'Execution started',
GET_EXECUTIONS_ERROR:'🔥 getExecutions error:',
RUNNING :'running',
FINISHED:'finished',
EXECTION_FAILED_SAVE:'⚠️ Execution save failed:',
ERROR_FETCHING :'Error fetching executions',
NOT_FOUND:'Execution not found',
DETAILS_SENT:'✅ DETAIL STEPS SENT:',
GET_EXECUTION_DETAIL_ERROR:'🔥 getExecutionDetail error:',
EXECTION_ID_REQUIRED:'executionId required',
ABORT_EXECUTION_ERROR:'❌ abortExecution:',
 },

 CONSOLE:{
  FILTER_QUERY:'🔎 FILTER QUERY:',
  STRING:'string',
  MISSING : 'Missing required fields',
  TYPE:"TYPE:",
  OBJECT:'object',
 },

 TESTPLAN:{
  DELEDTED:'TestPlan deleted successfully',
  CONTROLLER_ERROR:'🔥 CONTROLLER ERROR:',
  TESTPLAN_RECEIVED:"TESTPLANS RECEIVED:",
  ERROR_SAVE_PLAN:'🔥 savePlans error:',
 },

 SPECIFICATION:{
FAILED:'Get specification content failed',
UPDATE_FAILED:'Update specification content failed',
 },
 DOC:{
  CONTENT_TYPE:'Content-Type',
  APPLICATION_PDF:'application/pdf',
  CONTENT_POSITION:'Content-Disposition',
  FAILED_GENERATE_REPORT:'Failed to generate report',
 },

 DATE:{
  FORME_DATE:'%Y-%m-%d',
  START_DATE:'$startedAt',
  STATUS:'$status',
 },

FASTAPI:{
FASTAPI_ERROR:'FastAPI unreachable',
FASTAPI_CHAT_ERROR:'FastAPI chat failed',
GET_PLAN_ERROR:'Get plan failed',
GET_TEST_PLANS_ERROR:'Get test plans failed',
GET_SPECIFICATION_DOCUMENT_ERROR:'Get specification document failed',
GENERATION_CANCELLED_BY_USER:'Generation cancelled by user.',
GENERATE_PLAN_ERROR:'Generate plan failed',
INCOMPLETE:'Incomplete',
STEP_DETAILS:'🔥 RAW stepDetails from Python:',
FAILED:'Either failedStep or logs must be provided',
UNKNOWN:'unknown',
DETECTION_ERROR:'[Controller] detectFailure error:',
FAILED_TO_DETECT_FAILURE:'Failed to detect failure',
DEVLOPMENT:'development',
GETFIX_ERROR:'[Controller] getFixSuggestion error:',
FAILED_TO_GETFIX:'Failed to get fix suggestion',
PRODUCTION:'production',
 },

 MONGODB:{
CONNECTED:'MongoDB connected',
ERROR_CONNECT:'Error connecting to MongoDB:',
MISSSING_MONGODB_URI:'Missing MongoDB URI. Define MONGODB_URI (or MONGODB_URL) in .env',
URL_NOT_FOUND:'MONGODB_URI manquant dans .env',

 },

 ACTIONS:{
ADD_USER:'add-user',
DASHBOARD:'dashboard',
EDIT_USER:'edit-user',
VIEW_USER :'view-user',
DELETE_USER:'delete-user',
ADD_ROLE:'add-role',
EDIT_ROLE:'edit-role',
VIEW_ROLE:'view-role',
DELETE_ROLE:'delete-role',
LIST_USER:'list-users',
LIST_PROJECTS:'list-projects',
CREATE_PROJECT:'create-project',
VieW_PROJECT:'view-project',
EDIT_PROJECT:'edit-project',
DELETE_PROJECT:'delete-project',
INVITE_PROJECT:'invite-project',
LIST_ROLE:'list-role',
 }
};
