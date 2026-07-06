import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Spinner } from '@telegram-apps/telegram-ui';
import { api, type DailyDeal, type Partner } from './../api';

function Logo({ src, name }: { src: string | null; name: string }) {
  return src
    ? <img className="vg-logo" src={src} alt="" />
    : <div className="vg-logo">{name[0]}</div>;
}

export default function Home() {
  const navigate = useNavigate();
  const [deal, setDeal] = useState<DailyDeal | null>(null);
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api<DailyDeal | null>('/daily-deal').then(setDeal).catch(() => {});
    api<Partner[]>('/catalog').then(setPartners).catch(() => setPartners([]));
  }, []);

  const categories = useMemo(
    () => [...new Set((partners ?? []).map((p) => p.category ?? 'Другое'))],
    [partners],
  );
  const shown = (partners ?? []).filter(
    (p) =>
      (!category || (p.category ?? 'Другое') === category) &&
      (!search || p.name.toLowerCase().includes(search.toLowerCase())),
  );

  if (partners === null) return <div className="vg-loader"><Spinner size="l" /></div>;

  return (
    <div className="vg-page vg-stagger">
      <div className="vg-brand">
        <span className="vg-brand-name">Выгодный Город</span>
        <span className="vg-brand-city">Экибастуз</span>
      </div>

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
        {shown.length === 0 && <div className="vg-empty">Ничего не нашлось</div>}
      </div>
    </div>
  );
}
