/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Generate `@sentry/nextjs` types.
 *
 * This file (compiles to) a script which generates a merged set of exports for the nextjs SDK, for the ultimate purpose
 * of generating the SDK's types. The `module` and `browser` entries in `package.json` allow different files to serve as
 * the SDK's entry point depending on environment, but there is no such bifurcation when it comes to types. Leaving the
 * `types` entry out causes TypeScript to search for a declaration file whose name matches each of `module` and
 * `browser` values, respectively, and that allows compilation to happen (yay!) but without either `types` or `main`
 * entries in `package.json`, VSCode is unable to resolve the SDK for code completion, Intellisense, etc. (boo!). The
 * `types` entry can't be an array, but even if it could, that wouldn't handle the case of namespace clashes
 * (`@sentry/node.Integrations` is not the same as `@sentry/react.Integrations`, for instance - which one wins?). So
 * there needs to be a single source of truth, generated by semi-intelligently merging the exports from the two packages
 * (by way of the two different, environment-specific index files), such that types can then be generated from that
 * single file.
 *
 * Known limitations:
 *
 *  - In a small handful of mostly-non-user-relevant spots, there's no easy way to resolve the conflict (for example,
 *    which `flush` and `close` methods should be exported, node's or react's?) and so those types have been omitted
 *    from this file. The correct methods are stil exported in their respective environments - the JS works, in other
 *    words - but they won't appear in the types. The one exception to this is the `init` method, because it's too
 *    important to leave out. For the moment, it's using the node version as the type in both environments. (TODO: Make
 *    a generic version of `init`, and possibly the other clashes, just for use in types.)
 *
 * - Currently, though this script gets built with the SDK, running `build:watch` will only *run* it once, before the
 *   initial SDK build starts its watch mode. This means that the `types.ts` file only gets generated once per
 *   invocation of `build:watch`, and can get stale if its dependencies change in meaningful (to it) ways. This is a
 *   pain for development but won't affect releases/CI, because in those cases the build only happens once. (TODO: Fix
 *   this somehow.)
 *
 * The file that this script's compiled version generates is `/src/types.ts`.
 */

import * as nodeSDK from '@sentry/node';
import * as reactSDK from '@sentry/react';
import { isPlainObject } from '@sentry/utils';
import * as fs from 'fs';

type PlainObject = { [key: string]: any };

// TODO - combine these (only store values for collections?)
const mergedExports: PlainObject = {};
const mergedExportsWithSources: Array<{
  exportName: string;
  source: string;
  // elementSources?: Array<{ elementName: string; source: string }>;
  elementSources?: { node: string[]; react: string[] };
}> = [];

const allExportNames = new Set([...Object.keys(nodeSDK), ...Object.keys(reactSDK)]);

