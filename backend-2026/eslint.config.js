const js = require('@eslint/js') // Loads ESLint's official JavaScript rule presets.
const globals = require('globals') // Provides predefined global variables for environments such as Node.js.

module.exports = [ 
  { 
    ignores: [ // Lists paths that ESLint must not inspect.
      'coverage/**', 
      'node_modules/**', 
      'public/**', 
      'uploads/**', 
    ], 
  }, 
  { 
    files: ['**/*.js'],
    ...js.configs.recommended, 
    languageOptions: { // Defines how ESLint parses and interprets the JavaScript source.
      ecmaVersion: 'latest', // Allows the latest supported ECMAScript syntax.
      sourceType: 'commonjs', // Treats files as CommonJS modules using require and module.exports.
      globals: globals.node, // Recognizes Node.js globals such as process, Buffer, and __dirname.
    }, 
    linterOptions: { // Configures ESLint's own reporting behavior.
      reportUnusedDisableDirectives: 'error', // Rejects eslint-disable comments that no longer suppress a violation.
    }, 
    rules: { // Defines project-specific rule overrides.
      eqeqeq: ['error', 'always'], // Requires strict equality operators such as === and !==.
      curly: ['error', 'multi-line'], 
      'no-console': 'off', // Allows console output because the backend currently uses it for logging.
      'no-unused-vars': [ 
        'error', // Treats unused variables as lint errors.
        { // Starts the options for the no-unused-vars rule.
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_', 
          caughtErrors: 'none', // Does not check whether catch-clause error variables are used.
          ignoreRestSiblings: true, 
        }, 
      ], 
    },
  }, 
] 
