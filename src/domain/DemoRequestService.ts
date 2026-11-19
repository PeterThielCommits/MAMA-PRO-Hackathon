import type { Catalog, Offer } from './catalog';
import {
  isExpiredAttempt, offerSnapshot, StorageFailure, UncertainStorageResult,
  type AttemptStorage, type ClearOutcome, type DemoRequest, type RequestAttempt,
  type RequestFlowError, type RequestPhase, type RequestRepository,
} from './demoRequest';

export interface RequestFlowState {
  phase: RequestPhase; request: DemoRequest | null; attempt: RequestAttempt | null;
  error: RequestFlowError | null;
}
const freshState = (): RequestFlowState => ({ phase: 'draft', request: null, attempt: null, error: null });
class BindingConflict extends Error {}

export class DemoRequestService {
  private state = freshState();
  private listeners = new Set<() => void>();
  private tail: Promise<unknown> = Promise.resolve();
  private pendingSubmit: Promise<void> | null = null;
  private initialization: Promise<void> | null = null;
  constructor(private readonly repository: RequestRepository, private readonly intents: AttemptStorage,
    private readonly now: () => number = Date.now, private readonly uuid: () => string = () => crypto.randomUUID()) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private update(patch: Partial<RequestFlowState>) {
    this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener());
  }
  initialize() {
    this.initialization ??= this.repository.deleteExpired().catch(error => { this.initialization = null; throw error; });
    return this.initialization;
  }
  // One FIFO tail serializes submit/cancel/clear/recover. A read-only recovery
  // never observes or mutates a half-finished clear. A double submit is
  // additionally coalesced into one logical operation.
  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const operation = this.tail.then(action, action);
    this.tail = operation.then(() => undefined, () => undefined);
    return operation;
  }
  private fail(error: RequestFlowError) { this.update({ phase: 'error', error }); }
  private accept(record: DemoRequest) { this.update({ phase: record.status, request: record, error: null }); }
  private async check(attempt: RequestAttempt) {
    this.update({ phase: 'checking', attempt, error: null });
    const record = await this.repository.getByIdempotencyKey(attempt.idempotencyKey);
    if (record) {
      if (record.offerId !== attempt.offerId || record.specialistId !== attempt.specialistId ||
        record.catalogVersion !== attempt.catalogVersion) throw new BindingConflict();
      this.accept(record);
    }
    return record;
  }
  recover() {
    return this.enqueue(async () => {
      this.update({ phase: 'checking', error: null });
      let attempt: RequestAttempt | null;
      try { attempt = this.intents.read(); }
      catch { this.update({ phase: 'error', error: 'requestIntentError' }); return; }
      try {
        await this.initialize();
        if (attempt && await this.check(attempt)) return;
        this.update({ phase: 'draft', attempt, request: null, error: null });
      } catch (error) {
        this.update({ phase: 'error', attempt, error: error instanceof BindingConflict ? 'requestConflict' : 'requestReadError' });
      }
    });
  }
  submit(offer: Offer, catalog: Catalog, acknowledged: boolean) {
    if (!acknowledged) return Promise.resolve();
    if (this.pendingSubmit) return this.pendingSubmit;
    const operation = this.enqueue(() => this.persist(offer, catalog));
    this.pendingSubmit = operation;
    void operation.then(
      () => { if (this.pendingSubmit === operation) this.pendingSubmit = null; },
      () => { if (this.pendingSubmit === operation) this.pendingSubmit = null; },
    );
    return operation;
  }
  private async persist(offer: Offer, catalog: Catalog) {
    let attempt: RequestAttempt | null;
    try { attempt = this.intents.read(); }
    catch { this.update({ phase: 'error', attempt: null, request: null, error: 'requestIntentError' }); return; }
    try {
      await this.initialize();
      // Never trust a component-supplied object for the historical snapshot:
      // resolve the exact public pair from the current parsed catalog.
      const canonical = catalog.offers.find(candidate => candidate.id === offer.id &&
        candidate.specialistId === offer.specialistId && candidate.publicationStatus === 'published');
      const owner = canonical && catalog.specialists.find(specialist => specialist.id === canonical.specialistId &&
        specialist.publicationStatus === 'published');
      if (!canonical || !owner) {
        this.update({ phase: 'error', attempt, request: null, error: 'requestInvalidOffer' }); return;
      }
      if (attempt) {
        const existing = await this.check(attempt);
        const sameSelection = attempt.offerId === canonical.id && attempt.specialistId === canonical.specialistId &&
          attempt.catalogVersion === catalog.catalogVersion;
        if (existing && sameSelection) return;
        if (existing && attempt.offerId === canonical.id && attempt.specialistId === canonical.specialistId &&
          attempt.catalogVersion !== catalog.catalogVersion) {
          // The same offer was saved under a previous catalog version. Show the
          // historical row instead of silently replacing it or creating a
          // second DEMO request under a new identity.
          this.accept(existing); return;
        }
        if (!existing && isExpiredAttempt(attempt, this.now())) {
          // The old operation is resolved as absent. Require a separate new click.
          try { this.intents.clear(); }
          catch { this.update({ phase: 'error', attempt, request: null, error: 'requestIntentError' }); return; }
          this.update({ ...freshState(), phase: 'error', error: 'requestExpiredAttempt' }); return;
        }
        // A successful absent read resolves the old outcome too. Only then may
        // an explicit action for another selection start with a new key.
        if (!sameSelection) attempt = null;
      }
      if (!attempt) {
        attempt = { idempotencyKey: this.uuid(), offerId: canonical.id, specialistId: canonical.specialistId,
          catalogVersion: catalog.catalogVersion, startedAt: this.now() };
      }
      // No durable intent => no write. There is no successful in-memory fallback.
      try { this.intents.save(attempt); }
      catch { this.update({ phase: 'error', attempt, request: null, error: 'requestIntentError' }); return; }
      this.update({ phase: 'submitting', attempt, request: null, error: null });
      const timestamp = new Date(this.now()).toISOString();
      const row: DemoRequest = {
        id: this.uuid(), idempotencyKey: attempt.idempotencyKey, offerId: attempt.offerId,
        specialistId: attempt.specialistId, catalogVersion: attempt.catalogVersion,
        status: 'recorded_demo', createdAt: timestamp, updatedAt: timestamp,
        nonPersonalOfferSnapshot: offerSnapshot(canonical),
      };
      try {
        const saved = await this.repository.add(row);
        if (saved.idempotencyKey !== attempt.idempotencyKey || saved.offerId !== attempt.offerId ||
          saved.specialistId !== attempt.specialistId || saved.catalogVersion !== attempt.catalogVersion) {
          throw new BindingConflict();
        }
        this.accept(saved);
      } catch (error) {
        if (error instanceof BindingConflict) {
          this.update({ phase: 'error', attempt, request: null, error: 'requestConflict' }); return;
        }
        if (!(error instanceof UncertainStorageResult)) throw error;
        try {
          if (!await this.check(attempt)) this.update({ phase: 'error', error: 'requestStorageError' });
        } catch (checkError) {
          this.update({ phase: 'error', attempt, error: checkError instanceof BindingConflict ? 'requestConflict' : 'requestReadError' });
        }
      }
    } catch (error) {
      if (error instanceof BindingConflict) this.fail('requestConflict');
      else if (error instanceof StorageFailure && error.code === 'invalid_record') this.fail('requestStorageError');
      else if (this.state.phase === 'checking') this.fail('requestReadError');
      else this.fail('requestStorageError');
    }
  }
  async getById(id: string) { await this.initialize(); return this.repository.getById(id); }
  cancel(id: string) {
    return this.enqueue(async () => {
      await this.initialize();
      // Reconcile before each cancellation too. Cancelled is terminal and repeatable.
      const previous = await this.repository.getById(id);
      if (!previous || previous.status === 'cancelled_demo') return previous;
      try { return await this.repository.cancel(id); }
      catch (error) {
        if (error instanceof UncertainStorageResult) {
          const checked = await this.repository.getById(id);
          if (checked?.status === 'cancelled_demo') return checked;
        }
        throw error;
      }
    });
  }
  clear(onCommitted?: () => void): Promise<ClearOutcome> {
    return this.enqueue(async () => {
      await this.initialize();
      // IndexedDB is authoritative: never report a durable clear before this
      // promise resolves on transaction.oncomplete.
      await this.repository.clear();
      this.update(freshState());
      onCommitted?.();
      let intentCleared = true;
      try { this.intents.clear(); }
      catch { intentCleared = false; }
      return { recordsCleared: true, intentCleared };
    });
  }
}
