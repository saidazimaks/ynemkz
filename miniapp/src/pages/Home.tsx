import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@telegram-apps/telegram-ui';
import { type DailyDeal, type Partner } from './../api';
import { ErrorState, useCachedApi } from './../hooks';

function Logo({ src, name }: { src: string | null; name: string }) {
  // lazy — логотипы ниже экрана не качаются, пока не доскроллили;
  // width/height — браузер резервирует место до загрузки CSS/картинки
  return src
    ? <img className="vg-logo" src={src} alt="" width={46} height={46}
           loading="lazy" decoding="async" />
    : <div className="vg-logo">{name[0]}</div>;
}

export default function Home() {
  const navigate = useNavigate();
  const [deal] = useCachedApi<DailyDeal | null>('/daily-deal');
  const [partners, retryPartners] = useCachedApi<Partner[]>('/catalog');
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const categories = useMemo(
    () => [...new Set((partners ?? []).map((p) => p.category ?? 'Другое'))],
    [partners],
  );
  const shown = (partners ?? []).filter(
    (p) =>
      (!category || (p.category ?? 'Другое') === category) &&
      (!search || p.name.toLowerCase().includes(search.toLowerCase())),
  );

  const brand = (
    <div className="vg-brand">
      <span className="vg-brand-name">Ynem</span>
      <span className="vg-brand-city">Экибастуз</span>
    </div>
  );

  if (partners === undefined)
    return (
      <div className="vg-page">
        {brand}
        <div className="vg-skel vg-skel-hero" />
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="vg-skel vg-skel-card" />)}
      </div>
    );

  // Каталог не загрузился и кэша нет — честная ошибка с повтором
  if (partners === null)
    return (
      <div className="vg-page">
        {brand}
        <ErrorState onRetry={retryPartners} />
      </div>
    );

  return (
    <div className="vg-page vg-stagger">
      {brand}

      {deal && (
        <div className="vg-hero" onClick={() => navigate(`/partners/${deal.id}`)}>
          <div className="vg-hero-label">Скидка дня · для всех</div>
          <div className="vg-hero-row">
            <div className="vg-hero-name">{deal.name}</div>
            <div className="vg-hero-pct">−{deal.discount_free}%</div>
          </div>
          {deal.description && <div className="vg-hero-desc">{deal.description}</div>}
          <div className="vg-hero-meta">
            {deal.address ? `${deal.address} · ` : ''}сканируйте QR на кассе
          </div>
        </div>
      )}

      <div className="vg-h">Каталог</div>

      <Input placeholder="Поиск заведения" value={search}
             onChange={(e) => setSearch(e.target.value)} />

      <div className="vg-chips" style={{ marginTop: 10 }}>
        <button className={`vg-chip ${category === null ? 'is-on' : ''}`}
                onClick={() => setCategory(null)}>Все</button>
        {categories.map((c) => (
          <button key={c} className={`vg-chip ${category === c ? 'is-on' : ''}`}
                  onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>

      <div style={{ marginTop: 6 }}>
        {shown.map((p) => (
          <div key={p.id} className="vg-card" onClick={() => navigate(`/partners/${p.id}`)}>
            <Logo src={p.logo_url} name={p.name} />
            <div className="vg-card-body">
              <div className="vg-card-name">{p.name}</div>
              <div className="vg-card-meta">
                {p.address ?? ''}{p.work_hours ? ` · ${p.work_hours}` : ''}
              </div>
            </div>
            <div className="vg-pct">−{p.discount_premium}%</div>
          </div>
        ))}
        {shown.length === 0 && (
          <div className="vg-empty">
            {partners.length === 0
              ? 'Каталог пока пуст — партнёры скоро появятся'
              : 'Ничего не нашлось. Попробуйте другой запрос или категорию.'}
          </div>
        )}
      </div>
    </div>
  );
}
