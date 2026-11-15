import { describe, expect, it } from 'vitest';
import raw from '../src/data/catalog.json';
import { catalogSchema } from '../src/domain/catalog';
import { emptySearchInput } from '../src/domain/contracts';
import { atlasModel, isInsideAtlas, MAP_BOUNDS, projectPoint, straightDistanceKm } from '../src/domain/map';
import { SearchService } from '../src/domain/SearchService';

const catalog = catalogSchema.parse(raw);
const service = new SearchService(catalog);
const base = emptySearchInput();

describe('3D atlas model', () => {
  it('projects synthetic coordinates inside the visible plane without inventing locations', () => {
    for (const point of [{ lat: (MAP_BOUNDS.south + MAP_BOUNDS.north) / 2, lon: (MAP_BOUNDS.west + MAP_BOUNDS.east) / 2 }, { lat: 43.222, lon: 76.901 }]) {
      const projected = projectPoint(point.lat, point.lon);
      expect(projected.x).toBeGreaterThanOrEqual(6);
      expect(projected.x).toBeLessThanOrEqual(94);
      expect(projected.y).toBeGreaterThanOrEqual(6);
      expect(projected.y).toBeLessThanOrEqual(94);
    }
    expect(isInsideAtlas(43.222, 76.901)).toBe(true);
    expect(isInsideAtlas(51.169, 71.449)).toBe(false);
    expect(straightDistanceKm({ lat: 43.222, lon: 76.901 }, { lat: 43.222, lon: 76.901 })).toBe(0);
    expect(straightDistanceKm({ lat: 43.222, lon: 76.901 }, { lat: 43.25, lon: 76.91 })).toBeGreaterThan(2);
  });

  it('joins only offers from the current result snapshot and lists online offers separately', () => {
    const result = service.search({ ...base, format: 'offline', districtId: 'BOSTANDYK', sort: 'district' });
    const model = atlasModel(result, catalog);
    const resultIds = new Set([...result.items, ...result.incompleteItems].flatMap(item => item.matchingOfferIds));
    expect(model.points.length).toBeGreaterThan(0);
    for (const point of model.points) {
      expect(resultIds.has(point.offerId)).toBe(true);
      expect(point.offerTitle.ru.length).toBeGreaterThan(0);
      expect(point.specialistName.kk.length).toBeGreaterThan(0);
      expect(point.source).toBe('synthetic-map-v1');
    }
    expect(model.missing).not.toContain(model.points[0].offerId);
    const online = service.search({ ...base, format: 'online' });
    expect(atlasModel(online, catalog).onlineOfferIds.length).toBeGreaterThan(0);
  });

  it('keeps the result order, so the atlas follows the active sort', () => {
    const relevant = atlasModel(service.search({ ...base, sort: 'relevant' }), catalog);
    const price = atlasModel(service.search({ ...base, sort: 'price' }), catalog);
    expect(relevant.points.map(point => point.offerId)).toEqual([...relevant.points].sort((a, b) => a.resultIndex - b.resultIndex || a.offerId.localeCompare(b.offerId)).map(point => point.offerId));
    expect(price.points.length).toBe(relevant.points.length);
    // The first point belongs to the first result group, not to a hidden offer.
    expect(price.points[0].specialistId).toBe(service.search({ ...base, sort: 'price' }).items[0].specialistId);
  });
});
