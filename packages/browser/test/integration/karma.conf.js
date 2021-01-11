const path = require("path");

const browserstackUsername = process.env.BROWSERSTACK_USERNAME;
const browserstackAccessKey = process.env.BROWSERSTACK_ACCESS_KEY;
const isLocalRun =
  browserstackUsername === undefined || browserstackAccessKey === undefined;

const customLaunchers = isLocalRun ? {} : require("./browsers.js");
const browsers = isLocalRun ? ["ChromeHeadless"] : Object.keys(customLaunchers);

// NOTE: It "should" work as a global `build` config option, but it doesn't, so setting it up
// for each browser here, so that we have a nice distinction of when the tests were run exactly.
if (!isLocalRun) {
  for (const browser in customLaunchers) {
    customLaunchers[browser].build = process.env.GITHUB_RUN_ID
      ? `CI: ${process.env.GITHUB_RUN_ID}`
      : `Manual: ${new Date().toLocaleString()}`;
  }
}

const plugins = [
  "karma-mocha",
  "karma-chai",
  "karma-sinon",
  "karma-mocha-reporter",
];
const reporters = ["mocha"];

if (isLocalRun) {
  plugins.push("karma-chrome-launcher");
} else {
  plugins.push("karma-browserstack-launcher");
  reporters.push("BrowserStack");
}

const files = [
  // Files common across all test-cases (polyfills, setup, loader, sdk), but not tests themselves
  {
    pattern: path.resolve(__dirname, "artifacts/!(tests).js"),
    included: false,
  },
  // Files used to trigger errors/provide data
  { pattern: path.resolve(__dirname, "subjects/*"), included: false },
  // HTML shells for all test suites
  { pattern: path.resolve(__dirname, "variants/*"), included: false },
  // Tests themselves - only this file is included in the index.html generated by Mocha
  { pattern: path.resolve(__dirname, "artifacts/tests.js"), included: true },
];

module.exports = config => {
  if (isLocalRun) {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║ INFO: Running integration tests in the local environment ║
╚══════════════════════════════════════════════════════════╝
`);
  } else {
    console.log(`
╔═════════════════════════════════════════════════════════════════╗
║ INFO: Running integration tests in the BrowserStack environment ║
╚═════════════════════════════════════════════════════════════════╝`);
  }

  config.set({
    logLevel: process.env.DEBUG ? config.LOG_DEBUG : config.LOG_INFO,
    colors: true,
    singleRun: true,
    autoWatch: false,
    basePath: __dirname,
    hostname: isLocalRun ? "localhost" : "bs-local.com",
    proxies: {
      // Required for non-string fetch url test
      "/base/variants/123": "/base/subjects/123",
      // Supresses warnings
      "/api/1/store/": "/",
      "/api/1/envelope/": "/",
    },
    frameworks: ["mocha", "chai", "sinon"],
    files,
    plugins,
    reporters,
    customLaunchers,
    browsers,
    client: {
      mocha: {
        reporter: "html",
        ui: "bdd",
      },
    },
    concurrency: isLocalRun ? 1 : 2,
    retryLimit: 5,
    browserDisconnectTolerance: 5,
    // 2 minutes should be more than enough...
    browserNoActivityTimeout: 120 * 1000,
    browserSocketTimeout: 120 * 1000,
    captureTimeout: 120 * 1000,
  });
};
