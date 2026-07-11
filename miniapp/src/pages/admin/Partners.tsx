import { useEffect, useState } from 'react';
import { Badge, Button, Cell, Input, List, Section, Switch } from '@telegram-apps/telegram-ui';
import { retrieveRawInitData } from '@telegram-apps/sdk-react';
import { api, CATEGORIES, type Partner } from '../../api';
import { ErrorState, Loader } from '../../hooks';

interface AdminPartner extends Partner {
  user_id: number | null;
  is_active: boolean;
  is_paused: boolean;
  avg_check: number | null;
  lat: number | null;
  lng: number | null;
}

/** Форма-редактор одного партнёра (раскрывается по тапу). */
function Editor({ p, onSaved }: { p: AdminPartner; onSaved: () => void }) {
  const [form, setForm] = useState({
    category: p.category ?? '', address: p.address ?? '', work_hours: p.work_hours ?? '',
    discount_free: p.discount_free, discount_premium: p.discount_premium,
    avg_check: p.avg_check ?? 0, lat: p.lat ?? '', lng: p.lng ?? '',
    user_tg_id: p.user_id ?? '',
  });
  const [qrUrl, setQrUrl] = useState('');
  const [qrError, setQrError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const body: Record<string, unknown> = {
      category: form.category || null, address: form.address || null,
      work_hours: form.work_hours || null,
      discount_free: Number(form.discount_free), discount_premium: Number(form.discount_premium),
    };
    if (form.avg_check) body.avg_check = Number(form.avg_check);
    if (form.lat !== '' && form.lng !== '') { body.lat = Number(form.lat); body.lng = Number(form.lng); }
    if (form.user_tg_id) body.user_tg_id = Number(form.user_tg_id);
    await api(`/admin/partners/${p.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      .catch(() => {});
    setBusy(false);
    onSaved();
  };

  const toggle = async (field: 'is_active' | 'is_paused', value: boolean) => {
    await api(`/admin/partners/${p.id}`, {
      method: 'PATCH', body: JSON.stringify({ [field]: value }),
    }).catch(() => {});
    onSaved();
  };

  const showQr = async () => {
    // <img> не умеет слать заголовок авторизации — качаем blob сами
    setQrError('');
    try {
      let initData = '';
      try { initData = retrieveRawInitData() ?? ''; } catch { /* dev в браузере */ }
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/admin/partners/${p.id}/qr`, {
        headers: { Authorization: `tma ${initData}` },
      });
      if (!res.ok) throw new Error(String(res.status));
      setQrUrl(URL.createObjectURL(await res.blob()));
    } catch {
      setQrError('QR не загрузился — попробуйте ещё раз');
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <div className="vg-h" style={{ margin: '2px 2px 8px' }}>Категория</div>
        <div className="vg-chips">
          {CATEGORIES.map((c) => (
            <button key={c}
                    className={`vg-chip ${form.category === c ? 'is-on' : ''}`}
                    onClick={() => setForm({ ...form, category: c })}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <Input header="Адрес" value={String(form.address)} onChange={set('address')} />
      <Input header="Часы работы" value={String(form.work_hours)} onChange={set('work_hours')} placeholder="10:00–22:00" />
      <div style={{ display: 'flex', gap: 8 }}>
        <Input header="% скидка дня" type="number" value={String(form.discount_free)} onChange={set('discount_free')} />
        <Input header="% подписчикам" type="number" value={String(form.discount_premium)} onChange={set('discount_premium')} />
      </div>
      <Input header="Средний чек, ₸" type="number" value={String(form.avg_check)} onChange={set('avg_check')} />
      <div style={{ display: 'flex', gap: 8 }}>
        <Input header="Широта (lat)" value={String(form.lat)} onChange={set('lat')} placeholder="51.7298" />
        <Input header="Долгота (lng)" value={String(form.lng)} onChange={set('lng')} placeholder="75.3266" />
      </div>
      <Input header="Telegram ID владельца" value={String(form.user_tg_id)} onChange={set('user_tg_id')} placeholder="123456789" />

      <Cell after={<Switch checked={p.is_active} onChange={(e) => toggle('is_active', e.target.checked)} />}>
        Активен (выключить = скрыть совсем)
      </Cell>
      <Cell after={<Switch checked={p.is_paused} onChange={(e) => toggle('is_paused', e.target.checked)} />}>
        Пауза (партнёр в отпуске)
      </Cell>

      <div style={{ display: 'flex', gap: 8 }}>
        <Button size="s" loading={busy} onClick={save}>Сохранить</Button>
        <Button size="s" mode="gray" onClick={showQr}>QR-наклейка</Button>
      </div>
      {qrError && <div className="vg-note is-err">{qrError}</div>}
      {qrUrl && (
        <div style={{ textAlign: 'center' }}>
          <img src={qrUrl} width={220} alt="QR" />
          <div style={{ fontSize: 13, color: 'var(--tgui--hint_color, #8a8a8e)' }}>
            Долгий тап → сохранить изображение
          </div>
        </div>
      )}
    </div>
  );
}

export default function Partners() {
  // undefined — грузим, null — ошибка сети
  const [partners, setPartners] = useState<AdminPartner[] | null | undefined>(undefined);
  const [open, setOpen] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => {
    api<AdminPartner[]>('/admin/partners').then(setPartners).catch(() => setPartners(null));
  };
  useEffect(load, []);

  const create = async () => {
    setCreating(true);
    await api('/admin/partners', { method: 'POST', body: JSON.stringify({ name: newName.trim() }) })
      .then(() => setNewName(''))
      .catch(() => {});
    setCreating(false);
    load();
  };

  if (partners === undefined) return <Loader />;
  if (partners === null)
    return <ErrorState onRetry={() => { setPartners(undefined); load(); }} />;

  return (
    <List>
      <Section header="Новый партнёр">
        <div style={{ padding: '4px 16px 12px', display: 'flex', gap: 8 }}>
          <Input placeholder="Название заведения" value={newName}
                 onChange={(e) => setNewName(e.target.value)} />
          <Button loading={creating} disabled={newName.trim().length < 2} onClick={create}>
            Добавить
          </Button>
        </div>
      </Section>

      <Section header={`Партнёры (${partners.length})`}>
        {partners.length === 0 && (
          <div className="vg-empty">Пока нет партнёров — добавьте первого выше</div>
        )}
        {partners.map((p) => (
          <div key={p.id}>
            <Cell
              subtitle={`#${p.id} · ${p.category ?? 'без категории'}${p.lat == null ? ' · нет координат!' : ''}`}
              after={
                <Badge type="number" mode={p.is_active && !p.is_paused ? 'primary' : 'gray'}>
                  {p.is_active ? (p.is_paused ? 'пауза' : `−${p.discount_premium}%`) : 'выкл'}
                </Badge>
              }
              onClick={() => setOpen(open === p.id ? null : p.id)}
            >
              {p.name}
            </Cell>
            {open === p.id && <Editor p={p} onSaved={load} />}
          </div>
        ))}
      </Section>
    </List>
  );
}
