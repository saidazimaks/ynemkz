import { useEffect, useState } from 'react';
import { Button, Cell, Input, List, Placeholder, Section, Spinner, Switch } from '@telegram-apps/telegram-ui';
import { api, ApiError } from './../api';

interface Stats {
  today: number;
  week: number;
  month: number;
  unique_month: number;
  new_clients: number;
  repeat_clients: number;
  by_day: { day: string; visits: number }[];
}

interface Card {
  id: number;
  name: string;
  category: string | null;
  address: string | null;
  work_hours: string | null;
  discount_free: number;
  discount_premium: number;
  is_paused: boolean;
}

interface Activation {
  full_name: string | null;
  used_at: string;
  discount: number;
}

export default function PartnerCabinet() {
  const [stats, setStats] = useState<Stats | null | undefined>(undefined);
  const [card, setCard] = useState<Card | null>(null);
  const [feed, setFeed] = useState<Activation[]>([]);
  const [code, setCode] = useState('');
  const [result, setResult] = useState('');

  const load = () => {
    api<Stats>('/partner/stats').then(setStats).catch(() => setStats(null));
    api<Card>('/partner/me').then(setCard).catch(() => {});
    api<Activation[]>('/partner/activations').then(setFeed).catch(() => {});
  };
  useEffect(load, []);

  const redeem = async () => {
    setResult('');
    try {
      const r = await api<{ client_name: string | null }>('/partner/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      setResult(`Визит записан: ${r.client_name ?? 'клиент'}`);
      setCode('');
      load();
    } catch (e) {
      setResult(e instanceof ApiError ? String(e.detail) : 'Ошибка сети');
    }
  };

  const togglePause = async (paused: boolean) => {
    await api('/partner/pause', { method: 'POST', body: JSON.stringify({ paused }) }).catch(() => {});
    setCard(card ? { ...card, is_paused: paused } : card);
  };

  if (stats === undefined) return <div className="vg-loader"><Spinner size="l" /></div>;
  if (stats === null)
    return <Placeholder header="Нет доступа" description="Кабинет доступен партнёрам клуба." />;

  const max = Math.max(...stats.by_day.map((d) => d.visits), 1);

  return (
    <div className="vg-page vg-stagger">
      {card && (
        <>
          <div className="vg-brand">
            <span className="vg-brand-name">{card.name}</span>
            <span className="vg-brand-city">кабинет</span>
          </div>
          <div className="vg-card" style={{ cursor: 'default' }}>
            <div className="vg-card-body">
              <div className="vg-card-name">Пауза («отпуск»)</div>
              <div className="vg-card-meta">Карточка скрывается из каталога и карты</div>
            </div>
            <Switch checked={card.is_paused} onChange={(e) => togglePause(e.target.checked)} />
          </div>
        </>
      )}

      <div className="vg-h">Визиты</div>
      <div className="vg-stat-grid">
        <div className="vg-stat">
          <div className="vg-stat-num" style={{ color: 'var(--vg-accent)' }}>{stats.today}</div>
          <div className="vg-stat-cap">сегодня</div>
        </div>
        <div className="vg-stat">
          <div className="vg-stat-num">{stats.week}</div>
          <div className="vg-stat-cap">за неделю</div>
        </div>
        <div className="vg-stat">
          <div className="vg-stat-num">{stats.month}</div>
          <div className="vg-stat-cap">за месяц · {stats.unique_month} уникальных</div>
        </div>
        <div className="vg-stat">
          <div className="vg-stat-num">{stats.new_clients}/{stats.repeat_clients}</div>
          <div className="vg-stat-cap">новые / повторные, 30 дней</div>
        </div>
      </div>

      {stats.by_day.length > 0 && (
        <>
          <div className="vg-h">Последние 30 дней</div>
          <div className="vg-bars">
            {stats.by_day.map((d) => (
              <div key={d.day} title={`${d.day}: ${d.visits}`}
                   style={{ height: `${(d.visits / max) * 100}%` }} />
            ))}
          </div>
        </>
      )}

      <div className="vg-h">Код клиента (фолбэк)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Input placeholder="A7K2M9" value={code}
               onChange={(e) => setCode(e.target.value)} />
        <Button stretched disabled={code.trim().length < 6} onClick={redeem}>Записать визит</Button>
        {result && <div style={{ textAlign: 'center', fontSize: 14 }}>{result}</div>}
      </div>

      {feed.length > 0 && (
        <>
          <div className="vg-h">Последние активации</div>
          <List>
            <Section>
              {feed.map((a, i) => (
                <Cell key={i}
                      subtitle={new Date(a.used_at).toLocaleString('ru-RU')}
                      after={<span className="vg-pct">−{a.discount}%</span>}>
                  {a.full_name ?? 'Клиент'}
                </Cell>
              ))}
            </Section>
          </List>
        </>
      )}
    </div>
  );
}
