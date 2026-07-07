import { useEffect, useState } from 'react';
import { Badge, Button, Cell, Input, List, Section, Spinner } from '@telegram-apps/telegram-ui';
import { api } from '../../api';

interface Subscriber {
  sub_id: number;
  expires_at: string;
  payment_method: 'kaspi' | 'stars';
  id: number;
  full_name: string | null;
  username: string | null;
  phone: string | null;
  is_banned: boolean;
}

export default function Users() {
  const [subs, setSubs] = useState<Subscriber[] | undefined>(undefined);
  const [q, setQ] = useState('');

  const load = (query = q) =>
    api<Subscriber[]>(`/admin/subscribers${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      .then(setSubs).catch(() => setSubs([]));

  useEffect(() => { load(''); }, []);

  const ban = async (userId: number, banned: boolean) => {
    await api(`/admin/users/${userId}/ban`, {
      method: 'POST', body: JSON.stringify({ banned }),
    }).catch(() => {});
    load();
  };

  const refund = async (subId: number) => {
    await api(`/admin/subscriptions/${subId}/refund`, { method: 'POST' }).catch(() => {});
    load();
  };

  return (
    <List>
      <div style={{ padding: '4px 16px' }}>
        <Input placeholder="Поиск: имя или @username" value={q}
               onChange={(e) => { setQ(e.target.value); load(e.target.value); }} />
      </div>

      {!subs ? <Spinner size="l" /> : (
        <Section header={`Активные подписчики (${subs.length})`}>
          {subs.length === 0 && <Cell subtitle="Никого не найдено">—</Cell>}
          {subs.map((s) => (
            <div key={s.sub_id}>
              <Cell
                subtitle={`до ${new Date(s.expires_at).toLocaleDateString('ru-RU')}`}
                after={
                  <Badge type="number" mode={s.payment_method === 'stars' ? 'primary' : 'gray'}>
                    {s.payment_method === 'stars' ? 'Stars' : 'Kaspi'}
                  </Badge>
                }
              >
                {s.is_banned ? '(бан) ' : ''}{s.full_name} {s.username ? `(@${s.username})` : ''}
              </Cell>
              <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px' }}>
                <Button size="s" mode="gray" onClick={() => ban(s.id, !s.is_banned)}>
                  {s.is_banned ? 'Разбанить' : 'Бан'}
                </Button>
                {s.payment_method === 'stars' && (
                  <Button size="s" mode="gray" onClick={() => refund(s.sub_id)}>Возврат Stars</Button>
                )}
              </div>
            </div>
          ))}
        </Section>
      )}
    </List>
  );
}
