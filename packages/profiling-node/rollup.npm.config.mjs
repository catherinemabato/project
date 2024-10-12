import commonjs from '@rollup/plugin-commonjs';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export const ESMImportShim = `
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
`;

export const ESMRequireShim = `
`;

function makeESMShimPlugin() {
  return {
    transform(code) {
      const SHIM_REGEXP = /\/\/ #START_SENTRY_ESM_SHIM[\s\S]*?\/\/ #END_SENTRY_ESM_SHIM/;

      const withImportShimmed = code.replace(SHIM_REGEXP, ESMImportShim);
      return withImportShimmed;
    },
  };
}

const variants = makeNPMConfigVariants(
  makeBaseNPMConfig({
    packageSpecificConfig: {
      output: { dir: 'lib', preserveModules: false },
      plugins: [commonjs()],
    },
  }),
);

for (const variant of variants) {
  if (variant.output.format === 'esm') {
    variant.plugins.push(makeESMShimPlugin());
  }
}

export default variants;
