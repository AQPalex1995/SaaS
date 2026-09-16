import { serverConfig } from '../config.js';
import { logger } from '../logger.js';
import type { StorageProvider } from './types.js';
import { LocalStorageProvider } from './local.js';

/**
 * Storage provider factory — the ONLY place that knows how STORAGE_PROVIDER
 * maps to a concrete implementation. Consumers depend on the interface.
 */
export function createStorageProvider(): StorageProvider {
  switch (serverConfig.storageProvider) {
    case 'local':
      return new LocalStorageProvider(serverConfig.storageLocalDir);
    case 'gcs': {
      // Future: import { GcsStorageProvider } from './gcs.js'
      // Requires @google-cloud/storage installed + STORAGE_BUCKET/credentials.
      throw new Error(
        'STORAGE_PROVIDER=gcs is not implemented yet. Keep "local" until the GCS provider lands.'
      );
    }
    default:
      throw new Error(`Unknown STORAGE_PROVIDER: ${serverConfig.storageProvider}`);
  }
}

let storage: StorageProvider | null = null;

/** Lazy singleton. Errors here kill the process — storage is mandatory. */
export function getStorage(): StorageProvider {
  if (!storage) {
    storage = createStorageProvider();
    logger.info({ provider: storage.name }, 'Storage provider initialized');
  }
  return storage;
}

export async function closeStorage(): Promise<void> {
  if (storage) {
    await storage.close();
    storage = null;
  }
}