allExportNames.forEach(exportName => {
  const nodeExport = (nodeSDK as PlainObject)[exportName];
  const reactExport = (reactSDK as PlainObject)[exportName];

  // First, the easy stuff - things that only appear in one or the other package.
  if (nodeExport && !reactExport) {
    mergedExports[exportName] = nodeExport;
    mergedExportsWithSources.push({ exportName, source: "'@sentry/node'" });
    return;
  }

  if (reactExport && !nodeExport) {
    mergedExports[exportName] = reactExport;
    mergedExportsWithSources.push({ exportName, source: "'@sentry/react'" });
    return;
  }

  // If we've gotten this far, it means that both packages export something named `name`. In some cases, that's because
  // they're literally exporting the same thing (a type imported from `@sentry/types`, for example). If so, there's no
  // actual clash, so just copy over node's copy since it's equal to react's copy.
  if (nodeExport === reactExport) {
    mergedExports[exportName] = nodeExport;
    mergedExportsWithSources.push({ exportName, source: "'@sentry/node'" });
    return;
  }

  // At this point, the only option left is that there actually is a name clash (i.e., each package exports something
  // named `name`, but not the same something). The only place where this can be solved in a sensible manner is in the
  // case of collections, which we can merge the same way we're merging the overall modules. Fortunately, with the
  // exception of `init`, the spots where this happens are technically exported/public but not something 99% of users
  // will touch, so it feels safe for now to leave them out of the types.(TODO: Is there *any* way to inject the correct
  // values for each environment?)

  // In theory there are other collections besides objects and arrays, but thankfully we don't have any in this case.
  if (!Array.isArray(nodeExport) && !isPlainObject(nodeExport)) {
    // can't leave this out, so use the node version for now
    if (exportName === 'init') {
      mergedExports[exportName] = nodeExport;
      mergedExportsWithSources.push({ exportName, source: "'@sentry/node'" });
    }
    // otherwise, bail
    return;
  }

  // If we're dealing with an array, convert to an object for the moment, keyed by element name, so that individual
  // elements are easier to find. (Yes, this assumes that every element *has* a `name` property, but luckily in our case
  // that's true.)
  let nodeCollection: PlainObject, reactCollection: PlainObject;
  if (Array.isArray(nodeExport) && Array.isArray(reactExport)) {
    nodeCollection = {};
    nodeExport.forEach((element: { name: string }) => (nodeCollection[element.name] = element));

    reactCollection = {};
    reactExport.forEach((element: { name: string }) => {
      reactCollection[element.name] = element;
    });
  }
  // Otherwise, just use the object as is
  else {
    nodeCollection = nodeExport;
    reactCollection = reactExport;
  }

  // And now we do it all again, in miniature
  const allCollectionNames = new Set([...Object.keys(nodeCollection), ...Object.keys(reactCollection)]);
  const mergedCollection: PlainObject = {};
  const mergedCollectionBySource: {
    node: string[];
    react: string[];
  } = { node: [], react: [] };
  // const mergedCollectionWithSources: Array<{
  //   elementName: string;
  //   source: string;
  // }> = [];

  allCollectionNames.forEach(elementName => {
    const nodeCollectionElement = nodeCollection[elementName];
    const reactCollectionElement = reactCollection[elementName];

    // grab everything that's only in node...
    if (nodeCollectionElement && !reactCollectionElement) {
      mergedCollection[elementName] = nodeCollectionElement;
      mergedCollectionBySource.node.push(elementName);
      // mergedCollectionWithSources.push({ elementName, source: 'nodeSDK' });
      return;
    }

    // ... and everything that's only in react
    if (reactCollectionElement && !nodeCollectionElement) {
      mergedCollection[elementName] = reactCollectionElement;
      mergedCollectionBySource.react.push(elementName);
      // mergedCollectionWithSources.push({ elementName, source: 'reactSDK' });
      return;
    }

    // now grab all the ones which are actually just pointers to the same thing
    if (
      nodeCollectionElement === reactCollectionElement ||
      // this will be true if we're dealing with instances instead of a classes
      (Object.getPrototypeOf(nodeCollectionElement).constructor?.name === nodeCollectionElement.constructor?.name &&
        // and then this ensures they're the samre class
        Object.getPrototypeOf(nodeCollectionElement) === Object.getPrototypeOf(reactCollectionElement))
    ) {
      mergedCollection[elementName] = nodeCollectionElement;
      mergedCollectionBySource.node.push(elementName);
      // mergedCollectionWithSources.push({ elementName, source: 'nodeSDK' });
      return;
    }

    // at this point, in a general case, we'd recurse, but we're assuming type match and we know we don't have any
    // nested collections, so we're done with this pair of collection elements
  });

  // having merged the two collections, if we started with an array, convert back to one
  if (Array.isArray(nodeExport)) {
    mergedExports[exportName] = Object.values(mergedCollection);
    mergedExportsWithSources.push({ exportName, source: 'array', elementSources: mergedCollectionBySource }); // TODO have to build the collection as a string
  }
  // otherwise, just use the merged object
  else {
    mergedExports[exportName] = mergedCollection;
    mergedExportsWithSources.push({ exportName, source: 'object', elementSources: mergedCollectionBySource });
  }
});

// TODO - should we be importing from the two index files instead?
// TODO - export correct SDK name value
// TODO - call prettier from here? clean up package.json

// This is here as a real comment (rather than an array of strings) because it's easier to edit that way if we ever need
// to. (TODO: Convert to a string per line automatically)
/**
 * THIS IS AN AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
 *
 * More detail can be found in the script that (compiles to the script that) generated this file,
 * `/scripts/generate-types.ts`.
 */

