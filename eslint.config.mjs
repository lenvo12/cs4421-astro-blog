import eslintPluginAstro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // 1. Tell ESLint to ignore auto-generated Astro files
  {
    ignores: [".astro/**", "node_modules/**", "dist/**"]
  },

  // 2. Applies recommended rules to standard JavaScript/TypeScript files
  ...tseslint.configs.recommended,

  // 3. Applies Astro-specific rules and configures the environment
  ...eslintPluginAstro.configs.recommended,

  {
    // 4. Targets Astro components explicitly to ensure TypeScript works inside them
    files: ["**/*.astro"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: [".astro"],
      },
    },
    rules: {
      // You can add custom rule overrides here later if needed
    },
  }
);
