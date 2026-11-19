import { z } from 'zod';
import type { Offer } from './catalog';

export const REQUEST_TTL = 7 * 24 * 60 * 60 * 1000;
export const REQUEST_ATTEMPT_TTL = 2 * 60 * 60 * 1000;
const timestamp = z.iso.datetime({ offset: true });
export const demoRequestSchema = z.strictObject({
  id: z.string().min(1), idempotencyKey: z.string().min(1),
  offerId: z.string().min(1), specialistId: z.string().min(1),
  status: z.enum(['recorded_demo', 'cancelled_demo']),
  createdAt: timestamp, updatedAt: timestamp, catalogVersion: z.string().min(1),
  nonPersonalOfferSnapshot: z.strictObject({
    title: z.strictObject({ ru: z.string(), kk: z.string() }),
    priceKind: z.enum(['exact', 'from', 'free', 'unknown']), priceAmountKzt: z.number().int().nonnegative().nullable(),
    currency: z.literal('KZT'), unit: z.enum(['individual_session', 'group_session', 'consultation']),
    durationMinutes: z.number().int().positive().nullable(), languages: z.array(z.enum(['ru', 'kk'])).nullable(),
    format: z.enum(['offline', 'online', 'unknown']), priceConfirmedAt: timestamp.nullable(),
  }),
});
export type DemoRequest = z.infer<typeof demoRequestSchema>;
export type RequestPhase = 'draft' | 'submitting' | 'checking' | 'recorded_demo' | 'error' | 'cancelled_demo';
export type RequestFlowError =
  | 'requestStorageError'
  | 'requestReadError'
  | 'requestIntentError'
  | 'requestExpiredAttempt'
  | 'requestConflict'
  | 'requestInvalidOffer';
export interface RequestAttempt {
  idempotencyKey: string; offerId: string; specialistId: string; catalogVersion: string; startedAt: number;
}
export interface AttemptStorage {
  read(): RequestAttempt | null;
  save(attempt: RequestAttempt): void;
  clear(): void;
}
export const isExpiredAttempt = (attempt: RequestAttempt, now: number) =>
  !Number.isFinite(attempt.startedAt) || now - attempt.startedAt > REQUEST_ATTEMPT_TTL;
export function offerSnapshot(offer: Offer): DemoRequest['nonPersonalOfferSnapshot'] {
  // Explicit allowlist: never spread the offer, search input, or family context.
  return {
    title: { ru: offer.title.ru, kk: offer.title.kk }, priceKind: offer.priceKind,
    priceAmountKzt: offer.priceAmountKzt, currency: 'KZT', unit: offer.unit,
    durationMinutes: offer.durationMinutes, languages: offer.languages && [...offer.languages],
    format: offer.format, priceConfirmedAt: offer.priceConfirmedAt,
  };
}
// Invalid stored instants are treated as expired/missing, never as a valid
// eternal record. A future instant is a valid absolute instant by contract:
// the 7-day window starts there, so it is not expired early.
export const isExpiredRequest = (record: DemoRequest, now: number) => {
  const createdAt = Date.parse(record.createdAt);
  return !Number.isFinite(createdAt) || now - createdAt > REQUEST_TTL;
};

export type StorageFailureCode =
  | 'open_denied'
  | 'open_blocked'
  | 'open_timeout'
  | 'schema_mismatch'
  | 'version_mismatch'
  | 'quota_exceeded'
  | 'transaction_aborted'
  | 'transaction_timeout'
  | 'read_failed'
  | 'write_failed'
  | 'unique_conflict'
  | 'invalid_record'
  | 'unknown';

export class StorageFailure extends Error {
  constructor(message = 'Request storage unavailable', readonly code: StorageFailureCode = 'unknown') {
    super(message);
    this.name = 'StorageFailure';
  }
}
export class UncertainStorageResult extends StorageFailure {
  constructor(message = 'Transaction outcome unknown', code: StorageFailureCode = 'transaction_timeout') {
    super(message, code);
    this.name = 'UncertainStorageResult';
  }
}
export interface ClearOutcome {
  recordsCleared: boolean;
  intentCleared: boolean;
}
export interface RequestRepository {
  add(record: DemoRequest): Promise<DemoRequest>;
  getById(id: string): Promise<DemoRequest | null>;
  getByIdempotencyKey(key: string): Promise<DemoRequest | null>;
  cancel(id: string): Promise<DemoRequest | null>;
  deleteExpired(): Promise<void>;
  clear(): Promise<void>;
}
