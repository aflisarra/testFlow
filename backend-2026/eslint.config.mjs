import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";

export default defineConfig([
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**"
    ],
  },
  {
    files: ["**/*.{js,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      globals: globals.node,
      sourceType: "commonjs",
    },
  },
  {
    files: ["**/*.mjs"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      globals: globals.node,
      sourceType: "module",
    },
  },
]);