import babel from '@rollup/plugin-babel';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import dts from 'rollup-plugin-dts';
import { readFileSync } from 'fs';

// Load package.json content
const packageJson = JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf8')
);

export default [
  // CommonJS and ES Modules builds
  {
    input: 'src/index.ts',
    output: [
      {
        file: packageJson.main,
        format: 'cjs',
        sourcemap: true,
      },
      {
        file: packageJson.module,
        format: 'esm',
        sourcemap: true,
      }
    ],
    external: [
      ...Object.keys(packageJson.dependencies || {}),
      ...Object.keys(packageJson.peerDependencies || {}),
      'react/jsx-runtime'
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
      babel({
        babelHelpers: 'bundled',
        exclude: 'node_modules/**',
        extensions: ['.ts', '.tsx'],
        presets: ['@babel/preset-env', '@babel/preset-react', '@babel/preset-typescript']
      }),
      terser()
    ]
  },
  // TypeScript declaration files
  {
    input: 'src/index.ts',
    output: {
      file: packageJson.types,
      format: 'es',
    },
    plugins: [dts()],
    external: [
      ...Object.keys(packageJson.dependencies || {}),
      ...Object.keys(packageJson.peerDependencies || {})
    ]
  }
];
