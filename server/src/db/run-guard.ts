import { pathToFileURL } from 'node:url';

/**
 * True when the current module is being executed directly (not imported),
 * which lets script modules both expose their main function for reuse (e.g.
 * db:setup -> migrate + seed) and run standalone via tsx / node.
 */
export function isMainRunner(importMetaUrl: string): boolean {
  if (!process.argv[1]) return false;
  try {
    return importMetaUrl === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}