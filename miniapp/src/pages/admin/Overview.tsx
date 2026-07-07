import { useEffect, useState } from 'react';
import { Button, Cell, Image, List, Placeholder, Section, Spinner } from '@telegram-apps/telegram-ui';
import { api } from '../../api';

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

export default function Overview() {
  const [receipts, setReceipts] = useState<Receipt[] | null | undefined>(undefined);
  const [stats, setStats] = useState<AdminStats | null>(null);

  const load = () => {
    api<Receipt[]>('/admin/receipts').then(setReceipts).catch(() => setReceipts(null));
    api<AdminStats>('/admin/stats').then(setStats).catch(() => {});
  };
  useEffect(load, []);

  const decide = async (id: number, approve: boolean) => {
    await api(`/admin/receipts/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({ approve }),
    }).catch(() => {});
    load();
  };

  if (receipts === undefined) return <Spinner size="l" />;
  if (receipts === null)
    return <Placeholder header="Нет доступа" description="Раздел только для админов." />;

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
        {receipts.length === 0 && <Cell subtitle="Все заявки обработаны">Пусто</Cell>}
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
              <Button size="s" onClick={() => decide(r.id, true)}>Подтвердить</Button>
              <Button size="s" mode="gray" onClick={() => decide(r.id, false)}>Отклонить</Button>
            </div>
          </div>
        ))}
      </Section>
    </List>
  );
}
