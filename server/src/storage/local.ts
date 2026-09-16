import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertSafeKey, type StorageProvider, type StoragePutOptions } from './types.js';
import { logger } from '../logger.js';

/**
 * LocalStorageProvider — filesystem backend.
 *
 * This is the DEFAULT provider for development and the only one currently
 * available. It is deliberately simple:
 *  - objects are written under the configured base directory (STORAGE_LOCAL_DIR)
 *  - getPublicUrl / getSignedUrl return null (no HTTP serving yet)
 *
 * The interface makes swapping to a managed provider (GCS) a drop-in change.
 * NOTE: this provider does NOT scale horizontally — never use it for
 * production on a cloud platform.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
  }

  private resolvePath(key: string): string {
    assertSafeKey(key);
    return path.join(this.baseDir, ...key.split(/[\\/]+/));
  }

  async put(key: string, data: Buffer, options?: StoragePutOptions): Promise<{ key: string }> {
    assertSafeKey(key);
    const fullPath = this.resolvePath(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, data);
    if (options?.contentType) {
      logger.debug({ key, contentType: options.contentType }, 'Object stored (local)');
    }
    return { key };
  }

  async get(key: string): Promise<Buffer | null> {
    const fullPath = this.resolvePath(key);
    try {
      return await fs.readFile(fullPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = this.resolvePath(key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    const fullPath = this.resolvePath(key);
    try {
      await fs.unlink(fullPath);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw err;
    }
  }

  async getPublicUrl(key: string): Promise<string | null> {
    // Not served over HTTP yet — the API stores the relative key instead.
    void assertSafeKey(key);
    return null;
  }

  async getSignedUrl(): Promise<string | null> {
    return null;
  }

  async close(): Promise<void> {
    // Local storage has no persistent connections to release.
  }

  /** Absolute file:// URL (useful for local tooling/debugging only). */
  toFileUrl(key: string): string {
    return pathToFileURL(this.resolvePath(key)).href;
  }
}