// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // Kept: element selectors, kebab-case. Dropped: the "app" prefix.
      //
      // This app names its components after what they are -- `world-drop`,
      // `stat-table`, `mission-detail` -- and does so consistently across all
      // 17 of them. The prefix exists to stop a component colliding with
      // another library's, which cannot happen here: nothing imports this
      // app's components, and every selector is already hyphenated, so none
      // of them can collide with a current or future HTML element either.
      // Renaming seventeen components and every template that uses them to
      // satisfy a default would be churn, not a fix.
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', style: 'kebab-case', prefix: [] },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', style: 'camelCase', prefix: [] },
      ],
    },
  },
  {
    files: ['**/*.html'],
    // templateAccessibility is the reason this is worth running in CI: it
    // catches the missing alt, the click handler on a non-interactive
    // element, and the label with nothing bound to it.
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
