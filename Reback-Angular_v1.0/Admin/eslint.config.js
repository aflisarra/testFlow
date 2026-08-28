const eslint = require("@eslint/js"); // Loads ESLint's official JavaScript rule presets.
const { defineConfig } = require("eslint/config"); // Loads the helper that validates and types the flat configuration.
const tseslint = require("typescript-eslint"); // Loads TypeScript parsing and linting presets.
const angular = require("angular-eslint"); // Loads Angular TypeScript and template linting presets.

module.exports = defineConfig([ 
  { 
    linterOptions: { // Configures ESLint's own reporting behavior.
      reportUnusedDisableDirectives: "error", // Rejects eslint-disable comments that no longer suppress a violation.
    },
  }, 
  { 
    files: ["**/*.ts"], // Applies this configuration to every TypeScript file in the project.
    extends: [ // Combines the shared rule presets used for TypeScript source files.
      eslint.configs.recommended, // Enables ESLint's recommended JavaScript rules.
      tseslint.configs.recommended, // Enables recommended TypeScript correctness rules.
      tseslint.configs.stylistic, // Enables recommended TypeScript style rules.
      angular.configs.tsRecommended, // Enables recommended Angular rules for TypeScript code.
    ],
    processor: angular.processInlineTemplates, // Extracts and lints HTML found in inline Angular component templates.
    rules: { // Defines project-specific TypeScript and Angular rule overrides.
      eqeqeq: ["error", "always"], // Requires strict equality operators such as === and !==.
      curly: ["error", "multi-line"], // Requires braces when a control-flow body spans multiple lines.
      "@typescript-eslint/consistent-type-imports": "warn", // Warns when type-only imports do not use import type syntax.
      "@typescript-eslint/no-explicit-any": "warn", // Warns when code explicitly opts out of type safety with any.
      "no-console": ["warn", { allow: ["warn", "error"] }], // Warns on console calls except console.warn and console.error.
      "@angular-eslint/directive-selector": [ // Enforces the naming convention for Angular directives.
        "error", // Treats an invalid directive selector as a lint error.
        { // Starts the directive-selector options.
          type: "attribute", // Requires directives to use attribute selectors.
          prefix: "app", // Requires directive selectors to begin with the app prefix.
          style: "camelCase", // Requires directive selectors to use camelCase.
        }, 
      ], 
      "@angular-eslint/component-selector": [ // Enforces the naming convention for Angular components.
        "error", // Treats an invalid component selector as a lint error.
        { // Starts the component-selector options.
          type: "element", // Requires components to use custom-element selectors.
          prefix: "app", // Requires component selectors to begin with the app prefix.
          style: "kebab-case", // Requires component selectors to use kebab-case.
        }, 
      ], 
    }, 
  },
  { // Starts the configuration applied to Angular HTML templates.
    files: ["**/*.html"], // Applies this configuration to every HTML template in the project.
    extends: [ // Combines the shared Angular template rule presets.
      angular.configs.templateRecommended, // Enables recommended Angular template correctness rules.
      angular.configs.templateAccessibility, // Enables recommended Angular template accessibility rules.
    ],
    rules: {}, // Leaves room for project-specific HTML template rule overrides.
  }, 
]); 
