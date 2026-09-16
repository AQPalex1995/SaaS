/**
 * Storage abstraction — cloud-agnostic.
 *
 * Land Intelligence never talks to a concrete storage backend. The active
 * provider is selected by STORAGE_PROVIDER ("local" today, "gcs" in the
 * future). Databases and ports are irrelevant here: only provider + key.
 */

export interface StoragePutOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface StoredObject {
  key: string;
  buffer: Buffer;
  size: number;
  contentType?: string;
}

export interface StorageProvider {
  readonly name: string;

  /** Upload a binary blob and return the canonical key (object name). */
  put(key: string, data: Buffer, options?: StoragePutOptions): Promise<{ key: string }>;

  /** Fetch the object's bytes, or null when it does not exist. */
  get(key: string): Promise<Buffer | null>;

  exists(key: string): Promise<boolean>;

  /** Delete the object. Returns true when it existed. */
  delete(key: string): Promise<boolean>;

  /**
   * Public HTTP URL for an object, or null when the provider cannot expose
   * it over HTTP (e.g. local storage is not served yet).
   */
  getPublicUrl(key: string): Promise<string | null>;

  /**
   * Short-lived signed URL, or null when unsupported.
   * Future GCS provider will implement this via its SDK.
   */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string | null>;

  /** Release any connections / dispose resources. Idempotent. */
  close(): Promise<void>;
}

/**
 * Validate a storage key:
 * - non-empty
 * - relative (no absolute paths)
 * - no path traversal (no "..")
 */
export function assertSafeKey(key: string): void {
  if (!key || key.length === 0) {
    throw new Error('Storage key must not be empty');
  }
  if (key.startsWith('/') || /^[a-zA-Z]:/.test(key)) {
    throw new Error(`Storage key must be relative: ${key}`);
  }
  const segments = key.split(/[\\/]+/);
  if (segments.some((s) => s === '..')) {
    throw new Error(`Storage key must not contain "..": ${key}`);
  }
}