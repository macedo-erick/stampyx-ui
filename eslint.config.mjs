import js from '@eslint/js';
import angular from 'angular-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strict,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
      eslintConfigPrettier,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      /**
       * A decorated class carries its behaviour in the decorator, so an empty body is a
       * normal Angular shell (`App` is just a `<router-outlet />`). Undecorated
       * static-only classes are still reported.
       */
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      /**
       * The rule only recognises `void` in type positions (`Observable<void>`), not in call
       * type arguments — which is exactly how `output<void>()` and `http.delete<void>(url)`
       * are written. Both are the idiomatic spelling, so the rule has nothing to add here.
       */
      '@typescript-eslint/no-invalid-void-type': 'off',
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      /**
       * Specs assert a value is non-null and then dereference it; the assertion is the
       * point of the test, and a null slipping through fails the expectation right above.
       */
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility, eslintConfigPrettier],
  },
);
