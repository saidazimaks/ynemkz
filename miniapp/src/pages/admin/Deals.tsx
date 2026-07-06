import { useEffect, useState } from 'react';
import { Button, Cell, Input, List, Section, Spinner } from '@telegram-apps/telegram-ui';
import { api, type Partner } from '../../api';

interface Deal {
  deal_date: string;
  description: string | null;
  partner_id: number;
  name: string;
}

/** Календарь скидки дня: назначение партнёров на даты наперёд (раздел 3.5). */
export default function Deals() {
  const [deals, setDeals] = useState<Deal[] | undefined>(undefined);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerId, setPartnerId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api<Deal[]>('/admin/daily-deals').then(setDeals).catch(() => setDeals([]));
  useEffect(() => {
    load();
    api<Partner[]>('/catalog').then(setPartners).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    await api('/admin/daily-deals', {
      method: 'POST',
      body: JSON.stringify({
        partner_id: Number(partnerId),
        deal_date: date,
        description: description || null,
      }),
    }).catch(() => {});
    setBusy(false);
    setDescription('');
    load();
  };

  if (!deals) return <Spinner size="l" />;

  return (
    <List>
      <Section header="Назначить скидку дня">
        <div style={{ padding: '4px 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* native select — надёжнее в WebView, тема через telegram-ui переменные */}
          <select
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            style={{ padding: 10, borderRadius: 8, fontSize: 15,
                     background: 'var(--tgui--secondary_fill, #f0f0f0)',
                     color: 'var(--tgui--text_color, #000)', border: 'none' }}
          >
            <option value="">— выберите партнёра —</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name} (−{p.discount_free}%)</option>
            ))}
          </select>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input placeholder="Описание (необязательно)" value={description}
                 onChange={(e) => setDescription(e.target.value)} />
          <Button stretched loading={busy} disabled={!partnerId || !date} onClick={save}>
            Назначить
          </Button>
        </div>
      </Section>

      <Section header="Календарь (ближайшие)">
        {deals.length === 0 && <Cell subtitle="Назначьте партнёра на сегодня">Пусто</Cell>}
        {deals.map((d) => (
          <Cell key={d.deal_date}
                subtitle={d.description ?? ''}
                after={new Date(d.deal_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}>
            {d.name}
          </Cell>
        ))}
      </Section>
    </List>
  );
}
