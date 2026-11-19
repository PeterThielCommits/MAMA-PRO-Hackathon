import { z } from 'zod';
import type { Catalog } from './catalog';

export const SAVED_DEMO_KEY = 'qoldau.saved-demo.v1';
export const SAVED_DEMO_LIMIT = 20;
const timestamp = z.iso.datetime({ offset: true });
const localized = z.strictObject({ ru: z.string().min(1), kk: z.string().min(1) });

// Explicit allowlist: a saved card is a historical public snapshot, never a
// private pilot record, search input, family context or contact.
export const savedDemoSchema = z.strictObject({
  id: z.string().min(1),
  specialistId: z.string().min(1),
  title: localized,
  name: localized,
  price: z.number().int().nonnegative().nullable(),
  priceKind: z.enum(['exact', 'from', 'free', 'unknown']),
  checkedAt: timestamp.nullable(),
  savedAt: timestamp,
  isSynthetic: z.literal(true),
});
export const savedDemosSchema = z.array(savedDemoSchema).max(SAVED_DEMO_LIMIT);
export type SavedDemo = z.infer<typeof savedDemoSchema>;

export interface SavedDemoStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readSavedDemos(storage: SavedDemoStorage): SavedDemo[] {
  const raw = storage.getItem(SAVED_DEMO_KEY);
  return raw === null ? [] : savedDemosSchema.parse(JSON.parse(raw));
}

export function writeSavedDemos(storage: SavedDemoStorage, rows: SavedDemo[]) {
  // Validate before writing so a caller cannot persist an over-limit or
  // partially-shaped snapshot.
  storage.setItem(SAVED_DEMO_KEY, JSON.stringify(savedDemosSchema.parse(rows)));
}

export function savedDemoFromOffer(catalog: Catalog, offerId: string, savedAt: string): SavedDemo {
  const offer = catalog.offers.find(candidate => candidate.id === offerId && candidate.publicationStatus === 'published');
  const specialist = offer && catalog.specialists.find(candidate =>
    candidate.id === offer.specialistId && candidate.publicationStatus === 'published');
  if (!offer || !specialist) throw new Error('SAVED_DEMO_OFFER_UNAVAILABLE');
  return savedDemoSchema.parse({
    id: offer.id, specialistId: specialist.id,
    title: { ru: offer.title.ru, kk: offer.title.kk },
    name: { ru: specialist.displayName.ru, kk: specialist.displayName.kk },
    price: offer.priceAmountKzt, priceKind: offer.priceKind,
    // The catalog fact time is preserved; savedAt is only when this device
    // made its copy and never replaces the price confirmation time.
    checkedAt: offer.priceConfirmedAt,
    savedAt, isSynthetic: true,
  });
}

export function upsertSavedDemo(rows: SavedDemo[], row: SavedDemo): SavedDemo[] {
  // Newest saved copy first; at the bound the oldest savedAt is evicted.
  const next = [row, ...rows.filter(existing => existing.id !== row.id)];
  next.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
  return next.slice(0, SAVED_DEMO_LIMIT);
}

export function removeSavedDemo(rows: SavedDemo[], offerId: string): SavedDemo[] {
  return rows.filter(row => row.id !== offerId);
}
