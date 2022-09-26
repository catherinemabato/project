/* eslint-disable no-console */
import * as childProcess from 'child_process';
import * as glob from 'glob';
import * as path from 'path';

const TEST_REGISTRY_CONTAINER_NAME = 'verdaccio-e2e-test-registry';
const VERDACCIO_VERSION = '5.15.3';

const repositoryRoot = path.resolve(__dirname, '../..');

// Create tarballs
childProcess.execSync('yarn build:npm', { encoding: 'utf8', cwd: repositoryRoot, stdio: 'inherit' });

try {
  // Stop test registry container (Verdaccio) if it was already running
  childProcess.execSync(`docker stop ${TEST_REGISTRY_CONTAINER_NAME}`, { stdio: 'ignore' });
  console.log('Stopped previously running test registry');
} catch (e) {
  // Don't throw if container wasn't running
}

// Start test registry (Verdaccio)
childProcess.execSync(
  `docker run --detach --rm --name ${TEST_REGISTRY_CONTAINER_NAME} -p 4873:4873 -v ${__dirname}/verdaccio-config:/verdaccio/conf verdaccio/verdaccio:${VERDACCIO_VERSION}`,
  { encoding: 'utf8', stdio: 'inherit' },
);

// Publish built packages to test registry
const packageTarballPaths = glob.sync('packages/*/sentry-*.tgz', {
  cwd: repositoryRoot,
  absolute: true,
});
packageTarballPaths.forEach(tarballPath => {
  // For some reason the auth token must be in the .npmrc, for some reason the npm `--userconfig` flag doesn't always work,
  // and for some reason the registry must be passed via `--registry` AND in the .npmrc because different npm versions
  // apparently work different and we want it to work with different npm versions because of local development.
  childProcess.execSync(
    `npm publish ${tarballPath} --registry http://localhost:4873 --userconfig ${__dirname}/test-registry.npmrc`,
    {
      cwd: repositoryRoot, // Can't use __dirname here because npm would try to publish `@sentry-internal/e2e-tests`
      env: {
        ...process.env,
        NPM_CONFIG_USERCONFIG: `${__dirname}/test-registry.npmrc`,
      },
      encoding: 'utf8',
      stdio: 'inherit',
    },
  );
});

// TODO: Run e2e tests here

// Stop test registry
childProcess.execSync(`docker stop ${TEST_REGISTRY_CONTAINER_NAME}`, { encoding: 'utf8', stdio: 'ignore' });
console.log('Successfully stopped test registry container'); // Output from command above is not good so we `ignore` it and emit our own
