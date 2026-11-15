import type { Catalog, Offer } from './catalog';
import type { GroupedSearchItem, SearchResult } from './SearchService';

export interface LocatedOffer {
  offerId: string; lat: number; lon: number; source: string; checkedAt: string;
  access: { stepFree: null; lift: null; source: string; checkedAt: null };
}

/** Synthetic Almaty-ish demo bounds. Not a real administrative boundary. */
export const MAP_BOUNDS = { west: 76.8, east: 76.99, south: 43.19, north: 43.29 } as const;

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

export interface AtlasPoint extends LocatedOffer {
  specialistId: string;
  specialistName: Offer['title'];
  offerTitle: Offer['title'];
  categoryId: Offer['categoryId'];
  districtId: Offer['districtId'];
  format: Offer['format'];
  priceKind: Offer['priceKind'];
  priceAmountKzt: number | null;
  durationMinutes: number | null;
  unit: Offer['unit'];
  languages: Offer['languages'];
  acceptingEnquiries: boolean | null;
  score: number | null;
  coverage: number | null;
  status: GroupedSearchItem['status'];
  /** Stable source order inside the current result snapshot. */
  resultIndex: number;
}

export interface AtlasModel {
  points: AtlasPoint[];
  missing: string[];
  onlineOfferIds: string[];
}

/** Map a coordinate to a percentage inside the synthetic atlas plane. */
export function projectPoint(lat: number, lon: number) {
  const clamp = (value: number) => Math.min(94, Math.max(6, value));
  const x = clamp(((lon - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west)) * 100);
  const y = clamp((1 - (lat - MAP_BOUNDS.south) / (MAP_BOUNDS.north - MAP_BOUNDS.south)) * 100);
  return { x, y };
}

export function straightDistanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2));
}

export function isInsideAtlas(lat: number, lon: number) {
  return lat >= MAP_BOUNDS.south && lat <= MAP_BOUNDS.north && lon >= MAP_BOUNDS.west && lon <= MAP_BOUNDS.east;
}

export function mapSearchResult(result: SearchResult, locations = demoLocations) {
  const ids = [...new Set(result.items.flatMap(item => item.matchingOfferIds))];
  return {
    points: ids.flatMap(id => { const point = locations.find(l => l.offerId === id); return point ? [point] : []; }),
    missing: ids.filter(id => !locations.some(l => l.offerId === id)),
  };
}

/**
 * Join the current search snapshot with the validated catalog. Only offers
 * that are present in the result are shown; metadata can never leak an offer
 * that the matcher excluded.
 */
export function atlasModel(result: SearchResult, catalog: Catalog, locations = demoLocations): AtlasModel {
  const items = new Map<string, GroupedSearchItem>();
  for (const item of [...result.items, ...result.incompleteItems]) {
    for (const offerId of item.matchingOfferIds) items.set(offerId, item);
  }
  const offers = new Map(catalog.offers.map(offer => [offer.id, offer]));
  const specialists = new Map(catalog.specialists.map(specialist => [specialist.id, specialist]));
  const points: AtlasPoint[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const [offerId, item] of items) {
    if (seen.has(offerId)) continue;
    seen.add(offerId);
    const offer = offers.get(offerId);
    if (!offer) continue;
    const location = locations.find(point => point.offerId === offerId);
    if (!location) { missing.push(offerId); continue; }
    const specialist = specialists.get(offer.specialistId);
    if (!specialist) continue;
    const resultIndex = result.items.indexOf(item) >= 0 ? result.items.indexOf(item) : result.items.length + result.incompleteItems.indexOf(item);
    points.push({
      ...location,
      specialistId: offer.specialistId,
      specialistName: specialist.displayName,
      offerTitle: offer.title,
      categoryId: offer.categoryId,
      districtId: offer.districtId,
      format: offer.format,
      priceKind: offer.priceKind,
      priceAmountKzt: offer.priceAmountKzt,
      durationMinutes: offer.durationMinutes,
      unit: offer.unit,
      languages: offer.languages,
      acceptingEnquiries: offer.acceptingEnquiries,
      score: item.score,
      coverage: item.coverage,
      status: item.status,
      resultIndex: Math.max(0, resultIndex),
    });
  }
  // Keep the map in the same order as the current result snapshot; ties are
  // stable by the synthetic point id so rendering never depends on Map order.
  points.sort((a, b) => a.resultIndex - b.resultIndex || a.offerId.localeCompare(b.offerId));
  const onlineOfferIds = [...items.keys()].filter(id => offers.get(id)?.format === 'online');
  return { points, missing: [...new Set([...missing, ...onlineOfferIds])], onlineOfferIds };
}
