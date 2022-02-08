import { computeStackTrace } from '../../../src/tracekit';

describe('Tracekit - Opera Tests', () => {
  it('should parse Opera 10 error', () => {
    const OPERA_10 = {
      name: 'foo',
      message: 'Statement on line 42: Type mismatch (usually non-object value supplied where object required)',
      'opera#sourceloc': 42,
      stacktrace:
        '  Line 42 of linked script http://path/to/file.js\n' +
        '                this.undef();\n' +
        '  Line 27 of linked script http://path/to/file.js\n' +
        '            ex = ex || this.createException();\n' +
        '  Line 18 of linked script http://path/to/file.js: In function printStackTrace\n' +
        '        var p = new printStackTrace.implementation(), result = p.run(ex);\n' +
        '  Line 4 of inline#1 script in http://path/to/file.js: In function bar\n' +
        '             printTrace(printStackTrace());\n' +
        '  Line 7 of inline#1 script in http://path/to/file.js: In function bar\n' +
        '           bar(n - 1);\n' +
        '  Line 11 of inline#1 script in http://path/to/file.js: In function foo\n' +
        '           bar(2);\n' +
        '  Line 15 of inline#1 script in http://path/to/file.js\n' +
        '         foo();\n' +
        '',
    };

    const stackFrames = computeStackTrace(OPERA_10);

    expect(stackFrames).toEqual({
      message: 'Statement on line 42: Type mismatch (usually non-object value supplied where object required)',
      name: 'foo',
      stack: [
        { filename: 'http://path/to/file.js', function: '?', lineno: 42, colno: undefined },
        { filename: 'http://path/to/file.js', function: '?', lineno: 27, colno: undefined },
        { filename: 'http://path/to/file.js', function: 'printStackTrace', lineno: 18, colno: undefined },
        { filename: 'http://path/to/file.js', function: 'bar', lineno: 4, colno: undefined },
        { filename: 'http://path/to/file.js', function: 'bar', lineno: 7, colno: undefined },
        { filename: 'http://path/to/file.js', function: 'foo', lineno: 11, colno: undefined },
        { filename: 'http://path/to/file.js', function: '?', lineno: 15, colno: undefined },
      ],
    });
  });

  it('should parse Opera 11 error', () => {
    const OPERA_11 = {
      name: 'foo',
      message: "'this.undef' is not a function",
      stack:
        '<anonymous function: run>([arguments not available])@http://path/to/file.js:27\n' +
        'bar([arguments not available])@http://domain.com:1234/path/to/file.js:18\n' +
        'foo([arguments not available])@http://domain.com:1234/path/to/file.js:11\n' +
        '<anonymous function>@http://path/to/file.js:15\n' +
        'Error created at <anonymous function>@http://path/to/file.js:15',
      stacktrace:
        'Error thrown at line 42, column 12 in <anonymous function: createException>() in http://path/to/file.js:\n' +
        '    this.undef();\n' +
        'called from line 27, column 8 in <anonymous function: run>(ex) in http://path/to/file.js:\n' +
        '    ex = ex || this.createException();\n' +
        'called from line 18, column 4 in printStackTrace(options) in http://path/to/file.js:\n' +
        '    var p = new printStackTrace.implementation(), result = p.run(ex);\n' +
        'called from line 4, column 5 in bar(n) in http://path/to/file.js:\n' +
        '    printTrace(printStackTrace());\n' +
        'called from line 7, column 4 in bar(n) in http://path/to/file.js:\n' +
        '    bar(n - 1);\n' +
        'called from line 11, column 4 in foo() in http://path/to/file.js:\n' +
        '    bar(2);\n' +
        'called from line 15, column 3 in http://path/to/file.js:\n' +
        '    foo();',
    };

    const stackFrames = computeStackTrace(OPERA_11);

    expect(stackFrames).toEqual({
      message: "'this.undef' is not a function",
      name: 'foo',
      stack: [
        { filename: 'http://path/to/file.js', function: 'createException', lineno: 42, colno: 12 },
        { filename: 'http://path/to/file.js', function: 'run', lineno: 27, colno: 8 },
        { filename: 'http://path/to/file.js', function: 'printStackTrace', lineno: 18, colno: 4 },
        { filename: 'http://path/to/file.js', function: 'bar', lineno: 4, colno: 5 },
        { filename: 'http://path/to/file.js', function: 'bar', lineno: 7, colno: 4 },
        { filename: 'http://path/to/file.js', function: 'foo', lineno: 11, colno: 4 },
        { filename: 'http://path/to/file.js', function: '?', lineno: 15, colno: 3 },
      ],
    });
  });

  it('should parse Opera 12 error', () => {
    // TODO: Improve anonymous function name.
    const OPERA_12 = {
      name: 'foo',
      message: "Cannot convert 'x' to object",
      stack:
        '<anonymous function>([arguments not available])@http://localhost:8000/ExceptionLab.html:48\n' +
        'dumpException3([arguments not available])@http://localhost:8000/ExceptionLab.html:46\n' +
        '<anonymous function>([arguments not available])@http://localhost:8000/ExceptionLab.html:1',
      stacktrace:
        'Error thrown at line 48, column 12 in <anonymous function>(x) in http://localhost:8000/ExceptionLab.html:\n' +
        '    x.undef();\n' +
        'called from line 46, column 8 in dumpException3() in http://localhost:8000/ExceptionLab.html:\n' +
        '    dumpException((function(x) {\n' +
        'called from line 1, column 0 in <anonymous function>(event) in http://localhost:8000/ExceptionLab.html:\n' +
        '    dumpException3();',
    };

    const stackFrames = computeStackTrace(OPERA_12);

    expect(stackFrames).toEqual({
      message: "Cannot convert 'x' to object",
      name: 'foo',
      stack: [
        {
          filename: 'http://localhost:8000/ExceptionLab.html',
          function: '<anonymous function>',
          lineno: 48,
          colno: 12,
        },
        { filename: 'http://localhost:8000/ExceptionLab.html', function: 'dumpException3', lineno: 46, colno: 8 },
        { filename: 'http://localhost:8000/ExceptionLab.html', function: '<anonymous function>', lineno: 1, colno: 0 },
      ],
    });
  });

  it('should parse Opera 25 error', () => {
    const OPERA_25 = {
      message: "Cannot read property 'undef' of null",
      name: 'TypeError',
      stack:
        "TypeError: Cannot read property 'undef' of null\n" +
        '    at http://path/to/file.js:47:22\n' +
        '    at foo (http://path/to/file.js:52:15)\n' +
        '    at bar (http://path/to/file.js:108:168)',
    };

    const stackFrames = computeStackTrace(OPERA_25);

    expect(stackFrames).toEqual({
      message: "Cannot read property 'undef' of null",
      name: 'TypeError',
      stack: [
        { filename: 'http://path/to/file.js', function: '?', lineno: 47, colno: 22 },
        { filename: 'http://path/to/file.js', function: 'foo', lineno: 52, colno: 15 },
        { filename: 'http://path/to/file.js', function: 'bar', lineno: 108, colno: 168 },
      ],
    });
  });
});
