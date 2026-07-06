import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Badge, Banner, Cell, Input, List, Section, Spinner } from '@telegram-apps/telegram-ui';
import { api, type DailyDeal, type Partner } from './../api';

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

  if (partners === null) return <Spinner size="l" />;

  return (
    <List>
      {deal && (
        <Banner
          type="section"
          header={`Скидка дня: ${deal.name}`}
          subheader={`−${deal.discount_free}% для всех · ${deal.description ?? ''}`}
          onClick={() => navigate(`/partners/${deal.id}`)}
        />
      )}

      <div style={{ padding: '8px 16px 0' }}>
        <Input placeholder="Поиск заведения" value={search}
               onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Section header="Категории">
        <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexWrap: 'wrap' }}>
          <Badge type="number" mode={category === null ? 'primary' : 'gray'}
                 onClick={() => setCategory(null)}>Все</Badge>
          {categories.map((c) => (
            <Badge key={c} type="number" mode={category === c ? 'primary' : 'gray'}
                   onClick={() => setCategory(c)}>{c}</Badge>
          ))}
        </div>
      </Section>

      <Section header="Партнёры (скидка по подписке)">
        {shown.map((p) => (
          <Cell
            key={p.id}
            before={<Avatar size={40} src={p.logo_url ?? undefined} acronym={p.name[0]} />}
            subtitle={`${p.address ?? ''}${p.work_hours ? ' · ' + p.work_hours : ''}`}
            after={<Badge type="number" mode="primary">−{p.discount_premium}%</Badge>}
            onClick={() => navigate(`/partners/${p.id}`)}
          >
            {p.name}
          </Cell>
        ))}
        {shown.length === 0 && <Cell subtitle="Каталог пока пуст">—</Cell>}
      </Section>
    </List>
  );
}
