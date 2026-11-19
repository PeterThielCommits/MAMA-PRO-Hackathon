import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/AppState';
import type { SearchResult } from '../../domain/SearchService';
import { mapSearchResult } from '../../domain/map';
import type { MessageKey } from '../../i18n/messages';

export function ResultMap({ result }: { result: SearchResult }) {
  const { locale, catalog, t } = useApp();
  const [geo, setGeo] = useState<'idle' | 'pending' | 'denied' | 'available'>('idle');
  const { points, missing, invalid, duplicates } = mapSearchResult(result);
  const [selected, setSelected] = useState<string | null>(null);
  // All copy comes from the shared i18n catalog instead of inline RU/KK pairs (F-06).
  const geoStatus: MessageKey | null = geo === 'idle' ? null
    : geo === 'pending' ? 'mapPending' : geo === 'denied' ? 'mapDenied' : 'mapAvailable';
  // Catalog fact dates use Asia/Almaty (EXP-04 contract).
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Almaty' }).format(new Date(iso));
  function locate() {
    setGeo('pending');
    if (!navigator.geolocation) { setGeo('denied'); return; }
    navigator.geolocation.getCurrentPosition(() => setGeo('available'), () => setGeo('denied'), {
      enableHighAccuracy: false, timeout: 10000, maximumAge: 0,
    });
  }
  return <section className="result-map" aria-labelledby="map-title">
    <h2 id="map-title">{t('mapTitle')}</h2><p>{t('mapHelp')}</p>
    <button className="button secondary" disabled={geo === 'pending'} onClick={locate}>{t('mapGeo')}</button>
    {geoStatus && <p role="status">{t(geoStatus)}</p>}
    <div className="map-canvas" role="group" aria-label={t('mapTitle')}>
      {points.map((point, i) => {
        const offer = catalog.offers.find(candidate => candidate.id === point.offerId);
        return <button key={point.offerId} type="button" className="map-point"
          style={{ left: `${10 + (point.lon - 76.83) / .15 * 80}%`, top: `${85 - (point.lat - 43.20) / .07 * 70}%` }}
          aria-label={t('mapPointLabel', { number: i + 1, title: offer?.title[locale] ?? point.offerId })}
          aria-pressed={selected === point.offerId}
          onClick={() => { setSelected(point.offerId); document.getElementById(`map-${point.offerId}`)?.focus(); }}>
          {i + 1}
        </button>;
      })}
    </div>
    <p>{t('mapMissing')} {missing.length}</p>
    {invalid.length > 0 && <p role="status">{t('mapInvalid')} {invalid.length}</p>}
    {duplicates.length > 0 && <p role="status">{t('mapDuplicate')} {duplicates.length}</p>}
    <h3>{t('mapList')}</h3>
    <ol>{points.map(point => {
      const offer = catalog.offers.find(candidate => candidate.id === point.offerId);
      return <li key={point.offerId} id={`map-${point.offerId}`} tabIndex={-1}>
        {offer ? <Link to={`/specialists/${encodeURIComponent(offer.specialistId)}?offer=${encodeURIComponent(point.offerId)}`}>{offer.title[locale]} · {point.offerId}</Link>
          : <span>{point.offerId}</span>}
        <p>{point.lat}, {point.lon} · {t('mapSource')}: {point.source} · {t('mapDate')}: {date(point.checkedAt)}</p>
        <p>{t('mapAccess')}</p>
      </li>;
    })}</ol>
  </section>;
}
