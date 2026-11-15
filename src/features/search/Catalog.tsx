import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/AppState';
import { CATEGORIES, QUERY_MAX, districtApplies, emptySearchInput } from '../../domain/contracts';
import { isFresh } from '../../domain/SearchService';
import { FRESHNESS_POLICY } from '../../domain/freshness';
import { verificationStatus } from '../../domain/profile';
import { categoryKeys, type MessageKey } from '../../i18n/messages';
import { Bird, DemoNotice, Icon, PageTitle, type IconName } from '../../ui/controls';
import { CompareTray } from './CompareTray';
import { conditions } from './conditions';
import { Filters } from './Filters';
import { ResultMap } from './ResultMap';
import { matchTierKey, OfferCard } from './OfferCard';

const SORTS = ['relevant', 'price', 'trust', 'district'] as const;
type SortMode = typeof SORTS[number];
const sortLabels: Record<SortMode, MessageKey> = {
  relevant: 'sortRelevant', price: 'sortPrice', trust: 'sortTrust', district: 'sortDistrict',
};
const sortIcons: Record<SortMode, IconName> = {
  relevant: 'sort-relevant', price: 'sort-price', trust: 'sort-trust', district: 'sort-district',
};
const sortDeck: Record<SortMode, MessageKey> = {
  relevant: 'sortDeckRelevant', price: 'sortDeckPrice', trust: 'sortDeckTrust', district: 'sortDeckDistrict',
};

