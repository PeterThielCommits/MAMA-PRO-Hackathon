import type { SearchResult } from './SearchService';

export interface LocatedOffer {
  offerId: string; lat: number; lon: number; source: string; checkedAt: string;
  access: { stepFree: null; lift: null; source: string; checkedAt: null };
}

// Fictional points, manually authored for the demo. Not actual practice addresses.
export const demoLocations: LocatedOffer[] = [
  ['O01', 43.222, 76.901], ['O02', 43.25, 76.91], ['O04', 43.235, 76.85],
  ['O06', 43.218, 76.913], ['O07', 43.212, 76.9], ['O08', 43.219, 76.922],
  ['O10', 43.24, 76.96], ['O11', 43.209, 76.924], ['O12', 43.26, 76.929],
  ['O13', 43.24, 76.839], ['O16', 43.255, 76.94], ['O17', 43.23, 76.97],
  ['O23', 43.217, 76.94],
].map(([id, lat, lon]) => ({
  offerId: String(id), lat: Number(lat), lon: Number(lon),
  source: 'synthetic-map-v1', checkedAt: '2026-11-10T12:00:00+05:00',
  access: { stepFree: null, lift: null, source: 'unknown', checkedAt: null },
}));

const isoInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const inRange = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;

// A point is only usable when every field shown in the list is explicit. A
// coordinate outside WGS84 or a missing source/date is never invented into a pin.
export function isValidLocation(location: LocatedOffer): boolean {
  return typeof location.offerId === 'string' && location.offerId.trim().length > 0 &&
    inRange(location.lat, -90, 90) && inRange(location.lon, -180, 180) &&
    typeof location.source === 'string' && location.source.trim().length > 0 &&
    typeof location.checkedAt === 'string' && isoInstant.test(location.checkedAt) &&
    Number.isFinite(Date.parse(location.checkedAt));
}

export function mapSearchResult(result: SearchResult, locations: LocatedOffer[] = demoLocations) {
  // The only input is the current search projection. No independent matching.
  const ids = [...new Set(result.items.flatMap(item => item.matchingOfferIds))];
  const byId = new Map<string, LocatedOffer[]>();
  for (const location of locations) {
    if (!location || typeof location.offerId !== 'string' || !location.offerId.trim()) continue;
    const existing = byId.get(location.offerId);
    if (existing) existing.push(location); else byId.set(location.offerId, [location]);
  }
  const points: LocatedOffer[] = [];
  const missing: string[] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];
  for (const id of ids) {
    const candidates = byId.get(id) ?? [];
    if (candidates.length === 0) { missing.push(id); continue; }
    if (candidates.length > 1) duplicates.push(id);
    const valid = candidates.find(isValidLocation);
    if (valid) points.push(valid); else invalid.push(id);
  }
  return { points, missing, invalid, duplicates };
}

export function straightDistanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  if (!inRange(a.lat, -90, 90) || !inRange(a.lon, -180, 180) ||
    !inRange(b.lat, -90, 90) || !inRange(b.lon, -180, 180)) return null;
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2));
}
