import { describe, expect, it } from 'vitest';
import type { SearchResult } from '../src/domain/SearchService';
import { demoLocations, isValidLocation, mapSearchResult, straightDistanceKm, type LocatedOffer } from '../src/domain/map';

const base: LocatedOffer = {
  offerId: 'O01', lat: 43.222, lon: 76.901, source: 'synthetic-map-v1',
  checkedAt: '2026-11-10T12:00:00+05:00', access: { stepFree: null, lift: null, source: 'unknown', checkedAt: null },
};
const projection = (ids: string[]) => ({ items: [{ matchingOfferIds: ids }] }) as unknown as SearchResult;

describe('synthetic map projection', () => {
  it('accepts only explicit finite WGS84 points with a source and an ISO instant', () => {
    expect(isValidLocation(base)).toBe(true);
    expect(isValidLocation({ ...base, lat: Number.NaN })).toBe(false);
    expect(isValidLocation({ ...base, lat: 91 })).toBe(false);
    expect(isValidLocation({ ...base, lon: -181 })).toBe(false);
    expect(isValidLocation({ ...base, source: '   ' })).toBe(false);
    expect(isValidLocation({ ...base, checkedAt: '2026-11-10' })).toBe(false);
    expect(isValidLocation({ ...base, checkedAt: 'not-a-date' })).toBe(false);
    expect(demoLocations.every(isValidLocation)).toBe(true);
  });
  it('plots only matchingOfferIds, deduplicates IDs and reports missing, invalid and duplicate records honestly', () => {
    const locations: LocatedOffer[] = [
      base,
      { ...base, lat: 0, lon: 0 },
      { ...base, offerId: 'O02', lat: 91 },
      { ...base, offerId: 'O04', source: '' },
      { ...base, offerId: 'O06', checkedAt: '2026-11-10' },
    ];
    const mapped = mapSearchResult(projection(['O01', 'O02', 'O04', 'O06', 'O99', 'O01']), locations);
    expect(mapped.points.map(point => point.offerId)).toEqual(['O01']);
    expect(mapped.points[0]).toEqual(base);
    expect(mapped.invalid).toEqual(['O02', 'O04', 'O06']);
    expect(mapped.missing).toEqual(['O99']);
    expect(mapped.duplicates).toEqual(['O01']);
    expect(mapped.points).toHaveLength(1);
  });
  it('never invents a pin for an empty result or a coordinate outside the projection', () => {
    expect(mapSearchResult(projection([]), demoLocations)).toEqual({ points: [], missing: [], invalid: [], duplicates: [] });
    expect(mapSearchResult(projection(['O01']), [])).toEqual({ points: [], missing: ['O01'], invalid: [], duplicates: [] });
  });
  it('calculates distances only for valid coordinates', () => {
    expect(straightDistanceKm({ lat: 43.222, lon: 76.901 }, { lat: 43.222, lon: 76.901 })).toBe(0);
    expect(straightDistanceKm({ lat: 91, lon: 76.901 }, { lat: 43.222, lon: 76.901 })).toBeNull();
    expect(straightDistanceKm({ lat: 43.222, lon: 76.901 }, { lat: Number.NaN, lon: 76.901 })).toBeNull();
  });
});