export function Catalog() {
  const { input, update, setBudgetDraft, service, locale, catalog, catalogView, setCatalogView, t } = useApp();
  const [mapVisible, setMapVisible] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [retryCount, retry] = useState(0);
  // Local synchronous filtering has no request race or artificial loading delay.
  // Counts, cards and explanations all come from this single result snapshot.
  // Memoized per input (audit performance note): Retry still recomputes.
  const result = useMemo(() => {
    try { return service.search(input); } catch { return null; /* Never fall back to unfiltered cards. */ }
  }, [service, input, retryCount]);
  const chips = result ? conditions(result.appliedInputSummary, t, locale) : [];
  const sortIndex = SORTS.indexOf(input.sort);

  // A living explanation of the current order: numbers come from the same
  // result snapshot, so the deck can never promise a different count.
  const insight = useMemo(() => {
    if (!result) return null;
    const selectedOffers = result.items.map(item => catalog.offers.find(offer => offer.id === item.selectedOfferId)).filter((offer): offer is NonNullable<typeof offer> => !!offer);
    if (input.sort === 'relevant') {
      if (result.mode === 'neutral') return { text: t('sortSummaryNeutral', { count: result.specialistCount }) };
      return { text: t('sortSummaryRelevant') };
    }
    if (input.sort === 'price') {
      const priced = selectedOffers.filter(offer => (offer.priceKind === 'exact' || offer.priceKind === 'free')
        && offer.priceAmountKzt !== null && isFresh(offer.priceConfirmedAt, new Date(catalog.demoClock), FRESHNESS_POLICY.days.price));
      if (!priced.length) return { text: t('sortSummaryPriceUnknown') };
      const min = Math.min(...priced.map(offer => offer.priceAmountKzt!));
      return { text: t('sortSummaryPrice', { price: min === 0 ? t('priceFree') : `${new Intl.NumberFormat(locale).format(min)} ₸` }) };
    }
    if (input.sort === 'trust') {
      const confirmed = new Set(result.items.filter(item => {
        const specialist = catalog.specialists.find(s => s.id === item.specialistId);
        return specialist?.verificationFacts.some(fact => fact.scope !== 'offer_data'
          && ['SOURCE_CONFIRMED', 'DOCUMENT_SEEN'].includes(verificationStatus(fact, catalog.demoClock)));
      }).map(item => item.specialistId));
      return { text: t('sortSummaryTrust', { count: confirmed.size }) };
    }
    if (districtApplies(input) && input.districtId) {
      const count = result.items.filter(item => {
        const offer = catalog.offers.find(o => o.id === item.selectedOfferId);
        return offer?.districtId === input.districtId;
      }).length;
      return { text: t('sortSummaryDistrict', { count }) };
    }
    return { text: t('sortSummaryNeutral', { count: result.specialistCount }) };
  }, [result, input, catalog, locale, t]);

  function reset() {
    update(emptySearchInput());
    setBudgetDraft('');
    setCatalogView(old => ({ ...old, showIncomplete: false }));
  }
  return <div className="catalog-page">
    <PageTitle intro={t('resultsHelp')}>{t('results')}</PageTitle>
    <div className="catalog-hero">
      <div>
        <p className="eyebrow"><Icon name="spark" /> {t('catalogKicker')}</p>
        <p className="catalog-summary">{t('catalogSummary')}</p>
        {result && <p className="catalog-live-count" role="status" aria-atomic="true" data-testid="search-count">{t('count', { specialists: result.specialistCount, offers: result.eligibleOfferCount })}</p>}
      </div>
      <button type="button" className={`atlas-teaser${mapVisible ? ' is-open' : ''}`} aria-expanded={mapVisible} onClick={() => setMapVisible(!mapVisible)}>
        <span className="atlas-teaser-art" aria-hidden="true"><Icon name="layers" /><span className="atlas-teaser-ring" /></span>
        <span><strong>{t(mapVisible ? 'hideMap' : 'showMap')}</strong><small>{t('mapInlineHint')}</small></span>
        <Icon name="arrow" />
      </button>
    </div>
    <DemoNotice />
    <div className="catalog-toolbar">
      <div className="field"><label htmlFor="query">{t('nameSearch')}</label><p className="help" id="query-help">{t('searchHelp')}</p>
        <div className="input-wrap"><Icon name="search" />
          <input type="search" id="query" maxLength={QUERY_MAX} value={input.query} aria-describedby="query-help" autoComplete="off"
            onChange={event => update({ query: event.target.value.normalize('NFKC').slice(0, QUERY_MAX) })} />
        </div>
      </div>
      <div className="field"><label htmlFor="catalog-category">{t('category')}</label><p className="help" id="catalog-category-help">{t('categoryHelp')}</p>
        <select id="catalog-category" value={input.categoryIds.length === 1 ? input.categoryIds[0] : ''} aria-describedby="catalog-category-help" onChange={event => {
          const id = CATEGORIES.find(id => id === event.target.value);
          update({ categoryIds: id ? [id] : [] });
        }}>
          <option value="">{input.categoryIds.length > 1 ? input.categoryIds.map(id => t(categoryKeys[id])).join(', ') : t('allCategories')}</option>
          {CATEGORIES.map(id => <option key={id} value={id}>{t(categoryKeys[id])}</option>)}
        </select>
      </div>
    </div>
    <div className="catalog-actions"><button type="button" id="filters-open" className="button primary" aria-haspopup="dialog" onClick={() => setFiltersOpen(true)}><Icon name="sliders" />{t('filters')}</button>
      <Link className="button secondary" to="/route/review">{t('reviewTitle')}</Link>
      <button type="button" className="button text-button" onClick={reset}>{t('resetAll')}</button>
    </div>
    {chips.length > 0 && <section className="active-conditions" aria-labelledby="active-title"><h2 id="active-title">{t('activeConditions')}</h2><ul className="condition-chips">
      {chips.map(chip => <li key={chip.id}><button type="button" className="condition-chip" data-condition={chip.id} aria-label={t('removeCondition', { condition: chip.label })} onClick={() => {
        update(chip.patch);
        if ('budgetKzt' in chip.patch) setBudgetDraft('');
        document.getElementById('filters-open')?.focus();
      }}>{chip.label}<span aria-hidden="true"> ×</span></button></li>)}
    </ul></section>}
    <div className="result-heading">
      <Bird pose="search" small />
      <fieldset className="field sort-field">
        <legend>{t('sort')}</legend>
        <div className="segmented segmented-4" style={{ '--sort-index': sortIndex } as CSSProperties}>
          <span className="sort-glider" aria-hidden="true" />
          {SORTS.map(value => <label className="segment" key={value}>
            <input type="radio" name="sort" value={value} checked={input.sort === value} onChange={() => update({ sort: value })} />
            <span><Icon name={sortIcons[value]} />{t(sortLabels[value])}</span>
          </label>)}
        </div>
      </fieldset>
    </div>
    <section className={`sort-deck sort-${input.sort}`} aria-live="polite" aria-labelledby="sort-deck-title">
      <div className="sort-deck-icon" aria-hidden="true"><Icon name={sortIcons[input.sort]} /></div>
      <div className="sort-deck-copy">
        <h2 id="sort-deck-title">{t('sortDeckTitle')}</h2>
        <p>{t(input.sort === 'district' && !(districtApplies(input) && input.districtId) ? 'sortDeckNeutral' : sortDeck[input.sort])}</p>
        {insight && <p className="sort-insight">{insight.text}</p>}
      </div>
      {result && result.items[0] && <div className="sort-winner">
        <span>{t('sortInsightTop')}</span>
        <strong>{catalog.specialists.find(s => s.id === result.items[0].specialistId)?.displayName[locale]}</strong>
        <small>{result.items[0].score === null ? t('sortInsightTotal', { count: result.specialistCount }) : t(matchTierKey(result.items[0].score))}</small>
      </div>}
    </section>
    {input.sort === 'price' && <p className="help info">{t('priceSortHelp')}</p>}
    {input.sort === 'trust' && <p className="help info">{t('trustSortHelp')}</p>}
    {input.sort === 'district' && <p className="help info">{t(districtApplies(input) && input.districtId ? 'districtSortHelp' : 'districtSortInactive')}</p>}
    {!result && <section className="count-panel" role="alert"><p>{t('searchFailed')}</p><button type="button" className="button primary" onClick={() => retry(value => value + 1)}>{t('retry')}</button></section>}
    {result && <>
      {result.items.length > 0 && result.items.every(item => item.score === null) && <p className="help">{t('neutral')}</p>}
      {result.specialistCount === 0 && <section className="count-panel" aria-labelledby="empty-title"><h2 id="empty-title">{t('emptyExact')}</h2>
        <p>{t('emptyExactHelp')}</p>
        {input.query && <><p>{t('noTextMatch')}</p><button type="button" className="button secondary" onClick={() => update({ query: '' })}>{t('clearSearch')}</button></>}
        <p>{t('emptyPreferences')}</p>
        <button type="button" className="button primary" onClick={() => setFiltersOpen(true)}>{t('editPreferences')}</button>
        <button type="button" className="button text-button" onClick={reset}>{t('resetAll')}</button>
      </section>}
      {mapVisible && <ResultMap result={result} />}
      <div className="catalog-grid" data-sort={input.sort}>{result.items.map((item, index) => <OfferCard key={`${input.sort}-${item.specialistId}`} item={item} rank={index + 1} total={result.items.length} />)}</div>
      {result.incompleteSpecialistCount > 0 && <section className="incomplete-section" aria-labelledby="incomplete-title">
        <h2 id="incomplete-title">{t('incompleteTitle')}</h2><p>{t('incomplete', { count: result.incompleteSpecialistCount })}</p>
        <button className="button secondary" type="button" aria-expanded={catalogView.showIncomplete} aria-controls="incomplete-results"
          onClick={() => setCatalogView(old => ({ ...old, showIncomplete: !old.showIncomplete }))}>{t(catalogView.showIncomplete ? 'hideIncomplete' : 'showIncomplete', { count: result.incompleteSpecialistCount })}</button>
        {catalogView.showIncomplete && <div id="incomplete-results"><p className="help">{t('incompleteHelp')}</p>
          <p data-testid="incomplete-count">{t('incompleteCount', { specialists: result.incompleteSpecialistCount, offers: result.incompleteOfferCount })}</p>
          <div className="catalog-grid">{result.incompleteItems.map((item, index) => <OfferCard key={item.specialistId} item={item} rank={index + 1} total={result.incompleteItems.length} />)}</div>
        </div>}
      </section>}
    </>}
    <CompareTray />
    {filtersOpen && <Filters onClose={() => setFiltersOpen(false)} />}
  </div>;
}
