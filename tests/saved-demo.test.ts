import { describe, expect, it } from 'vitest';
import raw from '../src/data/catalog.json';
import { catalogSchema } from '../src/domain/catalog';
import {
  readSavedDemos, removeSavedDemo, SAVED_DEMO_KEY, SAVED_DEMO_LIMIT, savedDemoFromOffer,
  savedDemoSchema, savedDemosSchema, upsertSavedDemo, writeSavedDemos, type SavedDemo,
} from '../src/domain/savedDemo';

const catalog = catalogSchema.parse(raw);
const offer = catalog.offers[0];
const savedAt = '2026-11-15T10:00:00Z';
const row = () => savedDemoFromOffer(catalog, offer.id, savedAt);
function memory(initial: string | null = null) {
  let value = initial;
  return {
    getItem: (key: string) => key === SAVED_DEMO_KEY ? value : null,
    setItem: (key: string, next: string) => { expect(key).toBe(SAVED_DEMO_KEY); value = next; },
    raw: () => value,
  };
}
function card(index: number): SavedDemo {
  return { ...row(), id: `O-${index}`, savedAt: new Date(Date.UTC(2026, 10, 1, 0, 0, index)).toISOString() };
}

describe('saved demo card contract', () => {
  it('snapshots only allowlisted public fields and never replaces the price confirmation time', () => {
    const snapshot = row();
    expect(Object.keys(snapshot).sort()).toEqual(['checkedAt', 'id', 'isSynthetic', 'name', 'price', 'priceKind', 'savedAt', 'specialistId', 'title']);
    expect(snapshot.checkedAt).toBe(offer.priceConfirmedAt);
    expect(snapshot.savedAt).toBe(savedAt);
    expect(snapshot.id).toBe(offer.id);
    expect(snapshot.isSynthetic).toBe(true);
    const later = savedDemoFromOffer(catalog, offer.id, '2026-11-16T12:00:00Z');
    expect(later.checkedAt).toBe(offer.priceConfirmedAt);
    expect(later.savedAt).not.toBe(later.checkedAt);
  });
  it('rejects private fields, non-ISO instants and unknown price kinds', () => {
    expect(savedDemoSchema.safeParse({ ...row(), phone: '+70000000000' }).success).toBe(false);
    expect(savedDemoSchema.safeParse({ ...row(), checkedAt: '2026-11-15' }).success).toBe(false);
    expect(savedDemoSchema.safeParse({ ...row(), priceKind: 'negotiable' }).success).toBe(false);
    expect(savedDemoSchema.safeParse({ ...row(), isSynthetic: false }).success).toBe(false);
  });
  it('deduplicates by offerId and keeps the newest savedAt for the same offer', () => {
    const first = savedDemoFromOffer(catalog, offer.id, '2026-11-14T10:00:00Z');
    const second = savedDemoFromOffer(catalog, offer.id, '2026-11-15T10:00:00Z');
    const rows = upsertSavedDemo([first], second);
    expect(rows).toHaveLength(1);
    expect(rows[0].savedAt).toBe(second.savedAt);
    expect(rows[0].checkedAt).toBe(first.checkedAt);
  });
  it('bounds the collection at 20 and evicts the oldest savedAt, not insertion order', () => {
    const rows = Array.from({ length: SAVED_DEMO_LIMIT + 5 }, (_, index) => card(index));
    expect(savedDemosSchema.safeParse(rows).success).toBe(false);
    let stored: SavedDemo[] = [];
    for (const next of rows) stored = upsertSavedDemo(stored, next);
    expect(stored).toHaveLength(SAVED_DEMO_LIMIT);
    expect(stored[0].id).toBe(`O-${SAVED_DEMO_LIMIT + 4}`);
    expect(stored.some(item => item.id === 'O-0')).toBe(false);
    expect(stored.some(item => item.id === `O-${SAVED_DEMO_LIMIT + 4}`)).toBe(true);
  });
  it('round-trips through an injected storage and removes only the requested copy', () => {
    const storage = memory();
    expect(readSavedDemos(storage)).toEqual([]);
    writeSavedDemos(storage, [row(), card(1)]);
    expect(readSavedDemos(storage)).toHaveLength(2);
    writeSavedDemos(storage, removeSavedDemo(readSavedDemos(storage), offer.id));
    expect(readSavedDemos(storage).map(item => item.id)).toEqual(['O-1']);
  });
  it('surfaces corrupt or denied storage instead of silently returning an empty list', () => {
    expect(() => readSavedDemos(memory('{not-json'))).toThrow();
    expect(() => readSavedDemos(memory(JSON.stringify([{ id: 'O01' }])))).toThrow();
    expect(() => readSavedDemos({ getItem: () => { throw new DOMException('denied', 'SecurityError'); }, setItem: () => {} })).toThrow();
    expect(() => writeSavedDemos({ getItem: () => null, setItem: () => { throw new DOMException('denied', 'SecurityError'); } }, [row()])).toThrow();
  });
  it('refuses a missing or unpublished offer instead of saving a forged card', () => {
    expect(() => savedDemoFromOffer(catalog, 'missing', savedAt)).toThrow('SAVED_DEMO_OFFER_UNAVAILABLE');
    const draft = { ...catalog, offers: catalog.offers.map(candidate => candidate.id === offer.id ? { ...candidate, publicationStatus: 'withdrawn' as const } : candidate) };
    expect(() => savedDemoFromOffer(draft, offer.id, savedAt)).toThrow('SAVED_DEMO_OFFER_UNAVAILABLE');
  });
});
