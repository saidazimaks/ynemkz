import { useEffect, useState } from 'react';
import { Button, Cell, Image, List, Placeholder, Section } from '@telegram-apps/telegram-ui';
import { api, ApiError } from '../../api';
import { ErrorState, Loader } from '../../hooks';

interface Receipt {
  id: number;
  amount: number;
  receipt_url: string | null;
  created_at: string;
  full_name: string | null;
  username: string | null;
  phone: string | null;
}

interface AdminStats {
  users_total: number; users_today: number;
  subs_active: number; subs_pending: number;
  visits_today: number; visits_month: number;
}

type ReceiptsState = Receipt[] | 'loading' | 'forbidden' | 'error';

export default function Overview() {
  const [receipts, setReceipts] = useState<ReceiptsState>('loading');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [decidingId, setDecidingId] = useState<number | null>(null);

  const load = () => {
    api<Receipt[]>('/admin/receipts')
      .then(setReceipts)
      .catch((e: unknown) => {
        const forbidden = e instanceof ApiError && (e.status === 401 || e.status === 403);
        setReceipts(forbidden ? 'forbidden' : 'error');
      });
    api<AdminStats>('/admin/stats').then(setStats).catch(() => {});
  };
  useEffect(load, []);

  const decide = async (id: number, approve: boolean) => {
    setDecidingId(id); // защита от двойного тапа
    await api(`/admin/receipts/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({ approve }),
    }).catch(() => {});
    setDecidingId(null);
    load();
  };

  if (receipts === 'loading') return <Loader />;
  if (receipts === 'error')
    return <ErrorState onRetry={() => { setReceipts('loading'); load(); }} />;
  if (receipts === 'forbidden')
    return (
      <div className="vg-center">
        <Placeholder header="Нет доступа" description="Раздел только для админов." />
      </div>
    );

  const conversion = stats && stats.users_total
    ? Math.round((stats.subs_active / stats.users_total) * 1000) / 10 : 0;

  return (
    <List>
      {stats && (
        <div className="vg-stat-grid" style={{ padding: '0 16px' }}>
          <div className="vg-stat">
            <div className="vg-stat-num">{stats.users_total}</div>
            <div className="vg-stat-cap">пользователей · +{stats.users_today} сегодня</div>
          </div>
          <div className="vg-stat">
            <div className="vg-stat-num" style={{ color: 'var(--vg-accent)' }}>{stats.subs_active}</div>
            <div className="vg-stat-cap">подписок · конверсия {conversion}%</div>
          </div>
          <div className="vg-stat">
            <div className="vg-stat-num">{stats.visits_today}</div>
            <div className="vg-stat-cap">визитов сегодня</div>
          </div>
          <div className="vg-stat">
            <div className="vg-stat-num">{stats.visits_month}</div>
            <div className="vg-stat-cap">визитов за месяц</div>
          </div>
        </div>
      )}

      <Section header={`Очередь чеков (${receipts.length})`}>
        {receipts.length === 0 && (
          <div className="vg-empty">Очередь пуста — все заявки обработаны</div>
        )}
        {receipts.map((r) => (
          <div key={r.id} style={{ padding: '8px 16px' }}>
            <Cell subtitle={`${r.amount} ₸ · ${new Date(r.created_at).toLocaleString('ru-RU')}`}>
              {r.full_name} {r.username ? `(@${r.username})` : ''}
            </Cell>
            {r.receipt_url && (
              <a href={r.receipt_url} target="_blank" rel="noreferrer">
                <Image src={r.receipt_url} size={96} />
              </a>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button size="s" loading={decidingId === r.id} disabled={decidingId !== null}
                      onClick={() => decide(r.id, true)}>
                Подтвердить
              </Button>
              <Button size="s" mode="gray" disabled={decidingId !== null}
                      onClick={() => decide(r.id, false)}>
                Отклонить
              </Button>
            </div>
          </div>
        ))}
      </Section>
    </List>
  );
}
