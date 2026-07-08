import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Cell, Input, List, Section } from '@telegram-apps/telegram-ui';
import { api } from '../../api';
import { ErrorState, Loader } from '../../hooks';

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
  // undefined — грузим, null — ошибка сети
  const [subs, setSubs] = useState<Subscriber[] | null | undefined>(undefined);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const load = (query = q) =>
    api<Subscriber[]>(`/admin/subscribers${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      .then(setSubs).catch(() => setSubs(null));

  useEffect(() => {
    load('');
    return () => clearTimeout(debounceRef.current);
  }, []);

  // Поиск с дебаунсом — не дёргаем API на каждую букву
  const search = (query: string) => {
    setQ(query);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(query), 300);
  };

  const ban = async (userId: number, banned: boolean) => {
    setBusyId(userId);
    await api(`/admin/users/${userId}/ban`, {
      method: 'POST', body: JSON.stringify({ banned }),
    }).catch(() => {});
    setBusyId(null);
    load();
  };

  const refund = async (subId: number, userId: number) => {
    setBusyId(userId);
    await api(`/admin/subscriptions/${subId}/refund`, { method: 'POST' }).catch(() => {});
    setBusyId(null);
    load();
  };

  return (
    <List>
      <div style={{ padding: '4px 16px' }}>
        <Input placeholder="Поиск: имя или @username" value={q}
               onChange={(e) => search(e.target.value)} />
      </div>

      {subs === undefined ? <Loader /> : subs === null ? (
        <ErrorState onRetry={() => { setSubs(undefined); load(); }} />
      ) : (
        <Section header={`Активные подписчики (${subs.length})`}>
          {subs.length === 0 && (
            <div className="vg-empty">
              {q ? 'Никого не найдено по запросу' : 'Активных подписчиков пока нет'}
            </div>
          )}
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
                <Button size="s" mode="gray" loading={busyId === s.id}
                        disabled={busyId !== null}
                        onClick={() => ban(s.id, !s.is_banned)}>
                  {s.is_banned ? 'Разбанить' : 'Бан'}
                </Button>
                {s.payment_method === 'stars' && (
                  <Button size="s" mode="gray" disabled={busyId !== null}
                          onClick={() => refund(s.sub_id, s.id)}>
                    Возврат Stars
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Section>
      )}
    </List>
  );
}
