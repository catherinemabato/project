import { computeStackTrace } from '../../../src/tracekit';

describe('Tracekit - React Native Tests', () => {
  it('should parse exceptions for react-native-v8', () => {
    const REACT_NATIVE_V8_EXCEPTION = {
      message: 'Manually triggered crash to test Sentry reporting',
      name: 'Error',
      stack: `Error: Manually triggered crash to test Sentry reporting
          at Object.onPress(index.android.bundle:2342:3773)
          at s.touchableHandlePress(index.android.bundle:214:2048)
          at s._performSideEffectsForTransition(index.android.bundle:198:9608)
          at s._receiveSignal(index.android.bundle:198:8309)
          at s.touchableHandleResponderRelease(index.android.bundle:198:5615)
          at Object.y(index.android.bundle:93:571)
          at P(index.android.bundle:93:714)`,
    };
    const stacktrace = computeStackTrace(REACT_NATIVE_V8_EXCEPTION);

    expect(stacktrace).toEqual({
      message: 'Manually triggered crash to test Sentry reporting',
      name: 'Error',
      stack: [
        { filename: 'index.android.bundle', function: 'Object.onPress', lineno: 2342, colno: 3773 },
        { filename: 'index.android.bundle', function: 's.touchableHandlePress', lineno: 214, colno: 2048 },
        { filename: 'index.android.bundle', function: 's._performSideEffectsForTransition', lineno: 198, colno: 9608 },
        { filename: 'index.android.bundle', function: 's._receiveSignal', lineno: 198, colno: 8309 },
        { filename: 'index.android.bundle', function: 's.touchableHandleResponderRelease', lineno: 198, colno: 5615 },
        { filename: 'index.android.bundle', function: 'Object.y', lineno: 93, colno: 571 },
        { filename: 'index.android.bundle', function: 'P', lineno: 93, colno: 714 },
      ],
    });
  });

  it('should parse exceptions for react-native Expo bundles', () => {
    const REACT_NATIVE_EXPO_EXCEPTION = {
      message: 'Test Error Expo',
      name: 'Error',
      stack: `onPress@/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3:595:658
          value@/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3:221:7656
          onResponderRelease@/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3:221:5666
          p@/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3:96:385
          forEach@[native code]`,
    };
    const stacktrace = computeStackTrace(REACT_NATIVE_EXPO_EXCEPTION);

    expect(stacktrace).toEqual({
      message: 'Test Error Expo',
      name: 'Error',
      stack: [
        {
          filename:
            '/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3',
          function: 'onPress',
          lineno: 595,
          colno: 658,
        },
        {
          filename:
            '/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3',
          function: 'value',
          lineno: 221,
          colno: 7656,
        },
        {
          filename:
            '/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3',
          function: 'onResponderRelease',
          lineno: 221,
          colno: 5666,
        },
        {
          filename:
            '/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3',
          function: 'p',
          lineno: 96,
          colno: 385,
        },
        { filename: '[native code]', function: 'forEach', lineno: undefined, colno: undefined },
      ],
    });
  });

  it('should parse React Native errors on Android', () => {
    const ANDROID_REACT_NATIVE = {
      message: 'Error: test',
      name: 'Error',
      stack:
        'Error: test\n' +
        'at render(/home/username/sample-workspace/sampleapp.collect.react/src/components/GpsMonitorScene.js:78:24)\n' +
        'at _renderValidatedComponentWithoutOwnerOrContext(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js:1050:29)\n' +
        'at _renderValidatedComponent(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js:1075:15)\n' +
        'at renderedElement(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js:484:29)\n' +
        'at _currentElement(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js:346:40)\n' +
        'at child(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactReconciler.js:68:25)\n' +
        'at children(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactMultiChild.js:264:10)\n' +
        'at this(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/native/ReactNativeBaseComponent.js:74:41)\n',
    };

    const stackFrames = computeStackTrace(ANDROID_REACT_NATIVE);

    expect(stackFrames).toEqual({
      message: 'Error: test',
      name: 'Error',
      stack: [
        {
          filename: '/home/username/sample-workspace/sampleapp.collect.react/src/components/GpsMonitorScene.js',
          function: 'render',
          lineno: 78,
          colno: 24,
        },
        {
          filename:
            '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js',
          function: '_renderValidatedComponentWithoutOwnerOrContext',
          lineno: 1050,
          colno: 29,
        },
        {
          filename:
            '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js',
          function: '_renderValidatedComponent',
          lineno: 1075,
          colno: 15,
        },
        {
          filename:
            '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js',
          function: 'renderedElement',
          lineno: 484,
          colno: 29,
        },
        {
          filename:
            '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js',
          function: '_currentElement',
          lineno: 346,
          colno: 40,
        },
        {
          filename:
            '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactReconciler.js',
          function: 'child',
          lineno: 68,
          colno: 25,
        },
        {
          filename:
            '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactMultiChild.js',
          function: 'children',
          lineno: 264,
          colno: 10,
        },
        {
          filename:
            '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/native/ReactNativeBaseComponent.js',
          function: 'this',
          lineno: 74,
          colno: 41,
        },
      ],
    });
  });

  it('should parse React Native errors on Android Production', () => {
    const ANDROID_REACT_NATIVE_PROD = {
      message: 'Error: test',
      name: 'Error',
      stack:
        'value@index.android.bundle:12:1917\n' +
        'onPress@index.android.bundle:12:2336\n' +
        'touchableHandlePress@index.android.bundle:258:1497\n' +
        '[native code]\n' +
        '_performSideEffectsForTransition@index.android.bundle:252:8508\n' +
        '[native code]\n' +
        '_receiveSignal@index.android.bundle:252:7291\n' +
        '[native code]\n' +
        'touchableHandleResponderRelease@index.android.bundle:252:4735\n' +
        '[native code]\n' +
        'u@index.android.bundle:79:142\n' +
        'invokeGuardedCallback@index.android.bundle:79:459\n' +
        'invokeGuardedCallbackAndCatchFirstError@index.android.bundle:79:580\n' +
        'c@index.android.bundle:95:365\n' +
        'a@index.android.bundle:95:567\n' +
        'v@index.android.bundle:146:501\n' +
        'g@index.android.bundle:146:604\n' +
        'forEach@[native code]\n' +
        'i@index.android.bundle:149:80\n' +
        'processEventQueue@index.android.bundle:146:1432\n' +
        's@index.android.bundle:157:88\n' +
        'handleTopLevel@index.android.bundle:157:174\n' +
        'index.android.bundle:156:572\n' +
        'a@index.android.bundle:93:276\n' +
        'c@index.android.bundle:93:60\n' +
        'perform@index.android.bundle:177:596\n' +
        'batchedUpdates@index.android.bundle:188:464\n' +
        'i@index.android.bundle:176:358\n' +
        'i@index.android.bundle:93:90\n' +
        'u@index.android.bundle:93:150\n' +
        '_receiveRootNodeIDEvent@index.android.bundle:156:544\n' +
        'receiveTouches@index.android.bundle:156:918\n' +
        'value@index.android.bundle:29:3016\n' +
        'index.android.bundle:29:955\n' +
        'value@index.android.bundle:29:2417\n' +
        'value@index.android.bundle:29:927\n' +
        '[native code]',
    };

    const stackFrames = computeStackTrace(ANDROID_REACT_NATIVE_PROD);

    expect(stackFrames).toEqual({
      message: 'Error: test',
      name: 'Error',
      stack: [
        { filename: 'index.android.bundle', function: 'value', lineno: 12, colno: 1917 },
        { filename: 'index.android.bundle', function: 'onPress', lineno: 12, colno: 2336 },
        { filename: 'index.android.bundle', function: 'touchableHandlePress', lineno: 258, colno: 1497 },
        { filename: '[native code]', function: '?', lineno: undefined, colno: undefined },
        { filename: 'index.android.bundle', function: '_performSideEffectsForTransition', lineno: 252, colno: 8508 },
        { filename: '[native code]', function: '?', lineno: undefined, colno: undefined },
        { filename: 'index.android.bundle', function: '_receiveSignal', lineno: 252, colno: 7291 },
        { filename: '[native code]', function: '?', lineno: undefined, colno: undefined },
        { filename: 'index.android.bundle', function: 'touchableHandleResponderRelease', lineno: 252, colno: 4735 },
        { filename: '[native code]', function: '?', lineno: undefined, colno: undefined },
        { filename: 'index.android.bundle', function: 'u', lineno: 79, colno: 142 },
        { filename: 'index.android.bundle', function: 'invokeGuardedCallback', lineno: 79, colno: 459 },
        {
          filename: 'index.android.bundle',
          function: 'invokeGuardedCallbackAndCatchFirstError',
          lineno: 79,
          colno: 580,
        },
        { filename: 'index.android.bundle', function: 'c', lineno: 95, colno: 365 },
        { filename: 'index.android.bundle', function: 'a', lineno: 95, colno: 567 },
        { filename: 'index.android.bundle', function: 'v', lineno: 146, colno: 501 },
        { filename: 'index.android.bundle', function: 'g', lineno: 146, colno: 604 },
        { filename: '[native code]', function: 'forEach', lineno: undefined, colno: undefined },
        { filename: 'index.android.bundle', function: 'i', lineno: 149, colno: 80 },
        { filename: 'index.android.bundle', function: 'processEventQueue', lineno: 146, colno: 1432 },
        { filename: 'index.android.bundle', function: 's', lineno: 157, colno: 88 },
        { filename: 'index.android.bundle', function: 'handleTopLevel', lineno: 157, colno: 174 },
        { filename: 'index.android.bundle', function: '?', lineno: 156, colno: 572 },
        { filename: 'index.android.bundle', function: 'a', lineno: 93, colno: 276 },
        { filename: 'index.android.bundle', function: 'c', lineno: 93, colno: 60 },
        { filename: 'index.android.bundle', function: 'perform', lineno: 177, colno: 596 },
        { filename: 'index.android.bundle', function: 'batchedUpdates', lineno: 188, colno: 464 },
        { filename: 'index.android.bundle', function: 'i', lineno: 176, colno: 358 },
        { filename: 'index.android.bundle', function: 'i', lineno: 93, colno: 90 },
        { filename: 'index.android.bundle', function: 'u', lineno: 93, colno: 150 },
        { filename: 'index.android.bundle', function: '_receiveRootNodeIDEvent', lineno: 156, colno: 544 },
        { filename: 'index.android.bundle', function: 'receiveTouches', lineno: 156, colno: 918 },
        { filename: 'index.android.bundle', function: 'value', lineno: 29, colno: 3016 },
        { filename: 'index.android.bundle', function: '?', lineno: 29, colno: 955 },
        { filename: 'index.android.bundle', function: 'value', lineno: 29, colno: 2417 },
        { filename: 'index.android.bundle', function: 'value', lineno: 29, colno: 927 },
        { filename: '[native code]', function: '?', lineno: undefined, colno: undefined },
      ],
    });
  });

  it('should parse React Native errors on Android Hermes', () => {
    const ANDROID_REACT_NATIVE_HERMES = {
      message: 'Error: lets throw!',
      name: 'Error',
      stack:
        'at onPress (address at index.android.bundle:1:452701)\n' +
        'at anonymous (address at index.android.bundle:1:224280)\n' +
        'at _performSideEffectsForTransition (address at index.android.bundle:1:230843)\n' +
        'at _receiveSignal (native)\n' +
        'at touchableHandleResponderRelease (native)\n' +
        'at onResponderRelease (native)\n' +
        'at apply (native)\n' +
        'at b (address at index.android.bundle:1:74037)\n' +
        'at apply (native)\n' +
        'at k (address at index.android.bundle:1:74094)\n' +
        'at apply (native)\n' +
        'at C (address at index.android.bundle:1:74126)\n' +
        'at N (address at index.android.bundle:1:74267)\n' +
        'at A (address at index.android.bundle:1:74709)\n' +
        'at forEach (native)\n' +
        'at z (address at index.android.bundle:1:74642)\n' +
        'at anonymous (address at index.android.bundle:1:77747)\n' +
        'at _e (address at index.android.bundle:1:127755)\n' +
        'at Ne (address at index.android.bundle:1:77238)\n' +
        'at Ue (address at index.android.bundle:1:77571)\n' +
        'at receiveTouches (address at index.android.bundle:1:122512)\n' +
        'at apply (native)\n' +
        'at value (address at index.android.bundle:1:33176)\n' +
        'at anonymous (address at index.android.bundle:1:31603)\n' +
        'at value (address at index.android.bundle:1:32776)\n' +
        'at value (address at index.android.bundle:1:31561)',
    };
    const stackFrames = computeStackTrace(ANDROID_REACT_NATIVE_HERMES);

    expect(stackFrames).toEqual({
      message: 'Error: lets throw!',
      name: 'Error',
      stack: [
        { filename: 'index.android.bundle', function: 'onPress', lineno: 1, colno: 452701 },
        { filename: 'index.android.bundle', function: 'anonymous', lineno: 1, colno: 224280 },
        { filename: 'index.android.bundle', function: '_performSideEffectsForTransition', lineno: 1, colno: 230843 },
        { filename: 'native', function: '_receiveSignal', lineno: undefined, colno: undefined },
        { filename: 'native', function: 'touchableHandleResponderRelease', lineno: undefined, colno: undefined },
        { filename: 'native', function: 'onResponderRelease', lineno: undefined, colno: undefined },
        { filename: 'native', function: 'apply', lineno: undefined, colno: undefined },
        { filename: 'index.android.bundle', function: 'b', lineno: 1, colno: 74037 },
        { filename: 'native', function: 'apply', lineno: undefined, colno: undefined },
        { filename: 'index.android.bundle', function: 'k', lineno: 1, colno: 74094 },
        { filename: 'native', function: 'apply', lineno: undefined, colno: undefined },
        { filename: 'index.android.bundle', function: 'C', lineno: 1, colno: 74126 },
        { filename: 'index.android.bundle', function: 'N', lineno: 1, colno: 74267 },
        { filename: 'index.android.bundle', function: 'A', lineno: 1, colno: 74709 },
        { filename: 'native', function: 'forEach', lineno: undefined, colno: undefined },
        { filename: 'index.android.bundle', function: 'z', lineno: 1, colno: 74642 },
        { filename: 'index.android.bundle', function: 'anonymous', lineno: 1, colno: 77747 },
        { filename: 'index.android.bundle', function: '_e', lineno: 1, colno: 127755 },
        { filename: 'index.android.bundle', function: 'Ne', lineno: 1, colno: 77238 },
        { filename: 'index.android.bundle', function: 'Ue', lineno: 1, colno: 77571 },
        { filename: 'index.android.bundle', function: 'receiveTouches', lineno: 1, colno: 122512 },
        { filename: 'native', function: 'apply', lineno: undefined, colno: undefined },
        { filename: 'index.android.bundle', function: 'value', lineno: 1, colno: 33176 },
        { filename: 'index.android.bundle', function: 'anonymous', lineno: 1, colno: 31603 },
        { filename: 'index.android.bundle', function: 'value', lineno: 1, colno: 32776 },
        { filename: 'index.android.bundle', function: 'value', lineno: 1, colno: 31561 },
      ],
    });
  });
});
