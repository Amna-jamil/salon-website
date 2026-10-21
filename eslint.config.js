import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/**", "node_modules/**", "data/**", "supabase/.temp/**"] },
  js.configs.recommended,
  { files: ["src/**/*.js"], languageOptions: { globals: globals.browser } },
  {
    files: ["**/*.test.js", "*.config.js", "server/**/*.js"],
    languageOptions: { globals: globals.node },
  },
];
