import { useEffect, useState } from 'react';
import { Badge, Button, Cell, Input, List, Section, Spinner, Switch } from '@telegram-apps/telegram-ui';
import { retrieveRawInitData } from '@telegram-apps/sdk-react';
import { api, type Partner } from '../../api';

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
    let initData = '';
    try { initData = retrieveRawInitData() ?? ''; } catch { /* dev в браузере */ }
    const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/admin/partners/${p.id}/qr`, {
      headers: { Authorization: `tma ${initData}` },
    });
    if (res.ok) setQrUrl(URL.createObjectURL(await res.blob()));
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Input header="Категория" value={String(form.category)} onChange={set('category')} placeholder="еда / красота / авто" />
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
      {qrUrl && (
        <div style={{ textAlign: 'center' }}>
          <img src={qrUrl} width={220} alt="QR" />
          <div style={{ fontSize: 13, opacity: 0.6 }}>Долгий тап → сохранить изображение</div>
        </div>
      )}
    </div>
  );
}

export default function Partners() {
  const [partners, setPartners] = useState<AdminPartner[] | undefined>(undefined);
  const [open, setOpen] = useState<number | null>(null);
  const [newName, setNewName] = useState('');

  const load = () => {
    api<AdminPartner[]>('/admin/partners').then(setPartners).catch(() => setPartners([]));
  };
  useEffect(load, []);

  const create = async () => {
    await api('/admin/partners', { method: 'POST', body: JSON.stringify({ name: newName.trim() }) })
      .catch(() => {});
    setNewName('');
    load();
  };

  if (!partners) return <Spinner size="l" />;

  return (
    <List>
      <Section header="Новый партнёр">
        <div style={{ padding: '4px 16px 12px', display: 'flex', gap: 8 }}>
          <Input placeholder="Название заведения" value={newName}
                 onChange={(e) => setNewName(e.target.value)} />
          <Button disabled={newName.trim().length < 2} onClick={create}>Добавить</Button>
        </div>
      </Section>

      <Section header={`Партнёры (${partners.length})`}>
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
