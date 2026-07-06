import { useEffect, useState } from 'react';
import { Badge, Button, Cell, Input, List, Placeholder, Section, Spinner, Switch } from '@telegram-apps/telegram-ui';
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

  if (stats === undefined) return <Spinner size="l" />;
  if (stats === null)
    return <Placeholder header="Нет доступа" description="Кабинет доступен партнёрам клуба." />;

  const max = Math.max(...stats.by_day.map((d) => d.visits), 1);

  return (
    <List>
      {card && (
        <Section header="Моя карточка">
          <Cell subtitle={`${card.category ?? ''} · ${card.address ?? ''}`}
                after={<Badge type="number" mode="primary">−{card.discount_premium}%</Badge>}>
            {card.name}
          </Cell>
          <Cell subtitle="Карточка скрывается из каталога и карты"
                after={<Switch checked={card.is_paused}
                               onChange={(e) => togglePause(e.target.checked)} />}>
            Пауза («отпуск»)
          </Cell>
          <Cell subtitle="Изменение данных — через админа (кнопка «Помощь» в боте)">
            Скидка дня −{card.discount_free}% · подписчикам −{card.discount_premium}%
          </Cell>
        </Section>
      )}

      <Section header="Визиты">
        <Cell after={<b>{stats.today}</b>}>Сегодня</Cell>
        <Cell after={<b>{stats.week}</b>}>Неделя</Cell>
        <Cell after={<b>{stats.month}</b>} subtitle={`${stats.unique_month} уникальных`}>Месяц</Cell>
        <Cell after={<b>{stats.new_clients} / {stats.repeat_clients}</b>}
              subtitle="за последние 30 дней">
          Новые / повторные
        </Cell>
      </Section>

      {stats.by_day.length > 0 && (
        <Section header="Последние 30 дней">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80, padding: 16 }}>
            {stats.by_day.map((d) => (
              <div key={d.day} title={`${d.day}: ${d.visits}`}
                   style={{ flex: 1, background: 'var(--tgui--link_color, #2481cc)',
                            height: `${(d.visits / max) * 100}%`, borderRadius: 2 }} />
            ))}
          </div>
        </Section>
      )}

      <Section header="Ввести код клиента (фолбэк)">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Input placeholder="A7K2M9" value={code}
                 onChange={(e) => setCode(e.target.value)} />
          <Button stretched disabled={code.trim().length < 6} onClick={redeem}>Записать визит</Button>
          {result && <div>{result}</div>}
        </div>
      </Section>

      {feed.length > 0 && (
        <Section header="Последние активации">
          {feed.map((a, i) => (
            <Cell key={i}
                  subtitle={new Date(a.used_at).toLocaleString('ru-RU')}
                  after={`−${a.discount}%`}>
              {a.full_name ?? 'Клиент'}
            </Cell>
          ))}
        </Section>
      )}
    </List>
  );
}
