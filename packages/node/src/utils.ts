import { getCurrentHub } from '@sentry/core'
import { SpanContext } from '@sentry/types';
import * as domain from 'domain';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Recursively read the contents of a directory.
 *
 * @param targetDir Absolute or relative path of the directory to scan. All returned paths will be relative to this
 * directory.
 * @returns Array holding all relative paths
 */
export function deepReadDirSync(targetDir: string): string[] {
  const targetDirAbsPath = path.resolve(targetDir);

  if (!fs.existsSync(targetDirAbsPath)) {
    throw new Error(`Cannot read contents of ${targetDirAbsPath}. Directory does not exist.`);
  }

  if (!fs.statSync(targetDirAbsPath).isDirectory()) {
    throw new Error(`Cannot read contents of ${targetDirAbsPath}, because it is not a directory.`);
  }

  // This does the same thing as its containing function, `deepReadDirSync` (except that - purely for convenience - it
  // deals in absolute paths rather than relative ones). We need this to be separate from the outer function to preserve
  // the difference between `targetDirAbsPath` and `currentDirAbsPath`.
  const deepReadCurrentDir = (currentDirAbsPath: string): string[] => {
    return fs.readdirSync(currentDirAbsPath).reduce((absPaths: string[], itemName: string) => {
      const itemAbsPath = path.join(currentDirAbsPath, itemName);

      if (fs.statSync(itemAbsPath).isDirectory()) {
        return [...absPaths, ...deepReadCurrentDir(itemAbsPath)];
      }

      return [...absPaths, itemAbsPath];
    }, []);
  };

  return deepReadCurrentDir(targetDirAbsPath).map(absPath => path.relative(targetDirAbsPath, absPath));
}

type Trace<T> = (spanContext: SpanContext, fn: () => T) => Promise<T>
type DomainExt = ReturnType<typeof domain.create> & { parent?: DomainExt }

export const trace: Trace<unknown> = async (spanContext, fn) => new Promise((resolve, reject) => {
  const d = domain.create() as DomainExt
  // @ts-ignore
  d.parent = (domain as unknown).active
  d.on('error', reject)
  d.run(async () => {
    const parent = getCurrentHub().getScope()
    const span = parent?.getSpan()?.startChild(spanContext)
    parent?.setSpan(span)
    try {
      resolve(await fn())
    } catch(e) {
      span?.setStatus('unknown_error')
      reject(e)
    } finally {
      span?.finish()
      delete d.parent
    }
  })
})
