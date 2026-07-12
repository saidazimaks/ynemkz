import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Cell, Input, List, Section } from '@telegram-apps/telegram-ui';
import { api, ApiError } from '../../api';
import { ErrorState, Loader } from '../../hooks';

type PayMethod = 'kaspi' | 'stars' | 'manual';

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
  payment_method: PayMethod | null;
}

interface UsersResponse {
  total: number;
  users: AdminUser[];
}

interface UserVisit {
  name: string;
  used_at: string;
  discount: number;
}

interface UserSub {
  id: number;
  status: 'pending' | 'active' | 'expired' | 'rejected' | 'refunded';
  payment_method: PayMethod;
  amount: number;
  created_at: string;
  paid_at: string | null;
  expires_at: string | null;
}

interface UserDetail {
  id: number;
  full_name: string | null;
  username: string | null;
  phone: string | null;
  role: AdminUser['role'];
  is_banned: boolean;
  created_at: string;
  referrer_name: string | null;
  referrer_username: string | null;
  invited: number;
  visits: UserVisit[];
  subs: UserSub[];
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

const METHOD_LABEL: Record<PayMethod, string> = {
  kaspi: 'Kaspi', stars: 'Stars', manual: 'Вручную',
};

const STATUS_LABEL: Record<UserSub['status'], string> = {
  pending: 'на проверке', active: 'активна', expired: 'истекла',
  rejected: 'отклонена', refunded: 'возврат',
};

const GRANT_PRESETS = [7, 30, 90];

const dateRu = (s: string | null) => (s ? new Date(s).toLocaleDateString('ru-RU') : '—');

/** Карточка пользователя: профиль, визиты, подписки, ручная выдача/отмена. */
function UserCard({ u, onAction }: { u: AdminUser; onAction: () => void }) {
  // undefined — грузим, null — не загрузилась
  const [detail, setDetail] = useState<UserDetail | null | undefined>(undefined);
  const [days, setDays] = useState('30');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const loadDetail = () =>
    api<UserDetail>(`/admin/users/${u.id}`).then(setDetail).catch(() => setDetail(null));
  useEffect(() => { loadDetail(); }, [u.id]);

  const act = async (fn: () => Promise<unknown>, okText: string) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      setNote({ ok: true, text: okText });
      loadDetail();
      onAction(); // обновить список снаружи
    } catch (e) {
      setNote({ ok: false, text: e instanceof ApiError ? String(e.detail) : 'Ошибка сети' });
    }
    setBusy(false);
  };

  const grant = (n: number) => act(
    () => api(`/admin/users/${u.id}/grant`, { method: 'POST', body: JSON.stringify({ days: n }) }),
    `Подписка выдана на ${n} дн. — пользователю ушло сообщение в бот`,
  );
  const cancelSub = () => act(
    () => api(`/admin/users/${u.id}/cancel-sub`, { method: 'POST' }),
    'Подписка отменена',
  );
  const ban = (banned: boolean) => act(
    () => api(`/admin/users/${u.id}/ban`, { method: 'POST', body: JSON.stringify({ banned }) }),
    banned ? 'Пользователь забанен' : 'Пользователь разбанен',
  );
  const refund = (subId: number) => act(
    () => api(`/admin/subscriptions/${subId}/refund`, { method: 'POST' }),
    'Stars возвращены, подписка отменена',
  );

  if (detail === undefined)
    return <div className="vg-skel vg-skel-card" style={{ margin: '4px 16px 12px' }} />;
  if (detail === null)
    return <div className="vg-empty">Карточка не загрузилась — попробуйте ещё раз</div>;

  const daysNum = Number(days);
  const activeSub = detail.subs.find((s) => s.status === 'active');

  return (
    <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="vg-card" style={{ cursor: 'default', display: 'block' }}>
        <div className="vg-card-meta">id {detail.id} · {detail.phone ?? 'без телефона'}</div>
        <div className="vg-card-meta">
          рег. {dateRu(detail.created_at)}{ROLE_LABEL[detail.role] ? ` · ${ROLE_LABEL[detail.role]}` : ''}
        </div>
        <div className="vg-card-meta">
          пригласил: {detail.referrer_name
            ? `${detail.referrer_name}${detail.referrer_username ? ` (@${detail.referrer_username})` : ''}`
            : '—'} · приглашённых: {detail.invited}
        </div>
      </div>

      <div className="vg-h" style={{ margin: '6px 2px 2px' }}>Выдать подписку</div>
      <div className="vg-chips">
        {GRANT_PRESETS.map((n) => (
          <button key={n} className={`vg-chip ${daysNum === n ? 'is-on' : ''}`}
                  onClick={() => setDays(String(n))}>
            {n} дн.
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Input placeholder="Дней" inputMode="numeric" value={days}
               onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} />
        <Button loading={busy} disabled={busy || daysNum < 1 || daysNum > 365}
                onClick={() => grant(daysNum)}>
          Выдать
        </Button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {activeSub && (
          <Button size="s" mode="gray" disabled={busy} onClick={cancelSub}>
            Отменить подписку (без возврата)
          </Button>
        )}
        {activeSub?.payment_method === 'stars' && (
          <Button size="s" mode="gray" disabled={busy} onClick={() => refund(activeSub.id)}>
            Возврат Stars
          </Button>
        )}
        <Button size="s" mode="gray" disabled={busy} onClick={() => ban(!detail.is_banned)}>
          {detail.is_banned ? 'Разбанить' : 'Бан'}
        </Button>
      </div>
      {note && <div className={`vg-note ${note.ok ? 'is-ok' : 'is-err'}`}>{note.text}</div>}

      <div className="vg-h" style={{ margin: '6px 2px 2px' }}>Подписки</div>
      {detail.subs.length === 0 ? (
        <div className="vg-card-meta">Подписок не было</div>
      ) : detail.subs.map((s) => (
        <div key={s.id} className="vg-card-meta">
          {METHOD_LABEL[s.payment_method]} · {s.amount} ₸ · {STATUS_LABEL[s.status]}
          {s.expires_at ? ` · до ${dateRu(s.expires_at)}` : ''} · {dateRu(s.paid_at ?? s.created_at)}
        </div>
      ))}

      <div className="vg-h" style={{ margin: '6px 2px 2px' }}>Визиты</div>
      {detail.visits.length === 0 ? (
        <div className="vg-card-meta">Визитов пока нет</div>
      ) : detail.visits.map((v, i) => (
        <div key={i} className="vg-card-meta" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{v.name} · {dateRu(v.used_at)}</span>
          <span className="vg-pct">−{v.discount}%</span>
        </div>
      ))}
    </div>
  );
}

export default function Users() {
  // undefined — грузим, null — ошибка сети
  const [data, setData] = useState<UsersResponse | null | undefined>(undefined);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<number | null>(null);
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
        ? `подписка до ${dateRu(u.expires_at)}`
        : 'без подписки',
      `${u.visits} визит${u.visits % 10 === 1 && u.visits % 100 !== 11 ? '' : u.visits % 10 >= 2 && u.visits % 10 <= 4 && (u.visits % 100 < 10 || u.visits % 100 >= 20) ? 'а' : 'ов'}`,
      `рег. ${dateRu(u.created_at)}`,
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
                onClick={() => setOpen(open === u.id ? null : u.id)}
                after={u.payment_method && (
                  <Badge type="number" mode={u.payment_method === 'stars' ? 'primary' : 'gray'}>
                    {METHOD_LABEL[u.payment_method]}
                  </Badge>
                )}
              >
                {u.is_banned ? '(бан) ' : ''}{u.full_name ?? `id ${u.id}`}
                {u.username ? ` (@${u.username})` : ''}
              </Cell>
              {open === u.id && <UserCard u={u} onAction={() => load()} />}
            </div>
          ))}
        </Section>
      )}
    </List>
  );
}
