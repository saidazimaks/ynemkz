import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Cell, Input, List, Section } from '@telegram-apps/telegram-ui';
import { api } from '../../api';
import { ErrorState, Loader } from '../../hooks';

interface AdminUser {
  id: number;
  full_name: string | null;
  username: string | null;
  phone: string | null;
  role: 'buyer' | 'partner' | 'admin';
  is_banned: boolean;
  created_at: string;
  visits: number;
  // Активная подписка, если есть
  sub_id: number | null;
  expires_at: string | null;
  payment_method: 'kaspi' | 'stars' | null;
}

interface UsersResponse {
  total: number;
  users: AdminUser[];
}

type Filter = 'all' | 'subs' | 'free' | 'banned';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'subs', label: 'С подпиской' },
  { id: 'free', label: 'Без подписки' },
  { id: 'banned', label: 'Бан' },
];

const ROLE_LABEL: Record<AdminUser['role'], string> = {
  buyer: '', partner: 'партнёр', admin: 'админ',
};

export default function Users() {
  // undefined — грузим, null — ошибка сети
  const [data, setData] = useState<UsersResponse | null | undefined>(undefined);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const load = (query = q) =>
    api<UsersResponse>(`/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      .then(setData).catch(() => setData(null));

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

  // Фильтры — по уже загруженному списку (сервер отдаёт до 200, свежие сверху)
  const shown = (data?.users ?? []).filter((u) =>
    filter === 'subs' ? u.sub_id !== null
    : filter === 'free' ? u.sub_id === null
    : filter === 'banned' ? u.is_banned
    : true,
  );

  const subtitle = (u: AdminUser) => {
    const parts = [
      u.sub_id && u.expires_at
        ? `подписка до ${new Date(u.expires_at).toLocaleDateString('ru-RU')}`
        : 'без подписки',
      `${u.visits} визит${u.visits % 10 === 1 && u.visits % 100 !== 11 ? '' : u.visits % 10 >= 2 && u.visits % 10 <= 4 && (u.visits % 100 < 10 || u.visits % 100 >= 20) ? 'а' : 'ов'}`,
      `рег. ${new Date(u.created_at).toLocaleDateString('ru-RU')}`,
    ];
    if (ROLE_LABEL[u.role]) parts.push(ROLE_LABEL[u.role]);
    return parts.join(' · ');
  };

  return (
    <List>
      <div style={{ padding: '4px 16px' }}>
        <Input placeholder="Поиск: имя, @username или телефон" value={q}
               onChange={(e) => search(e.target.value)} />
        <div className="vg-chips" style={{ marginTop: 8 }}>
          {FILTERS.map((f) => (
            <button key={f.id} className={`vg-chip ${filter === f.id ? 'is-on' : ''}`}
                    onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {data === undefined ? <Loader /> : data === null ? (
        <ErrorState onRetry={() => { setData(undefined); load(); }} />
      ) : (
        <Section header={`Пользователи (${filter === 'all' ? data.total : shown.length})`}
                 footer={data.total > data.users.length
                   ? `Показаны последние ${data.users.length} из ${data.total} — остальных ищите поиском`
                   : undefined}>
          {shown.length === 0 && (
            <div className="vg-empty">
              {q || filter !== 'all' ? 'Никого не найдено' : 'Пользователей пока нет'}
            </div>
          )}
          {shown.map((u) => (
            <div key={u.id}>
              <Cell
                subtitle={subtitle(u)}
                after={u.payment_method && (
                  <Badge type="number" mode={u.payment_method === 'stars' ? 'primary' : 'gray'}>
                    {u.payment_method === 'stars' ? 'Stars' : 'Kaspi'}
                  </Badge>
                )}
              >
                {u.is_banned ? '(бан) ' : ''}{u.full_name ?? `id ${u.id}`}
                {u.username ? ` (@${u.username})` : ''}
              </Cell>
              <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px' }}>
                <Button size="s" mode="gray" loading={busyId === u.id}
                        disabled={busyId !== null}
                        onClick={() => ban(u.id, !u.is_banned)}>
                  {u.is_banned ? 'Разбанить' : 'Бан'}
                </Button>
                {u.sub_id !== null && u.payment_method === 'stars' && (
                  <Button size="s" mode="gray" disabled={busyId !== null}
                          onClick={() => refund(u.sub_id!, u.id)}>
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
