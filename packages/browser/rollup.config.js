import commonjs from 'rollup-plugin-commonjs';
import uglify from 'rollup-plugin-uglify';
import resolve from 'rollup-plugin-node-resolve';
import typescript from 'rollup-plugin-typescript2';

export default [
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'cjs',
      exports: 'named',
      interop: false,
    },
    external: ['raven-js', '@sentry/core', '@sentry/utils'],
    plugins: [
      typescript({
        tsconfig: 'tsconfig.build.json',
      }),
      commonjs(),
    ],
  },
  {
    input: 'src/index.ts',
    output: {
      file: 'build/bundle.min.js',
      format: 'iife',
      name: 'window',
      sourcemap: true,
      interop: false,
      extend: true,
    },
    plugins: [
      typescript({
        tsconfig: 'tsconfig.build.json',
        tsconfigOverride: { compilerOptions: { declaration: false } },
      }),
      resolve({
        jsnext: true,
        main: true,
        browser: true,
      }),
      commonjs(),
      uglify(),
    ],
  },
];
