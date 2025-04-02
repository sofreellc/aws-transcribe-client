module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
    collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        '!src/**/*.d.ts',
        '!src/**/index.ts'
    ],
    moduleNameMapper: {
        // Handle CSS imports (with CSS modules)
        '^.+\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',
        // Handle CSS imports (without CSS modules)
        '^.+\\.(css|sass|scss)$': '<rootDir>/__mocks__/styleMock.js',
        // Handle image imports
        '^.+\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/__mocks__/fileMock.js'
    },
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    transform: {
        '^.+\\.(ts|tsx)$': [
            'ts-jest',
            {
                tsconfig: '<rootDir>/tsconfig.json'
            }
        ]
    }
};
