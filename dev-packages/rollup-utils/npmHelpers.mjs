/**
 * Rollup config docs: https://rollupjs.org/guide/en/#big-list-of-options
 */

import * as fs from 'fs';
import { builtinModules } from 'module';
import * as path from 'path';
import { fileURLToPath } from 'url';

import deepMerge from 'deepmerge';

import { defineConfig } from 'rollup';
import {
  makeCleanupPlugin,
  makeCodeCovPlugin,
  makeDebugBuildStatementReplacePlugin,
  makeExtractPolyfillsPlugin,
  makeNodeResolvePlugin,
  makeRrwebBuildPlugin,
  makeSetSDKSourcePlugin,
  makeSucrasePlugin,
} from './plugins/index.mjs';
import { makePackageNodeEsm } from './plugins/make-esm-plugin.mjs';
import { mergePlugins } from './utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const packageDotJSON = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), './package.json'), { encoding: 'utf8' }));

export function makeBaseNPMConfig(options = {}) {
  const {
    entrypoints = ['src/index.ts'],
    esModuleInterop = false,
    hasBundles = false,
    packageSpecificConfig = {},
    addPolyfills = true,
    sucrase = {},
  } = options;

  const nodeResolvePlugin = makeNodeResolvePlugin();
  const sucrasePlugin = makeSucrasePlugin({ disableESTransforms: !addPolyfills, ...sucrase });
  const debugBuildStatementReplacePlugin = makeDebugBuildStatementReplacePlugin();
  const cleanupPlugin = makeCleanupPlugin();
  const extractPolyfillsPlugin = makeExtractPolyfillsPlugin();
  const setSdkSourcePlugin = makeSetSDKSourcePlugin('npm');
  const rrwebBuildPlugin = makeRrwebBuildPlugin({
    excludeShadowDom: undefined,
    excludeIframe: undefined,
  });

  const codecovPlugin = makeCodeCovPlugin();

  const defaultBaseConfig = {
    input: entrypoints,

    output: {
      // an appropriately-named directory will be added to this base value when we specify either a cjs or esm build
      dir: hasBundles ? 'build/npm' : 'build',

      sourcemap: true,

      // Include __esModule property when generating exports
      // Before the upgrade to Rollup 4 this was included by default and when it was gone it broke tests
      esModule: true,

      // output individual files rather than one big bundle
      preserveModules: true,

      // Allow wrappers or helper functions generated by rollup to use any ES2015 features except symbols. (Symbols in
      // general are fine, but the `[Symbol.toStringTag]: 'Module'` which Rollup adds alongside `__esModule:
      // true` in CJS modules makes it so that Jest <= 29.2.2 crashes when trying to mock generated `@sentry/xxx`
      // packages. See https://github.com/getsentry/sentry-javascript/pull/6043.)
      generatedCode: {
        preset: 'es2015',
        symbols: false,
      },

      // don't add `"use strict"` to the top of cjs files
      strict: false,

      // do TS-3.8-style exports
      //     exports.dogs = are.great
      // rather than TS-3.9-style exports
      //     Object.defineProperty(exports, 'dogs', {
      //       enumerable: true,
      //       get: () => are.great,
      //     });
      externalLiveBindings: false,

      // Don't call `Object.freeze` on the results of `import * as someModule from '...'`
      // (We don't need it, so why waste the bytes?)
      freeze: false,

      // Equivalent to `esModuleInterop` in tsconfig.
      // Controls whether rollup emits helpers to handle special cases where turning
      //     `import * as dogs from 'dogs'`
      // into
      //     `const dogs = require('dogs')`
      // doesn't work.
      //
      // `auto` -> emit helpers
      // `esModule` -> don't emit helpers
      interop: esModuleInterop ? 'auto' : 'esModule',
    },

    plugins: [
      nodeResolvePlugin,
      setSdkSourcePlugin,
      sucrasePlugin,
      debugBuildStatementReplacePlugin,
      rrwebBuildPlugin,
      cleanupPlugin,
      codecovPlugin,
    ],

    // don't include imported modules from outside the package in the final output
    external: [
      ...builtinModules,
      ...Object.keys(packageDotJSON.dependencies || {}),
      ...Object.keys(packageDotJSON.peerDependencies || {}),
      ...Object.keys(packageDotJSON.optionalDependencies || {}),
    ],
  };

  if (addPolyfills) {
    defaultBaseConfig.plugins.push(extractPolyfillsPlugin);
  }

  return deepMerge(defaultBaseConfig, packageSpecificConfig, {
    // Plugins have to be in the correct order or everything breaks, so when merging we have to manually re-order them
    customMerge: key => (key === 'plugins' ? mergePlugins : undefined),
  });
}

