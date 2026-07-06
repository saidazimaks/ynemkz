import { useEffect, useState } from 'react';
import { Button, Cell, List, Placeholder, Progress, Section, Switch } from '@telegram-apps/telegram-ui';
import { invoice, openTelegramLink } from '@telegram-apps/sdk-react';
import { api, type Me, type Visit } from './../api';

const BOT = import.meta.env.VITE_BOT_USERNAME as string | undefined;

export default function Profile({ me, onChange }: { me: Me | null; onChange: (m: Me) => void }) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    api<Visit[]>('/me/visits').then(setVisits).catch(() => {});
  }, []);

  if (!me)
    return (
      <Placeholder header="Нужна регистрация"
                   description="Запустите бота и поделитесь номером — затем возвращайтесь."
                   action={BOT && (
                     <Button onClick={() => { try { openTelegramLink(`https://t.me/${BOT}`); } catch { /* dev */ } }}>
                       Открыть бота
                     </Button>
                   )} />
    );

  const payStars = async () => {
    setPaying(true);
    try {
      const { invoice_link } = await api<{ invoice_link: string }>('/stars-invoice', { method: 'POST' });
      await invoice.open(invoice_link, 'url');
      onChange(await api<Me>('/me')); // обновить статус после оплаты
    } catch { /* отменил или уже активна */ }
    setPaying(false);
  };

  const payKaspi = () => {
    // Ручной флоу: перевод + скрин чека в чат бота (раздел 3.1)
    if (BOT) try { openTelegramLink(`https://t.me/${BOT}`); } catch { /* dev */ }
  };

  const toggleNotify = async (enabled: boolean) => {
    await api('/me/notify', { method: 'POST', body: JSON.stringify({ enabled }) });
    onChange({ ...me, notify_daily: enabled });
  };

  const sub = me.subscription;

  return (
    <List>
      <Section header={me.full_name ?? 'Профиль'}>
        {sub.active ? (
          <>
            <Cell subtitle={`Осталось дней: ${sub.days_left}`}>
              Подписка активна
            </Cell>
            <div style={{ padding: '0 16px 12px' }}>
              <Progress value={Math.min(((sub.days_left ?? 0) / 30) * 100, 100)} />
            </div>
          </>
        ) : sub.pending ? (
          <Cell subtitle="Чек на проверке у админа">Заявка в обработке</Cell>
        ) : (
          <>
            <Cell subtitle="Скидки 10–15% у всех партнёров на 30 дней">Подписка не активна</Cell>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button stretched loading={paying} onClick={payStars}>Оплатить Stars — мгновенно</Button>
              <Button stretched mode="gray" onClick={payKaspi}>Оплатить Kaspi (чек в боте)</Button>
            </div>
          </>
        )}
      </Section>

      <Section header="Экономия">
        <Cell after={<b>{me.saved.toLocaleString('ru-RU')} ₸</b>}>Вы сэкономили</Cell>
        <Cell after={<b>{me.visits}</b>}>Визитов</Cell>
      </Section>

      {visits.length > 0 && (
        <Section header="История визитов">
          {visits.slice(0, 10).map((v, i) => (
            <Cell key={i}
                  subtitle={new Date(v.used_at).toLocaleDateString('ru-RU')}
                  after={`−${v.discount}%`}>
              {v.name}
            </Cell>
          ))}
        </Section>
      )}

      <Section header="Настройки">
        <Cell after={<Switch checked={me.notify_daily}
                             onChange={(e) => toggleNotify(e.target.checked)} />}>
          Утренняя скидка дня
        </Cell>
      </Section>
    </List>
  );
}
