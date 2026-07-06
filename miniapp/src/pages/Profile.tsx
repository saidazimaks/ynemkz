import { useEffect, useState } from 'react';
import { Button, Cell, List, Placeholder, Section, Switch } from '@telegram-apps/telegram-ui';
import { invoice, openTelegramLink } from '@telegram-apps/sdk-react';
import { api, type Me, type Visit } from './../api';
import { useCountUp, useMainButton } from './../hooks';

const BOT = import.meta.env.VITE_BOT_USERNAME as string | undefined;

export default function Profile({ me, onChange }: {
  me: Me | null | undefined;
  onChange: (m: Me) => void;
}) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    api<Visit[]>('/me/visits').then(setVisits).catch(() => {});
  }, []);

  // Набегающая сумма — эмоциональный центр экрана
  const savedAnimated = useCountUp(me?.saved ?? 0);

  // Главное действие экрана — системная кнопка Telegram
  const canPay = !!me && !me.subscription.active && !me.subscription.pending;
  useMainButton('Оплатить Stars — мгновенно', () => void payStars(), {
    visible: canPay,
    loading: paying,
  });

  if (me === undefined)
    return (
      <div className="vg-page">
        <div className="vg-skel vg-skel-hero" />
        {Array.from({ length: 3 }, (_, i) => <div key={i} className="vg-skel vg-skel-card" />)}
      </div>
    );

  if (me === null)
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
  const daysLeft = sub.days_left ?? 0;

  return (
    <div className="vg-page vg-stagger">
      <div className="vg-brand">
        <span className="vg-brand-name">{me.full_name ?? 'Профиль'}</span>
      </div>

      <div className="vg-save-card">
        <div className="vg-save-label">Вы сэкономили</div>
        <div className="vg-save-sum vg-display">
          {savedAnimated.toLocaleString('ru-RU')} <small>₸</small>
        </div>
        <div className="vg-save-meta">
          {me.visits} визит{me.visits % 10 === 1 && me.visits % 100 !== 11 ? '' : me.visits % 10 >= 2 && me.visits % 10 <= 4 && (me.visits % 100 < 10 || me.visits % 100 >= 20) ? 'а' : 'ов'} по клубной скидке
        </div>
      </div>

      <div className="vg-h">Подписка</div>

      {sub.active ? (
        <div className="vg-card" style={{ display: 'block', cursor: 'default' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div className="vg-card-name">Подписка активна</div>
            <div className="vg-pct">{daysLeft} дн.</div>
          </div>
          <div style={{ marginTop: 10 }} className="vg-progress">
            <div style={{ width: `${Math.min((daysLeft / 30) * 100, 100)}%` }} />
          </div>
        </div>
      ) : sub.pending ? (
        <div className="vg-card" style={{ cursor: 'default' }}>
          <div className="vg-card-body">
            <div className="vg-card-name">Заявка в обработке</div>
            <div className="vg-card-meta">Чек на проверке у админа</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="vg-card" style={{ cursor: 'default' }}>
            <div className="vg-card-body">
              <div className="vg-card-name">Подписка не активна</div>
              <div className="vg-card-meta">Скидки 10–15% у всех партнёров на 30 дней</div>
            </div>
          </div>
          {/* Stars — системной MainButton внизу; Kaspi — запасной путь */}
          <Button stretched mode="gray" onClick={payKaspi}>Оплатить Kaspi (чек в боте)</Button>
        </div>
      )}

      {visits.length > 0 && (
        <>
          <div className="vg-h">История визитов</div>
          <List>
            <Section>
              {visits.slice(0, 10).map((v, i) => (
                <Cell key={i}
                      subtitle={new Date(v.used_at).toLocaleDateString('ru-RU')}
                      after={<span className="vg-pct">−{v.discount}%</span>}>
                  {v.name}
                </Cell>
              ))}
            </Section>
          </List>
        </>
      )}

      <div className="vg-h">Настройки</div>
      <List>
        <Section>
          <Cell after={<Switch checked={me.notify_daily}
                               onChange={(e) => toggleNotify(e.target.checked)} />}>
            Утренняя скидка дня
          </Cell>
        </Section>
      </List>
    </div>
  );
}
