import { useEffect, useState } from 'react';
import { Button, Cell, Input, List, Placeholder, Section, Switch } from '@telegram-apps/telegram-ui';
import { api, ApiError } from './../api';
import { ErrorState, Loader } from './../hooks';

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
  is_owner: boolean;
}

interface Staff {
  user_id: number;
  full_name: string | null;
  username: string | null;
  added_at: string;
}

// Пределы «Моей скидки» — как в bot/services/partners.py (10–15, раздел 3.3)
const DISCOUNTS = [10, 11, 12, 13, 14, 15];

interface Activation {
  full_name: string | null;
  used_at: string;
  discount: number;
}

type StatsState = Stats | 'loading' | 'forbidden' | 'error';

export default function PartnerCabinet() {
  const [stats, setStats] = useState<StatsState>('loading');
  const [card, setCard] = useState<Card | null>(null);
  // undefined — лента грузится, null — не загрузилась
  const [feed, setFeed] = useState<Activation[] | null | undefined>(undefined);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [staffId, setStaffId] = useState('');
  const [staffNote, setStaffNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [staffBusy, setStaffBusy] = useState(false);
  const [discountNote, setDiscountNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => {
    api<Stats>('/partner/stats')
      .then(setStats)
      .catch((e: unknown) => {
        // 401/403 — не партнёр; остальное — сеть
        const forbidden = e instanceof ApiError && (e.status === 401 || e.status === 403);
        setStats(forbidden ? 'forbidden' : 'error');
      });
    api<Card>('/partner/me')
      .then((c) => {
        setCard(c);
        // Сотрудники видны и редактируются только владельцем
        if (c.is_owner) api<Staff[]>('/partner/staff').then(setStaff).catch(() => {});
      })
      .catch(() => {});
    api<Activation[]>('/partner/activations').then(setFeed).catch(() => setFeed(null));
  };
  useEffect(load, []);

  const redeem = async () => {
    setResult(null);
    setRedeeming(true);
    try {
      const r = await api<{ client_name: string | null }>('/partner/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      setResult({ ok: true, text: `Визит записан: ${r.client_name ?? 'клиент'}` });
      setCode('');
      load();
    } catch (e) {
      setResult({ ok: false, text: e instanceof ApiError ? String(e.detail) : 'Ошибка сети' });
    }
    setRedeeming(false);
  };

  const togglePause = async (paused: boolean) => {
    // Оптимистично; при ошибке сети возвращаем как было
    setCard((c) => (c ? { ...c, is_paused: paused } : c));
    try {
      await api('/partner/pause', { method: 'POST', body: JSON.stringify({ paused }) });
    } catch {
      setCard((c) => (c ? { ...c, is_paused: !paused } : c));
    }
  };

  const setDiscount = async (value: number) => {
    if (!card || value === card.discount_premium) return;
    const prev = card.discount_premium;
    setDiscountNote(null);
    setCard((c) => (c ? { ...c, discount_premium: value } : c)); // оптимистично
    try {
      await api('/partner/discount', { method: 'POST', body: JSON.stringify({ discount: value }) });
      setDiscountNote({ ok: true, text: `Скидка подписчикам теперь −${value}%` });
    } catch (e) {
      setCard((c) => (c ? { ...c, discount_premium: prev } : c)); // откат
      setDiscountNote({ ok: false, text: e instanceof ApiError ? String(e.detail) : 'Ошибка сети' });
    }
  };

  const addStaff = async () => {
    setStaffNote(null);
    setStaffBusy(true);
    try {
      await api('/partner/staff', {
        method: 'POST',
        body: JSON.stringify({ telegram_id: Number(staffId.trim()) }),
      });
      setStaffNote({ ok: true, text: 'Кассир добавлен — пинги активаций теперь приходят и ему' });
      setStaffId('');
      api<Staff[]>('/partner/staff').then(setStaff).catch(() => {});
    } catch (e) {
      setStaffNote({ ok: false, text: e instanceof ApiError ? String(e.detail) : 'Ошибка сети' });
    }
    setStaffBusy(false);
  };

  const removeStaff = async (userId: number) => {
    setStaffNote(null);
    try {
      await api(`/partner/staff/${userId}`, { method: 'DELETE' });
      setStaff((s) => s.filter((x) => x.user_id !== userId));
    } catch (e) {
      setStaffNote({ ok: false, text: e instanceof ApiError ? String(e.detail) : 'Ошибка сети' });
    }
  };

  if (stats === 'loading') return <Loader />;
  if (stats === 'error')
    return <ErrorState onRetry={() => { setStats('loading'); load(); }} />;
  if (stats === 'forbidden')
    return (
      <div className="vg-center">
        <Placeholder header="Нет доступа" description="Кабинет доступен партнёрам клуба." />
      </div>
    );

  const max = Math.max(...stats.by_day.map((d) => d.visits), 1);

  return (
    <div className="vg-page vg-stagger">
      {card && (
        <>
          <div className="vg-brand">
            <span className="vg-brand-name">{card.name}</span>
            <span className="vg-brand-city">{card.is_owner ? 'кабинет' : 'кабинет кассира'}</span>
          </div>
          {card.is_owner && (
            <div className="vg-card" style={{ cursor: 'default' }}>
              <div className="vg-card-body">
                <div className="vg-card-name">Пауза («отпуск»)</div>
                <div className="vg-card-meta">Карточка скрывается из каталога и карты</div>
              </div>
              <Switch checked={card.is_paused} onChange={(e) => togglePause(e.target.checked)} />
            </div>
          )}
        </>
      )}

      {card?.is_owner && (
        <>
          <div className="vg-h">Моя скидка подписчикам</div>
          <div className="vg-chips">
            {DISCOUNTS.map((d) => (
              <button key={d}
                      className={`vg-chip ${card.discount_premium === d ? 'is-on' : ''}`}
                      onClick={() => setDiscount(d)}>
                −{d}%
              </button>
            ))}
          </div>
          {discountNote && (
            <div className={`vg-note ${discountNote.ok ? 'is-ok' : 'is-err'}`}>
              {discountNote.text}
            </div>
          )}
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
        <Input placeholder="A7K2M9" value={code} maxLength={6}
               autoCapitalize="characters" autoCorrect="off"
               onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <Button stretched loading={redeeming} disabled={code.trim().length < 6} onClick={redeem}>
          Записать визит
        </Button>
        {result && (
          <div className={`vg-note ${result.ok ? 'is-ok' : 'is-err'}`}>{result.text}</div>
        )}
      </div>

      {card?.is_owner && (
        <>
          <div className="vg-h">Сотрудники</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {staff.length > 0 && (
              <List>
                <Section>
                  {staff.map((s) => (
                    <Cell key={s.user_id}
                          subtitle={s.username ? `@${s.username}` : `id ${s.user_id}`}
                          after={
                            <Button size="s" mode="plain" onClick={() => removeStaff(s.user_id)}>
                              Удалить
                            </Button>
                          }>
                      {s.full_name ?? 'Кассир'}
                    </Cell>
                  ))}
                </Section>
              </List>
            )}
            <Input placeholder="Telegram ID кассира" value={staffId}
                   inputMode="numeric"
                   onChange={(e) => setStaffId(e.target.value.replace(/\D/g, ''))} />
            <Button stretched loading={staffBusy} disabled={staffId.trim().length < 5}
                    onClick={addStaff}>
              Добавить кассира
            </Button>
            {staffNote && (
              <div className={`vg-note ${staffNote.ok ? 'is-ok' : 'is-err'}`}>{staffNote.text}</div>
            )}
            <div className="vg-empty" style={{ padding: '4px 2px' }}>
              Кассир будет получать пинги активаций и сможет гасить коды.
              Его ID — у @userinfobot; сначала кассир должен запустить нашего бота.
            </div>
          </div>
        </>
      )}

      <div className="vg-h">Последние активации</div>
      {feed === undefined ? (
        <div className="vg-skel vg-skel-card" />
      ) : feed === null ? (
        <div className="vg-empty">Не удалось загрузить активации</div>
      ) : feed.length === 0 ? (
        <div className="vg-empty">Пока нет активаций — они появятся здесь сразу после QR</div>
      ) : (
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
      )}
    </div>
  );
}
