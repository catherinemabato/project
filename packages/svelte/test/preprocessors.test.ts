import { componentTrackingPreprocessor, defaultComponentTrackingOptions } from '../src/preprocessors';

function expectComponentCodeToBeModified(
  preprocessedComponents: {
    originalCode: string;
    filename: string;
    name: string;
    newCode: string;
    map: any;
  }[],
  options: any,
) {
  const expectedImportStmt = 'import { trackComponent } from "@sentry/svelte";\n';

  preprocessedComponents.forEach(cmp => {
    const expectedFunctionCallOptions = {
      trackMount: options?.trackMount ?? true,
      trackUpdates: options?.trackUpdates ?? true,
      componentName: cmp.name,
    };
    const expectedFunctionCall = `trackComponent(${JSON.stringify(expectedFunctionCallOptions)});\n`;
    expect(cmp.newCode).toBeDefined();
    expect(cmp.map).toBeDefined();
    expect(cmp.newCode).toEqual(`${expectedImportStmt}${expectedFunctionCall}${cmp.originalCode}`);
  });
}

describe('componentTrackingPreprocessor', () => {
  it('correctly inits the script preprocessor', () => {
    const preProc = componentTrackingPreprocessor();
    expect(preProc.script).toBeDefined();
    expect(preProc.markup).toBeUndefined();
    expect(preProc.style).toBeUndefined();
  });

  it.each([
    ['no options', undefined],
    ['default options', defaultComponentTrackingOptions],
    ['custom options (mount 0, updates 0)', { trackMount: false, trackUpdates: false }],
    ['custom options (mount 0, updates 1)', { trackMount: false, trackUpdates: true }],
    ['custom options (mount 1, updates 0)', { trackMount: true, trackUpdates: false }],
    ['custom options (mount 1, updates 1)', { trackMount: true, trackUpdates: true }],
  ])('adds the function call to all components if %s are set', (_, options) => {
    const preProc = componentTrackingPreprocessor(options);
    const components = [
      { originalCode: 'console.log(cmp1);', filename: 'components/Cmp1.svelte', name: 'Cmp1' },
      { originalCode: 'console.log(cmp2);', filename: 'components/Cmp2.svelte', name: 'Cmp2' },
      { originalCode: 'console.log(cmp3);', filename: 'components/Cmp3.svelte', name: 'Cmp3' },
    ];

    const preprocessedComponents = components.map(cmp => {
      const res: any = preProc.script!!({
        content: cmp.originalCode,
        filename: cmp.filename,
        attributes: {},
        markup: '',
      });
      return { ...cmp, newCode: res.code, map: res.map };
    });

    expectComponentCodeToBeModified(preprocessedComponents, options);
  });

  it('does not add the function call to any component if `trackComponents` is set to `false`', () => {
    const preProc = componentTrackingPreprocessor({ trackComponents: false });
    const components = [
      { originalCode: 'console.log(cmp1)', filename: 'components/Cmp1.svelte', name: 'Cmp1' },
      { originalCode: 'console.log(cmp2)', filename: 'components/Cmp2.svelte', name: 'Cmp2' },
      { originalCode: 'console.log(cmp3)', filename: 'components/Cmp3.svelte', name: 'Cmp3' },
    ];

    const preprocessedComponents = components.map(cmp => {
      const res: any = preProc.script!!({
        content: cmp.originalCode,
        filename: cmp.filename,
        attributes: {},
        markup: '',
      });
      return { ...cmp, newCode: res.code, map: res.map };
    });

    preprocessedComponents.forEach(cmp => {
      expect(cmp.newCode).toEqual(cmp.originalCode);
    });
  });

  it('adds the function call to specific components if specified in `trackComponents`', () => {
    const preProc = componentTrackingPreprocessor({ trackComponents: ['Cmp1', 'Cmp3'] });
    const components = [
      { originalCode: 'console.log(cmp1)', filename: 'components/Cmp1.svelte', name: 'Cmp1' },
      { originalCode: 'console.log(cmp2)', filename: 'lib/Cmp2.svelte', name: 'Cmp2' },
      { originalCode: 'console.log(cmp3)', filename: 'lib/subdir/sub/Cmp3.svelte', name: 'Cmp3' },
    ];

    const [cmp1, cmp2, cmp3] = components.map(cmp => {
      const res: any = preProc.script!!({
        content: cmp.originalCode,
        filename: cmp.filename,
        attributes: {},
        markup: '',
      });
      return { ...cmp, newCode: res.code, map: res.map };
    });

    expect(cmp2.newCode).toEqual(cmp2.originalCode);

    expectComponentCodeToBeModified([cmp1, cmp3], { trackMount: true, trackUpdates: true });
  });
});
