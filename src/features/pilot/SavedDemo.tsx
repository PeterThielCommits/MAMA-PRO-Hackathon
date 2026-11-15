import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/AppState';
import {
  readSavedDemos, removeSavedDemo, savedDemoFromOffer, upsertSavedDemo, writeSavedDemos,
  type SavedDemo,
} from '../../domain/savedDemo';
import { translate } from '../../i18n/messages';
import { priceText } from '../../i18n/price';
import { PageTitle } from '../../ui/controls';

const words = (locale: 'ru' | 'kk') => (ru: string, kk: string) => locale === 'ru' ? ru : kk;

export function SaveDemo({ offerId }: { offerId: string }) {
  const { catalog, locale } = useApp();
  const [notice, setNotice] = useState<'saved' | 'failed' | null>(null);
  const s = words(locale);
  function save() {
    try {
      const row = savedDemoFromOffer(catalog, offerId, new Date().toISOString());
      writeSavedDemos(localStorage, upsertSavedDemo(readSavedDemos(localStorage), row));
      setNotice('saved');
    } catch { setNotice('failed'); }
  }
  return <section><button type="button" className="button secondary" onClick={save}>{s('Сохранить демокарточку офлайн', 'Демо карточканы офлайн сақтау')}</button>
    {notice && <p role="status">{notice === 'saved'
      ? s('Синтетическая карточка сохранена на устройстве.', 'Синтетикалық карточка құрылғыда сақталды.')
      : s('Сохранить не удалось. Проверьте доступ к хранилищу.', 'Сақтау мүмкін болмады. Сақтау орнына қолжетімділікті тексеріңіз.')}</p>}
    <Link to="/saved">{s('Сохранённые демокарточки', 'Сақталған демо карточкалар')}</Link></section>;
}

export function SavedDemo() {
  const { locale } = useApp();
  const [result, setResult] = useState<{ rows: SavedDemo[]; failed: boolean }>(() => {
    try { return { rows: readSavedDemos(localStorage), failed: false }; }
    catch { return { rows: [], failed: true }; }
  });
  const s = words(locale);
  // Catalog fact dates use Asia/Almaty; the runtime save instant stays local.
  const date = (iso: string, timeZone?: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(new Date(iso));
  function remove(offerId: string) {
    try {
      const rows = removeSavedDemo(readSavedDemos(localStorage), offerId);
      writeSavedDemos(localStorage, rows);
      setResult({ rows, failed: false });
    } catch { setResult(old => ({ ...old, failed: true })); }
  }
  return <div className="form-page"><PageTitle>{s('Сохранённые демокарточки', 'Сақталған демо карточкалар')}</PageTitle>
    <p>{s('Это явно сохранённые синтетические копии. Дата сохранения не подтверждает актуальность. Условия не обновляются автоматически. Приватный пилот здесь не хранится.',
      'Бұл арнайы сақталған синтетикалық көшірмелер. Сақтау күні өзектілікті растамайды. Шарттар автоматты жаңартылмайды. Құпия пилот мұнда сақталмайды.')}</p>
    {result.failed && <p role="alert">{s('Не удалось прочитать хранилище.', 'Сақтау орнын оқу мүмкін болмады.')}</p>}
    {!result.rows.length && <p>{s('Нет сохранённых карточек.', 'Сақталған карточкалар жоқ.')}</p>}
    {result.rows.map(row => <article className="pilot-card" key={row.id} data-testid="saved-card" data-offer-id={row.id} data-saved-at={row.savedAt} data-checked-at={row.checkedAt ?? ''}>
      <h2>{row.name[locale]}</h2><p>{row.title[locale]}</p>
      <p>{priceText(row.priceKind, row.price, locale, (key, values) => translate(locale, key, values))}</p>
      <p>{s('Подтверждение цены', 'Бағаны растау')}: {row.checkedAt ? date(row.checkedAt, 'Asia/Almaty') : s('Неизвестно', 'Белгісіз')}</p>
      <p>{s('Сохранено на устройстве', 'Құрылғыда сақталды')}: {date(row.savedAt)}</p>
      <button className="button secondary" onClick={() => remove(row.id)}>{s('Удалить копию', 'Көшірмені жою')}</button>
    </article>)}
    <Link to="/specialists">{s('В каталог', 'Каталогқа')}</Link></div>;
}