export function makeNPMConfigVariants(baseConfig, options = {}) {
  const { emitEsm = true } = options;

  const variantSpecificConfigs = [{ output: { format: 'cjs', dir: path.join(baseConfig.output.dir, 'cjs') } }];

  if (emitEsm) {
    variantSpecificConfigs.push({
      output: { format: 'esm', dir: path.join(baseConfig.output.dir, 'esm'), plugins: [makePackageNodeEsm()] },
    });
  }

  return variantSpecificConfigs.map(variant => deepMerge(baseConfig, variant));
}

/**
 * This creates a loader file at the target location as part of the rollup build.
 * This loader script can then be used in combination with various Node.js flags (like --import=...) to monkeypatch 3rd party modules.
 */
export function makeOtelLoaders(outputFolder, hookVariant) {
  if (hookVariant !== 'otel' && hookVariant !== 'sentry-node') {
    throw new Error('hookVariant is neither "otel" nor "sentry-node". Pick one.');
  }

  const expectedRegisterLoaderLocation = `${outputFolder}/register.mjs`;
  const foundRegisterLoaderExport = Object.keys(packageDotJSON.exports ?? {}).some(key => {
    return packageDotJSON?.exports?.[key]?.import?.default === expectedRegisterLoaderLocation;
  });
  if (!foundRegisterLoaderExport) {
    throw new Error(
      `You used the makeOtelLoaders() rollup utility without specifying the register loader inside \`exports[something].import.default\`. Please add "${expectedRegisterLoaderLocation}" as a value there (maybe check for typos - it needs to be "${expectedRegisterLoaderLocation}" exactly).`,
    );
  }

  const expectedHooksLoaderLocation = `${outputFolder}/hook.mjs`;
  const foundHookLoaderExport = Object.keys(packageDotJSON.exports ?? {}).some(key => {
    return packageDotJSON?.exports?.[key]?.import?.default === expectedHooksLoaderLocation;
  });
  if (!foundHookLoaderExport) {
    throw new Error(
      `You used the makeOtelLoaders() rollup utility without specifying the hook loader inside \`exports[something].import.default\`. Please add "${expectedHooksLoaderLocation}" as a value there (maybe check for typos - it needs to be "${expectedHooksLoaderLocation}" exactly).`,
    );
  }

  const requiredDep = hookVariant === 'otel' ? '@opentelemetry/instrumentation' : '@sentry/node';
  const foundImportInTheMiddleDep = Object.keys(packageDotJSON.dependencies ?? {}).some(key => {
    return key === requiredDep;
  });
  if (!foundImportInTheMiddleDep) {
    throw new Error(
      `You used the makeOtelLoaders() rollup utility but didn't specify the "${requiredDep}" dependency in ${path.resolve(
        process.cwd(),
        'package.json',
      )}. Please add it to the dependencies.`,
    );
  }

  return defineConfig([
    // register() hook
    {
      input: path.join(
        __dirname,
        'code',
        hookVariant === 'otel' ? 'otelEsmRegisterLoaderTemplate.js' : 'sentryNodeEsmRegisterLoaderTemplate.js',
      ),
      external: ['@opentelemetry/instrumentation/hook.mjs', '@sentry/node/register'],
      output: {
        format: 'esm',
        file: path.join(outputFolder, 'register.mjs'),
      },
    },
    // --loader hook
    {
      input: path.join(
        __dirname,
        'code',
        hookVariant === 'otel' ? 'otelEsmHooksLoaderTemplate.js' : 'sentryNodeEsmHooksLoaderTemplate.js',
      ),
      external: ['@opentelemetry/instrumentation/hook.mjs', '@sentry/node/hook'],
      output: {
        format: 'esm',
        file: path.join(outputFolder, 'hook.mjs'),
      },
    },
  ]);
}
