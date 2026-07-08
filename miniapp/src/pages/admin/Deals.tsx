import { useEffect, useState } from 'react';
import { Button, Cell, Input, List, Section } from '@telegram-apps/telegram-ui';
import { api, type Partner } from '../../api';
import { ErrorState, Loader } from '../../hooks';

interface Deal {
  deal_date: string;
  description: string | null;
  partner_id: number;
  name: string;
}

/** Календарь скидки дня: назначение партнёров на даты наперёд (раздел 3.5). */
export default function Deals() {
  // undefined — грузим, null — ошибка сети
  const [deals, setDeals] = useState<Deal[] | null | undefined>(undefined);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerId, setPartnerId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => api<Deal[]>('/admin/daily-deals').then(setDeals).catch(() => setDeals(null));
  useEffect(() => {
    load();
    api<Partner[]>('/catalog').then(setPartners).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      await api('/admin/daily-deals', {
        method: 'POST',
        body: JSON.stringify({
          partner_id: Number(partnerId),
          deal_date: date,
          description: description || null,
        }),
      });
      setNote({ ok: true, text: 'Скидка дня назначена' });
      setDescription('');
      load();
    } catch {
      setNote({ ok: false, text: 'Не удалось сохранить — проверьте связь' });
    }
    setBusy(false);
  };

  if (deals === undefined) return <Loader />;
  if (deals === null)
    return <ErrorState onRetry={() => { setDeals(undefined); load(); }} />;

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
          {note && <div className={`vg-note ${note.ok ? 'is-ok' : 'is-err'}`}>{note.text}</div>}
        </div>
      </Section>

      <Section header="Календарь (ближайшие)">
        {deals.length === 0 && (
          <div className="vg-empty">Календарь пуст — назначьте партнёра на сегодня</div>
        )}
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
