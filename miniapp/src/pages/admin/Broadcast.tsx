import { useState } from 'react';
import { Button, List, Section, Textarea } from '@telegram-apps/telegram-ui';
import { api } from '../../api';
import { Chips } from './chips';

type Segment = 'all' | 'subscribers' | 'expired';

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'subscribers', label: 'Подписчики' },
  { id: 'expired', label: 'Истёкшие' },
];

/** Рассылка: сегмент → текст → предпросмотр с числом получателей → отправка. */
export default function Broadcast() {
  const [segment, setSegment] = useState<Segment>('all');
  const [text, setText] = useState('');
  const [recipients, setRecipients] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const preview = async () => {
    setBusy(true);
    setStatus('');
    try {
      const r = await api<{ recipients: number }>('/admin/broadcast', {
        method: 'POST',
        body: JSON.stringify({ segment, text, dry_run: true }),
      });
      setRecipients(r.recipients);
    } catch {
      setStatus('Ошибка предпросмотра');
    }
    setBusy(false);
  };

  const send = async () => {
    setBusy(true);
    try {
      const r = await api<{ recipients: number }>('/admin/broadcast', {
        method: 'POST',
        body: JSON.stringify({ segment, text, dry_run: false }),
      });
      setStatus(`Отправляется ${r.recipients} получателям (батчами, займёт время).`);
      setText('');
      setRecipients(null);
    } catch {
      setStatus('Ошибка отправки');
    }
    setBusy(false);
  };

  return (
    <List>
      <Section header="Сегмент">
        <Chips items={SEGMENTS} value={segment} onChange={(s) => { setSegment(s); setRecipients(null); }} />
      </Section>

      <Section header="Сообщение">
        <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Textarea placeholder="Текст рассылки…" value={text} rows={5}
                    onChange={(e) => { setText(e.target.value); setRecipients(null); }} />
          {recipients === null ? (
            <Button stretched loading={busy} disabled={text.trim().length < 3} onClick={preview}>
              Проверить получателей
            </Button>
          ) : (
            <>
              <div style={{ textAlign: 'center' }}>
                Получателей: <b>{recipients}</b>. Отправить?
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button stretched loading={busy} onClick={send}>Отправить</Button>
                <Button stretched mode="gray" onClick={() => setRecipients(null)}>Отмена</Button>
              </div>
            </>
          )}
          {status && <div style={{ textAlign: 'center' }}>{status}</div>}
        </div>
      </Section>
    </List>
  );
}
