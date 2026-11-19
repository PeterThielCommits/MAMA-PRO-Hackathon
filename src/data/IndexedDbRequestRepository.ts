import {
  demoRequestSchema, isExpiredRequest, REQUEST_TTL, StorageFailure, UncertainStorageResult,
  type DemoRequest, type RequestRepository, type StorageFailureCode,
} from '../domain/demoRequest';

export const REQUEST_DB = 'qoldau-demo-v1';
export const REQUEST_STORE = 'requests';
type TransactionOperation<T> = (
  store: IDBObjectStore,
  result: (value: T) => void,
  fail: (error: unknown) => void,
) => void;

function storageCode(error: unknown): StorageFailureCode | null {
  const name = error instanceof DOMException ? error.name : (error as { name?: unknown } | null)?.name;
  switch (name) {
    case 'ConstraintError': return 'unique_conflict';
    case 'QuotaExceededError': return 'quota_exceeded';
    case 'SecurityError': return 'open_denied';
    case 'VersionError': return 'version_mismatch';
    case 'InvalidStateError': return 'version_mismatch';
    case 'AbortError': return 'transaction_aborted';
    case 'TimeoutError': return 'transaction_timeout';
    case 'NotFoundError':
    case 'NotSupportedError': return 'schema_mismatch';
    case 'DataError':
    case 'DataCloneError': return 'invalid_record';
    default: return null;
  }
}
function asStorageFailure(error: unknown, fallback: StorageFailureCode): StorageFailure {
  if (error instanceof StorageFailure) return error;
  const message = error instanceof Error ? error.message : 'Request storage unavailable';
  return new StorageFailure(message, storageCode(error) ?? fallback);
}

export class IndexedDbRequestRepository implements RequestRepository {
  constructor(private readonly factory: () => IDBFactory = () => indexedDB,
    private readonly now: () => number = Date.now, private readonly timeoutMs = 8000) {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const fail = (error: StorageFailure) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        reject(error);
      };
      timer = setTimeout(() => fail(new StorageFailure('IndexedDB open timed out', 'open_timeout')), this.timeoutMs);
      try {
        const request = this.factory().open(REQUEST_DB, 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore(REQUEST_STORE, { keyPath: 'id' });
          store.createIndex('idempotencyKey', 'idempotencyKey', { unique: true });
        };
        request.onerror = () => fail(asStorageFailure(request.error, 'open_denied'));
        request.onblocked = () => fail(new StorageFailure('IndexedDB open blocked', 'open_blocked'));
        request.onsuccess = () => {
          const db = request.result;
          if (settled) { db.close(); return; }
          try {
            const store = db.transaction(REQUEST_STORE).objectStore(REQUEST_STORE);
            if (store.keyPath !== 'id' || !store.index('idempotencyKey').unique ||
              store.index('idempotencyKey').keyPath !== 'idempotencyKey') {
              throw new StorageFailure('IndexedDB schema mismatch', 'schema_mismatch');
            }
          } catch (error) {
            db.close();
            fail(asStorageFailure(error, 'schema_mismatch'));
            return;
          }
          settled = true;
          if (timer) clearTimeout(timer);
          db.onversionchange = () => db.close();
          resolve(db);
        };
      } catch (error) {
        fail(asStorageFailure(error, 'open_denied'));
      }
    });
  }

  private async transaction<T>(mode: IDBTransactionMode, operation: TransactionOperation<T>): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction | null = null;
      let value!: T;
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: unknown) => {
        if (timer) clearTimeout(timer);
        db.close();
        if (settled) return;
        settled = true;
        if (error) reject(error); else resolve(value);
      };
      const fail = (error: unknown) => {
        // A synchronous failure after a queued write must also roll back.
        try { tx?.abort(); } catch { /* No active transaction. */ }
        finish(asStorageFailure(error, mode === 'readonly' ? 'read_failed' : 'write_failed'));
      };
      // A deadline is never an abort claim: a write may still commit.
      timer = setTimeout(() => finish(new UncertainStorageResult('Transaction outcome unknown', 'transaction_timeout')), this.timeoutMs);
      try {
        tx = db.transaction(REQUEST_STORE, mode);
        tx.oncomplete = () => finish();
        tx.onabort = () => finish(asStorageFailure(tx?.error, 'transaction_aborted'));
        tx.onerror = () => { /* The transaction abort determines the outcome. */ };
        operation(tx.objectStore(REQUEST_STORE), next => { value = next; }, fail);
      } catch (error) {
        fail(error);
      }
    });
  }

  private parse(value: unknown): DemoRequest | null {
    if (value === undefined) return null;
    const parsed = demoRequestSchema.safeParse(value);
    if (!parsed.success) throw new StorageFailure('Stored request failed validation', 'invalid_record');
    return isExpiredRequest(parsed.data, this.now()) ? null : parsed.data;
  }

  async add(input: DemoRequest): Promise<DemoRequest> {
    const parsed = demoRequestSchema.safeParse(input);
    if (!parsed.success) throw new StorageFailure('Request record failed validation', 'invalid_record');
    const record = parsed.data;
    try {
      return await this.transaction('readwrite', (store, result) => {
        store.add(record).onsuccess = () => result(record);
      });
    } catch (error) {
      if (error instanceof StorageFailure && error.code === 'unique_conflict') {
        const existing = await this.getByIdempotencyKey(record.idempotencyKey);
        if (existing) return existing;
      }
      throw error;
    }
  }

  async getById(id: string) {
    const value = await this.transaction<unknown>('readonly', (store, result) => {
      store.get(id).onsuccess = event => result((event.target as IDBRequest).result);
    });
    return this.parse(value);
  }

  async getByIdempotencyKey(key: string) {
    const value = await this.transaction<unknown>('readonly', (store, result) => {
      store.index('idempotencyKey').get(key).onsuccess = event => result((event.target as IDBRequest).result);
    });
    return this.parse(value);
  }

  async cancel(id: string) {
    return this.transaction<DemoRequest | null>('readwrite', (store, result, fail) => {
      const read = store.get(id);
      read.onsuccess = () => {
        try {
          const record = this.parse(read.result);
          if (!record || record.status === 'cancelled_demo') { result(record); return; }
          const cancelled: DemoRequest = { ...record, status: 'cancelled_demo', updatedAt: new Date(this.now()).toISOString() };
          store.put(cancelled).onsuccess = () => result(cancelled);
        } catch (error) { fail(error); }
      };
      read.onerror = () => fail(read.error);
    });
  }

  async deleteExpired() {
    const now = this.now();
    await this.transaction<void>('readwrite', (store, result, fail) => {
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        try {
          const entry = cursor.result;
          if (!entry) { result(); return; }
          const createdAt = Date.parse((entry.value as { createdAt?: unknown } | null)?.createdAt as string);
          if (Number.isFinite(createdAt) && now - createdAt > REQUEST_TTL) entry.delete();
          entry.continue();
        } catch (error) { fail(error); }
      };
      cursor.onerror = () => fail(cursor.error);
    });
  }

  async clear() {
    await this.transaction<void>('readwrite', (store, result) => { store.clear().onsuccess = () => result(); });
  }
}
