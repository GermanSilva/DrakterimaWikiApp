import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'data', 'docs', 'odd'] },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      // Capitalized names are ignored because core no-unused-vars cannot see JSX usage.
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_', caughtErrors: 'none' }],
      // Downgrade the preset to warnings. Severity may be a string/number or the array form
      // `['error', {...options}]`; both are rewritten, options are preserved.
      ...Object.fromEntries(
        Object.entries(reactHooks.configs.recommended.rules).map(([k, v]) => {
          const [severity, ...options] = Array.isArray(v) ? v : [v]
          const downgraded = severity === 'error' || severity === 2 ? 'warn' : severity
          return [k, Array.isArray(v) ? [downgraded, ...options] : downgraded]
        }),
      ),
      // Real runtime bugs: keep these as errors even though the rest of the preset is downgraded.
      'react-hooks/rules-of-hooks': 'error',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
  },
  {
    files: ['*.config.js'],
    languageOptions: { globals: globals.node },
  },
)
