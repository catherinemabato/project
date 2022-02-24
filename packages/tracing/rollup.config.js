import {
  baseBundleConfig,
  makeLicensePlugin,
  markAsBrowserBuild,
  nodeResolvePlugin,
  terserPlugin,
  typescriptPluginES5,
} from '../../rollup.config';

const licensePlugin = makeLicensePlugin('@sentry/tracing & @sentry/browser');

const plugins = [
  typescriptPluginES5,
  // replace `__SENTRY_BROWSER_BUNDLE__` with `true` to enable treeshaking of non-browser code
  markAsBrowserBuild,
  nodeResolvePlugin,
  licensePlugin,
];

const bundleConfig = {
  ...baseBundleConfig,
  input: 'src/index.ts',
  output: {
    ...baseBundleConfig.output,
    format: 'iife',
    name: 'Sentry',
  },
  context: 'window',
  plugins,
};

export default [
  // ES5 Browser Tracing Bundle
  {
    ...bundleConfig,
    input: 'src/index.bundle.ts',
    output: {
      ...bundleConfig.output,
      file: 'build/bundle.tracing.js',
    },
    plugins: bundleConfig.plugins,
  },
  {
    ...bundleConfig,
    input: 'src/index.bundle.ts',
    output: {
      ...bundleConfig.output,
      file: 'build/bundle.tracing.min.js',
    },
    // Uglify has to be at the end of compilation, BUT before the license banner
    plugins: bundleConfig.plugins.slice(0, -1).concat(terserPlugin).concat(bundleConfig.plugins.slice(-1)),
  },
];