const outputLines = [
  '/**',
  ' * THIS IS AN AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.',
  ' *',
  ' * More detail can be found in the script that (compiles to the script that) generated this file,',
  ' * `/scripts/generate-types.ts`.',
  ' */',
  '',
  "import * as nodeSDK from '@sentry/node'",
  "import * as reactSDK from '@sentry/react'",
  '',
];

mergedExportsWithSources.forEach(element => {
  const { exportName, source, elementSources } = element;

  if (source === "'@sentry/node'" || source === "'@sentry/react'") {
    outputLines.push(`export { ${exportName} } from ${source};`);
    return;
  }

  if (source === 'array') {
    const titleCaseExportName = exportName.replace(exportName[0], exportName[0].toUpperCase());
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { node: nodeElementNames, react: reactElementNames } = elementSources!;

    outputLines.push(`const node${titleCaseExportName}Names = ${JSON.stringify(nodeElementNames)}`);
    outputLines.push(`const react${titleCaseExportName}Names = ${JSON.stringify(reactElementNames)}`);
    outputLines.push(
      `const node${titleCaseExportName} = nodeSDK.${exportName}.filter(element => element.name in node${titleCaseExportName}Names)`,
    );
    outputLines.push(
      `const react${titleCaseExportName} = reactSDK.${exportName}.filter(element => element.name in react${titleCaseExportName}Names)`,
    );
    outputLines.push(`export const ${exportName} = [ ...node${titleCaseExportName}, ...react${titleCaseExportName} ]`);

    return;

    // outputLines.push(`const react${titleCaseExportName} = ${JSON.stringify(reactElements)}`);

    // outputLines.push(`export const ${exportName} = [ ${namespacedElements?.join(', ')} ]`);

    // outputLines.push(`const node${titleCaseExportName} = nodeSDK.${exportName}.filter(element => element.name in ${JSON.stringify(nodeElements)})`);
    // const namespacedElements = elementSources?.map(
    //   ({ elementName, source }) => `${source}.${exportName}.${elementName}`,
    // );
    // outputLines.push(`export const ${exportName} = [ ${namespacedElements?.join(', ')} ]`);
  }

  if (source === 'object') {
    const titleCaseExportName = exportName.replace(exportName[0], exportName[0].toUpperCase());
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { node: nodeElementNames, react: reactElementNames } = elementSources!;

    outputLines.push(`const node${titleCaseExportName}Names = ${JSON.stringify(nodeElementNames)}`);
    outputLines.push(`const react${titleCaseExportName}Names = ${JSON.stringify(reactElementNames)}`);
    outputLines.push(`const node${titleCaseExportName} = { } as { [key: string]: any };`);
    outputLines.push(`const react${titleCaseExportName} = { } as { [key: string]: any };`);
    outputLines.push(
      `node${titleCaseExportName}Names.forEach(elementName => { node${titleCaseExportName}[elementName] = nodeSDK.${exportName}[elementName as keyof typeof nodeSDK.${exportName}]});`,
    );
    outputLines.push(
      `react${titleCaseExportName}Names.forEach(elementName => { react${titleCaseExportName}[elementName] = reactSDK.${exportName}[elementName as keyof typeof reactSDK.${exportName}]});`,
    );
    outputLines.push(`export const ${exportName} = { ...node${titleCaseExportName}, ...react${titleCaseExportName} }`);

    // nodeElementNames.forEach(elementName => { x[elementName] = nodeSDK.y[elementName] });
    return;
  }
});

// export const ${collectionName} = [nodeSDK.Http, ${source}.${elementName}, etc]
// export const ${collectionName} = {Http: nodeSDK.Http, ${elementName}: ${source}.${elementName}, etc}

// nodeSDK.defaultIntegrations.filter(integration => nodeElements.includes(integration.name));

console.log(outputLines);
// eslint-disable-next-line no-console
console.log('Generating `types.ts`...');

// add a newline at the end of the file to make Prettier happy
const output = `${outputLines.join('\n')}\n`;
fs.writeFileSync('./src/types.ts', output);

// eslint-disable-next-line no-console
console.log('Done writing file.');
