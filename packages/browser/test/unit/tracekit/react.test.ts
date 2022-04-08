import { createStackParser } from '@sentry/utils';
import { exceptionFromError } from '../../../src/eventbuilder';
import { defaultStackParsers } from '../../../src/stack-parsers';

const parser = createStackParser(...defaultStackParsers);

describe('Tracekit - React Tests', () => {
  it('should correctly parse Invariant Violation errors and use framesToPop to drop info message', () => {
    const REACT_INVARIANT_VIOLATION_EXCEPTION = {
      framesToPop: 1,
      message:
        'Minified React error #31; visit https://reactjs.org/docs/error-decoder.html?invariant=31&args[]=object%20with%20keys%20%7B%7D&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings. ',
      name: 'Invariant Violation',
      stack: `Invariant Violation: Minified React error #31; visit https://reactjs.org/docs/error-decoder.html?invariant=31&args[]=object%20with%20keys%20%7B%7D&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
          at http://localhost:5000/static/js/foo.chunk.js:1:21738
          at a (http://localhost:5000/static/js/foo.chunk.js:1:21841)
          at ho (http://localhost:5000/static/js/foo.chunk.js:1:68735)
          at f (http://localhost:5000/:1:980)`,
    };

    const ex = exceptionFromError(parser, REACT_INVARIANT_VIOLATION_EXCEPTION);

    expect(ex).toEqual({
      value:
        'Minified React error #31; visit https://reactjs.org/docs/error-decoder.html?invariant=31&args[]=object%20with%20keys%20%7B%7D&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings. ',
      type: 'Invariant Violation',
      stacktrace: {
        frames: [
          { filename: 'http://localhost:5000/', function: 'f', lineno: 1, colno: 980, in_app: true },
          {
            filename: 'http://localhost:5000/static/js/foo.chunk.js',
            function: 'ho',
            lineno: 1,
            colno: 68735,
            in_app: true,
          },
          {
            filename: 'http://localhost:5000/static/js/foo.chunk.js',
            function: 'a',
            lineno: 1,
            colno: 21841,
            in_app: true,
          },
          {
            filename: 'http://localhost:5000/static/js/foo.chunk.js',
            function: '?',
            lineno: 1,
            colno: 21738,
            in_app: true,
          },
        ],
      },
    });
  });

  it('should correctly parse production errors and drop initial frame if its not relevant', () => {
    const REACT_PRODUCTION_ERROR = {
      message:
        'Minified React error #200; visit https://reactjs.org/docs/error-decoder.html?invariant=200 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.',
      name: 'Error',
      stack: `Error: Minified React error #200; visit https://reactjs.org/docs/error-decoder.html?invariant=200 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
        at http://localhost:5000/static/js/foo.chunk.js:1:21738
        at a (http://localhost:5000/static/js/foo.chunk.js:1:21841)
        at ho (http://localhost:5000/static/js/foo.chunk.js:1:68735)
        at f (http://localhost:5000/:1:980)`,
    };

    const ex = exceptionFromError(parser, REACT_PRODUCTION_ERROR);

    expect(ex).toEqual({
      value:
        'Minified React error #200; visit https://reactjs.org/docs/error-decoder.html?invariant=200 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.',
      type: 'Error',
      stacktrace: {
        frames: [
          { filename: 'http://localhost:5000/', function: 'f', lineno: 1, colno: 980, in_app: true },
          {
            filename: 'http://localhost:5000/static/js/foo.chunk.js',
            function: 'ho',
            lineno: 1,
            colno: 68735,
            in_app: true,
          },
          {
            filename: 'http://localhost:5000/static/js/foo.chunk.js',
            function: 'a',
            lineno: 1,
            colno: 21841,
            in_app: true,
          },
          {
            filename: 'http://localhost:5000/static/js/foo.chunk.js',
            function: '?',
            lineno: 1,
            colno: 21738,
            in_app: true,
          },
        ],
      },
    });
  });

  it('should not drop additional frame for production errors if framesToPop is still there', () => {
    const REACT_PRODUCTION_ERROR = {
      framesToPop: 1,
      message:
        'Minified React error #200; visit https://reactjs.org/docs/error-decoder.html?invariant=200 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.',
      name: 'Error',
      stack: `Error: Minified React error #200; visit https://reactjs.org/docs/error-decoder.html?invariant=200 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
        at http://localhost:5000/static/js/foo.chunk.js:1:21738
        at a (http://localhost:5000/static/js/foo.chunk.js:1:21841)
        at ho (http://localhost:5000/static/js/foo.chunk.js:1:68735)
        at f (http://localhost:5000/:1:980)`,
    };

    const ex = exceptionFromError(parser, REACT_PRODUCTION_ERROR);

    expect(ex).toEqual({
      value:
        'Minified React error #200; visit https://reactjs.org/docs/error-decoder.html?invariant=200 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.',
      type: 'Error',
      stacktrace: {
        frames: [
          { filename: 'http://localhost:5000/', function: 'f', lineno: 1, colno: 980, in_app: true },
          {
            filename: 'http://localhost:5000/static/js/foo.chunk.js',
            function: 'ho',
            lineno: 1,
            colno: 68735,
            in_app: true,
          },
          {
            filename: 'http://localhost:5000/static/js/foo.chunk.js',
            function: 'a',
            lineno: 1,
            colno: 21841,
            in_app: true,
          },
          {
            filename: 'http://localhost:5000/static/js/foo.chunk.js',
            function: '?',
            lineno: 1,
            colno: 21738,
            in_app: true,
          },
        ],
      },
    });
  });
});
