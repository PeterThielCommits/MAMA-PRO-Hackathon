import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/AppState';
import { CATEGORIES, type Category } from '../../domain/contracts';
import { atlasModel, isInsideAtlas, projectPoint, straightDistanceKm } from '../../domain/map';
import type { SearchResult } from '../../domain/SearchService';
import { categoryKeys, districtKeys, type MessageKey } from '../../i18n/messages';
import { priceText } from '../../i18n/price';
import { Icon } from '../../ui/controls';

type Camera = { rotate: number; tilt: number; zoom: number };
type GeoState = 'idle' | 'pending' | 'denied' | 'available' | 'outside';
const INITIAL_CAMERA: Camera = { rotate: -28, tilt: 58, zoom: 1 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const categoryLabel: Record<Category, MessageKey> = {
  LOGOPED: 'mapLegendLogoped', DEFECTOLOG: 'mapLegendDefectolog', PSYCHOLOG: 'mapLegendPsycholog',
};

/**
 * 3D atlas for the current result snapshot. It is intentionally CSS/SVG-only:
 * no external map tiles, geocoding, fonts or WebGL dependency. Every point is a
 * synthetic catalog offer; distances are straight-line estimates computed in
 * memory and never persisted.
 */
export function ResultMap({ result }: { result: SearchResult }) {
  const { catalog, locale, t } = useApp();
  const model = useMemo(() => atlasModel(result, catalog), [result, catalog]);
  const [selected, setSelected] = useState<string | null>(null);
  const [camera, setCamera] = useState<Camera>(INITIAL_CAMERA);
  const [geo, setGeo] = useState<GeoState>('idle');
  const [user, setUser] = useState<{ lat: number; lon: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; rotate: number; tilt: number } | null>(null);
  const selectedPoint = model.points.find(point => point.offerId === selected) ?? null;
  const selectedOffer = selectedPoint ? catalog.offers.find(offer => offer.id === selectedPoint.offerId) : null;
  const distance = selectedPoint && user ? straightDistanceKm(user, selectedPoint) : null;

  const geoStatus: Partial<Record<GeoState, MessageKey>> = {
    pending: 'mapPending', denied: 'mapDenied', available: 'mapAvailable', outside: 'mapOutside',
  };

  function locate() {
    setGeo('pending');
    if (!navigator.geolocation) { setGeo('denied'); return; }
    navigator.geolocation.getCurrentPosition(position => {
      const next = { lat: position.coords.latitude, lon: position.coords.longitude };
      setUser(next);
      setGeo(isInsideAtlas(next.lat, next.lon) ? 'available' : 'outside');
    }, () => setGeo('denied'), { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
  }

  function move(delta: Partial<Camera>) {
    setCamera(old => ({
      rotate: clamp(old.rotate + (delta.rotate ?? 0), -74, 18),
      tilt: clamp(old.tilt + (delta.tilt ?? 0), 34, 72),
      zoom: clamp(old.zoom + (delta.zoom ?? 0), 0.78, 1.42),
    }));
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    // A click on a pin must stay a click: capture would swallow the pointer
    // events the browser needs to turn this gesture into a click.
    if ((event.target as Element).closest('.atlas-pin')) return;
    drag.current = { x: event.clientX, y: event.clientY, rotate: camera.rotate, tilt: camera.tilt };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function dragMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    setCamera(old => ({
      ...old,
      rotate: clamp(drag.current!.rotate + dx * 0.22, -74, 18),
      tilt: clamp(drag.current!.tilt - dy * 0.18, 34, 72),
    }));
  }
  function endDrag() { drag.current = null; setDragging(false); }

  const stageStyle = {
    '--atlas-rotate': `${camera.rotate}deg`,
    '--atlas-tilt': `${camera.tilt}deg`,
    '--atlas-zoom': camera.zoom,
  } as CSSProperties;
  const categoryCounts = CATEGORIES.map(category => ({ category, count: model.points.filter(point => point.categoryId === category).length }));
  const onlineMissing = model.onlineOfferIds.length;

  return <section className="result-map atlas" aria-labelledby="map-title">
    <header className="atlas-header">
      <div className="atlas-heading">
        <p className="atlas-kicker"><span className="atlas-3d">3D</span> {t('mapShowing')}</p>
        <h2 id="map-title">{t('mapTitle')}</h2>
        <p className="atlas-lede">{t('mapHelp')}</p>
      </div>
      <div className="atlas-stats" role="group" aria-label={t('mapTitle')}>
        <span><strong>{model.points.length}</strong>{t('mapPointsLabel')}</span>
        <span><strong>{onlineMissing}</strong>{t('mapOnlineLabel')}</span>
        <span><strong>{categoryCounts.filter(item => item.count > 0).length}</strong>{t('mapCategoriesLabel')}</span>
      </div>
    </header>

    <div className="atlas-toolbar">
      <button type="button" className="button secondary atlas-geo" disabled={geo === 'pending'} onClick={locate}>
        <Icon name="locate" />{t('mapGeo')}
      </button>
      <div className="atlas-camera" role="group" aria-label={t('mapCamera')}>
        <button type="button" className="atlas-control" onClick={() => move({ rotate: 9 })} aria-label={t('mapRotateLeft')}><Icon name="rotate-left" /></button>
        <button type="button" className="atlas-control" onClick={() => move({ rotate: -9 })} aria-label={t('mapRotateRight')}><Icon name="rotate-right" /></button>
        <button type="button" className="atlas-control" onClick={() => move({ tilt: 7 })} aria-label={t('mapTiltUp')}><Icon name="tilt-up" /></button>
        <button type="button" className="atlas-control" onClick={() => move({ tilt: -7 })} aria-label={t('mapTiltDown')}><Icon name="tilt-down" /></button>
        <button type="button" className="atlas-control" onClick={() => move({ zoom: 0.12 })} aria-label={t('mapZoomIn')}><Icon name="zoom-in" /></button>
        <button type="button" className="atlas-control" onClick={() => move({ zoom: -0.12 })} aria-label={t('mapZoomOut')}><Icon name="zoom-out" /></button>
        <button type="button" className="atlas-control atlas-reset" onClick={() => setCamera(INITIAL_CAMERA)} aria-label={t('mapReset')}><Icon name="reset" /></button>
      </div>
    </div>
    {geoStatus[geo] && <p className="atlas-geo-status" role="status">{t(geoStatus[geo]!)}</p>}

    <div className={`atlas-stage${dragging ? ' is-dragging' : ''}`} style={stageStyle}
      onPointerDown={startDrag} onPointerMove={dragMove} onPointerUp={endDrag} onPointerCancel={endDrag} onPointerLeave={endDrag}
      role="group" aria-label={t('mapTitle')} data-points={model.points.length}>
      <div className="atlas-sky" aria-hidden="true"><span /><span /><span /></div>
      <div className="atlas-world">
        <div className="atlas-plane">
          <AtlasGround locale={locale} />
          <div className="atlas-scan" aria-hidden="true" />
          {model.points.map(point => {
            const position = projectPoint(point.lat, point.lon);
            return <span key={`shadow-${point.offerId}`} className="atlas-shadow" style={{ left: `${position.x}%`, top: `${position.y}%` }} aria-hidden="true" />;
          })}
          {model.points.map((point, index) => {
            const position = projectPoint(point.lat, point.lon);
            const active = selected === point.offerId;
            const district = point.districtId ? t(districtKeys[point.districtId]) : t('mapOnline');
            return <button key={point.offerId} type="button" className={`atlas-pin${active ? ' is-selected' : ''}`}
              style={{ left: `${position.x}%`, top: `${position.y}%`, animationDelay: `${index * 70}ms` }}
              data-category={point.categoryId} data-format={point.format}
              aria-label={t('mapPointAria', { index: index + 1, name: point.specialistName[locale], offer: point.offerTitle[locale], district })}
              aria-pressed={active} onClick={() => setSelected(point.offerId)}>
              <span className="atlas-pin-pulse" aria-hidden="true" />
              <span className="atlas-pin-stem" aria-hidden="true" />
              <span className="atlas-pin-head" aria-hidden="true"><Icon name="pin" /></span>
              <span className="atlas-pin-label">{point.specialistName[locale]}<small>{point.offerId} · {district}</small></span>
            </button>;
          })}
          {user && isInsideAtlas(user.lat, user.lon) && (() => {
            const position = projectPoint(user.lat, user.lon);
            return <div className="atlas-user" role="img" style={{ left: `${position.x}%`, top: `${position.y}%` }} aria-label={t('mapUserMarker')}>
              <span className="atlas-user-ring" aria-hidden="true" /><span className="atlas-user-dot" aria-hidden="true" />
              <span className="atlas-user-label">{t('mapUserMarker')}</span>
            </div>;
          })()}
        </div>
      </div>
      <div className="atlas-hud atlas-hud-top" aria-hidden="true"><span className="atlas-compass">N</span><span className="atlas-hud-line" /></div>
      <div className="atlas-hud atlas-hud-bottom"><p>{t('mapCameraHint')}</p><span className="atlas-hint-3d">drag · tilt · zoom</span></div>
    </div>

    <div className="atlas-lower">
      <div className="atlas-selected" aria-live="polite">
        <h3>{t('mapSelectedTitle')}</h3>
        {selectedPoint && selectedOffer ? <>
          <p className="atlas-selected-kicker">{t('mapPinIndex', { index: model.points.findIndex(point => point.offerId === selectedPoint.offerId) + 1 })} · {t(categoryKeys[selectedPoint.categoryId])}</p>
          <h4>{selectedPoint.specialistName[locale]}</h4>
          <p className="atlas-selected-offer">{selectedPoint.offerTitle[locale]}</p>
          <dl className="atlas-selected-facts">
            <div><dt>{t('district')}</dt><dd>{selectedPoint.districtId ? t(districtKeys[selectedPoint.districtId]) : t('mapOnline')}</dd></div>
            <div><dt>{t('format')}</dt><dd>{t(selectedPoint.format === 'unknown' ? 'unknown' : selectedPoint.format)}</dd></div>
            <div><dt>{t('priceLabel')}</dt><dd>{priceText(selectedPoint.priceKind, selectedPoint.priceAmountKzt, locale, t, t('demo'))}</dd></div>
            <div><dt>{t('mapDistanceLabel')}</dt><dd>{distance === null ? t('mapNoDistance') : t('mapDistance', { km: distance.toFixed(1) })}</dd></div>
          </dl>
          {distance !== null && <p className="help">{t('mapDistanceNote')}</p>}
          <Link className="button primary atlas-open" to={`/specialists/${selectedPoint.specialistId}?offer=${selectedPoint.offerId}`}>{t('mapOpenProfile')}<span aria-hidden="true"> →</span></Link>
        </> : <p className="atlas-empty-selection">{t('mapSelectedEmpty')}</p>}
      </div>
      <div className="atlas-side">
        <h3>{t('mapLegend')}</h3>
        <ul className="atlas-legend">{categoryCounts.map(item => <li key={item.category} data-empty={item.count === 0 || undefined}>
          <span className={`atlas-dot atlas-dot-${item.category.toLowerCase()}`} aria-hidden="true" />{t(categoryLabel[item.category])}<strong>{item.count}</strong>
        </li>)}</ul>
        <div className="atlas-online-card"><Icon name="cloud" /><div><strong>{t('mapOnlineCount', { count: onlineMissing })}</strong><p>{t('mapShowing')}</p></div></div>
        <p className="atlas-source">{t('mapSource')}: synthetic-map-v1 · {t('mapDate')}: {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date('2026-11-10T12:00:00+05:00'))}</p>
      </div>
    </div>

    <details className="atlas-list-wrap">
      <summary>{t('mapList')} · {model.points.length}</summary>
      {model.points.length === 0 ? <p>{t('mapNoPoints')}</p> : <ol className="atlas-list">
        {model.points.map(point => {
          const offer = catalog.offers.find(item => item.id === point.offerId);
          if (!offer) return null;
          return <li key={point.offerId} id={`map-${point.offerId}`} tabIndex={-1}>
            <span className="atlas-list-index">{model.points.indexOf(point) + 1}</span>
            <div>
              <Link to={`/specialists/${point.specialistId}?offer=${point.offerId}`}>{point.specialistName[locale]}</Link>
              <p>{point.offerTitle[locale]} · {t(categoryKeys[point.categoryId])} · {point.districtId ? t(districtKeys[point.districtId]) : t('mapOnline')}</p>
              <p>{priceText(point.priceKind, point.priceAmountKzt, locale, t, t('demo'))} · {t('mapSource')}: {point.source} · {t('mapDate')}: {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(point.checkedAt))}</p>
              <p>{t('mapAccess')}</p>
            </div>
            <button type="button" className="atlas-show" onClick={() => { setSelected(point.offerId); document.querySelector<HTMLElement>('.atlas-stage')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>{t('mapShowPoint')}</button>
          </li>;
        })}
      </ol>}
      {onlineMissing > 0 && <p className="help">{t('mapMissing')} {model.onlineOfferIds.join(', ')}</p>}
    </details>
  </section>;
}

/** Stylised, synthetic Almaty-like ground. Purely decorative. */
function AtlasGround({ locale }: { locale: string }) {
  const blocks = [
    [90, 80, 54, 34], [160, 120, 38, 52], [230, 70, 66, 30], [330, 96, 44, 60],
    [430, 70, 70, 38], [560, 90, 58, 44], [640, 130, 46, 30], [720, 78, 62, 46],
    [840, 110, 50, 34], [120, 210, 48, 38], [210, 250, 64, 28], [300, 205, 36, 54],
    [390, 270, 58, 36], [490, 220, 46, 60], [600, 250, 70, 32], [720, 220, 50, 54],
    [820, 250, 58, 36], [140, 330, 64, 30], [250, 390, 48, 46], [360, 340, 54, 28],
    [460, 410, 46, 38], [570, 360, 62, 46], [680, 400, 44, 30], [760, 340, 58, 40],
    [860, 390, 40, 54], [190, 470, 54, 34], [310, 490, 46, 28], [430, 500, 64, 34],
    [550, 470, 40, 50], [660, 500, 54, 32], [780, 480, 46, 38], [880, 500, 60, 30],
  ];
  return <svg className="atlas-svg" viewBox="0 0 1000 620" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="atlas-ground" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#0d3a35" /><stop offset=".55" stopColor="#11554e" /><stop offset="1" stopColor="#0a2b27" />
      </linearGradient>
      <linearGradient id="atlas-river" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5aa9a0" stopOpacity=".55" /><stop offset="1" stopColor="#2b7870" stopOpacity=".12" />
      </linearGradient>
      <pattern id="atlas-grid" width="50" height="50" patternUnits="userSpaceOnUse">
        <path d="M50 0H0V50" fill="none" stroke="#d8efe7" strokeOpacity=".10" strokeWidth="1" />
      </pattern>
      <radialGradient id="atlas-glow"><stop offset="0" stopColor="#7fd8c9" stopOpacity=".24" /><stop offset="1" stopColor="#7fd8c9" stopOpacity="0" /></radialGradient>
    </defs>
    <rect width="1000" height="620" fill="url(#atlas-ground)" />
    <rect width="1000" height="620" fill="url(#atlas-grid)" />
    <circle cx="520" cy="300" r="330" fill="url(#atlas-glow)" />
    <path className="atlas-river-line" d="M-20 500C180 470 230 360 370 330S620 350 760 250 940 180 1040 150" />
    <g className="atlas-districts">
      <path d="M40 60L350 40L420 240L250 390L40 330Z" />
      <path d="M420 240L350 40L680 50L720 280L520 390Z" />
      <path d="M720 50L960 70L980 300L720 280Z" />
      <path d="M520 390L720 280L980 300L940 570L600 590L430 500Z" />
      <path d="M40 330L250 390L430 500L380 600L40 590Z" />
    </g>
    <g className="atlas-roads">
      <path d="M40 180C210 170 330 190 520 180S820 150 980 180" />
      <path d="M70 340C250 320 380 340 540 320S800 300 970 330" />
      <path d="M150 50C170 220 150 380 190 590" />
      <path d="M360 50C380 210 360 400 420 590" />
      <path d="M600 60C580 220 610 390 580 590" />
      <path d="M820 70C800 240 840 410 800 590" />
      <path d="M40 490C240 470 390 500 560 480S820 450 980 490" />
    </g>
    <g className="atlas-blocks">{blocks.map(([x, y, w, h], index) => <rect key={index} x={x} y={y} width={w} height={h} rx="4" />)}</g>
    <g className="atlas-contours">
      <path d="M80 560C200 520 260 540 360 500S560 440 700 470 880 450 960 410" />
      <path d="M60 590C190 550 270 570 390 520S600 470 740 500 900 480 980 440" />
      <circle cx="520" cy="300" r="110" /><circle cx="520" cy="300" r="190" /><circle cx="520" cy="300" r="270" />
    </g>
    <g className="atlas-labels">
      <text x="170" y="190">BOSTANDYK</text>
      <text x="520" y="200">ALMALY</text>
      <text x="780" y="210">AUEZOV</text>
      <text x="620" y="470">MEDEU</text>
      <text x="470" y="330" className="atlas-label-center">{locale === 'kk' ? 'АЛМАТЫ' : 'АЛМАТЫ'}</text>
    </g>
  </svg>;
}
