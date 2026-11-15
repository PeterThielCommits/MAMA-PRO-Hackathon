import { Link } from 'react-router-dom';
import { useApp } from '../app/AppState';
import { Bird, Icon, PageTitle } from '../ui/controls';

export function Home() {
  const { step, t, catalog } = useApp();
  const specialists = catalog.specialists.filter(specialist => specialist.publicationStatus === 'published').length;
  const offers = catalog.offers.filter(offer => offer.publicationStatus === 'published').length;
  return <>
    <section className="hero hero-rich">
      <div className="hero-copy">
        <p className="eyebrow"><Icon name="spark" /> {t('tagline')}</p>
        <PageTitle intro={t('homeSubtitle')}>{t('homeTitle')}</PageTitle>
        <div className="home-actions">
          <Link className="button primary" to="/route" state={{ step }}>{t('guide')}<span aria-hidden="true"> →</span></Link>
          <Link className="button secondary" to="/specialists"><Icon name="layers" />{t('catalog')}</Link>
        </div>
        <p className="help">{t('noRegistration')}</p>
        <ul className="hero-stats" aria-label={t('catalog')}>
          <li><strong>{specialists}</strong><span>{t('homeStatsSpecialists')}</span></li>
          <li><strong>{offers}</strong><span>{t('homeStatsOffers')}</span></li>
          <li><strong>3D</strong><span>{t('homeStatsMap')}</span></li>
          <li><strong>0</strong><span>{t('homeStatsRegistration')}</span></li>
        </ul>
      </div>
      <div className="hero-visual">
        <HomeAtlas />
        <aside className="welcome-card"><Bird /><p>{t('welcome')}</p><span>Қарлығаш</span></aside>
      </div>
    </section>
    <section className="trust-strip" aria-labelledby="trust-strip-title">
      <div className="trust-strip-head"><h2 id="trust-strip-title">{t('trustStripTitle')}</h2><p>{t('trustStripHelp')}</p></div>
      <ul>
        <li><span className="trust-icon"><Icon name="shield" /></span><span>{t('homeTrust1')}</span></li>
        <li><span className="trust-icon"><Icon name="check" /></span><span>{t('homeTrust2')}</span></li>
        <li><span className="trust-icon"><Icon name="heart" /></span><span>{t('homeTrust3')}</span></li>
      </ul>
    </section>
    <section className="home-steps-section" aria-labelledby="home-steps-title">
      <div className="section-head"><h2 id="home-steps-title">{t('homeStepsTitle')}</h2><p>{t('homeStepsHelp')}</p></div>
      <ol className="home-steps">
        {(['1', '2', '3'] as const).map((number, index) => <li key={number}>
          <span className="step-number">0{number}</span>
          <h2>{t((['homeStep1', 'homeStep2', 'homeStep3'] as const)[index])}</h2>
          <p>{t((['homeStep1Help', 'homeStep2Help', 'homeStep3Help'] as const)[index])}</p>
        </li>)}
      </ol>
    </section>
    <section className="demo-explanation"><span className="badge">{t('demo')}</span><div><h2>{t('demoNotice')}</h2><p>{t('demoHelp')}</p></div></section>
  </>;
}

/** Decorative miniature of the 3D atlas: no data, no interaction, aria-hidden. */
function HomeAtlas() {
  const { t } = useApp();
  return <div className="home-atlas" aria-hidden="true">
    <div className="home-atlas-head"><span className="atlas-3d">3D</span><h2>{t('heroPreviewTitle')}</h2><p>{t('heroPreviewHelp')}</p></div>
    <div className="home-atlas-stage">
      <div className="home-atlas-plane">
        <span className="home-atlas-river" />
        <span className="home-atlas-road home-atlas-road-a" />
        <span className="home-atlas-road home-atlas-road-b" />
        <span className="home-atlas-block home-atlas-block-a" />
        <span className="home-atlas-block home-atlas-block-b" />
        <span className="home-atlas-block home-atlas-block-c" />
        {[[22, 62], [48, 38], [66, 58], [78, 30], [38, 76]].map(([x, y], index) => <span key={index} className={`home-pin home-pin-${index + 1}`} style={{ left: `${x}%`, top: `${y}%` }}>
          <i /><b /><em />
        </span>)}
      </div>
      <span className="home-atlas-orbit" />
      <span className="home-atlas-scan" />
    </div>
    <div className="home-atlas-foot"><span><Icon name="pin" /> {t('homeStatsMap')}</span><span className="home-atlas-pulse" /></div>
  </div>;
}
