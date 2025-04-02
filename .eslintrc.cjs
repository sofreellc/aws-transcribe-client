module.exports = {
    parser: '@typescript-eslint/parser',
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:react/recommended',
        'plugin:react-hooks/recommended'
    ],
    plugins: ['@typescript-eslint', 'react', 'react-hooks'],
    env: {
        browser: true,
        es6: true,
        node: true
    },
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        warnOnUnsupportedTypeScriptVersion: false,
        ecmaFeatures: {
            jsx: true
        }
    },
    settings: {
        react: {
            version: 'detect'
        }
    },
    rules: {
        'react/prop-types': 'off', // We're using TypeScript for props validation
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': ['error', {
            'argsIgnorePattern': '^_',
            'varsIgnorePattern': '^_'
        }],
        'no-console': ['warn', { allow: ['warn', 'error'] }]
    },
    overrides: [
        {
            files: ['*.js'],
            rules: {
                '@typescript-eslint/no-var-requires': 'off'
            }
        }
    ]
};
