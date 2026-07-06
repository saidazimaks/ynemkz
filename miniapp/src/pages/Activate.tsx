import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Placeholder, Spinner } from '@telegram-apps/telegram-ui';
import { hapticFeedback, openTelegramLink } from '@telegram-apps/sdk-react';
import { api, ApiError, type Activation } from './../api';

type State =
  | { kind: 'loading' }
  | { kind: 'active'; data: Activation }
  | { kind: 'expired' }
  | { kind: 'need_sub'; partner: string; discount: number }
  | { kind: 'need_bot' }
  | { kind: 'error'; message: string };

/** Экран активации (вариант C): знак дня, имя, ЖИВЫЕ тикающие часы, 5 минут жизни.
 *  Часы идут по серверному времени (offset от server_time) — перевод часов на
 *  телефоне не поможет. Дрейфующий фон и вращающееся кольцо — анти-скриншот. */
export default function Activate() {
  const { partnerId } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [clock, setClock] = useState('');
  const offsetRef = useRef(0);

  useEffect(() => {
    api<Activation>('/activate', {
      method: 'POST',
      body: JSON.stringify({ partner_id: Number(partnerId) }),
    })
      .then((data) => {
        offsetRef.current = new Date(data.server_time).getTime() - Date.now();
        setState({ kind: 'active', data });
        try { hapticFeedback.notificationOccurred('success'); } catch { /* браузер */ }
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 402) {
          const d = e.detail as { partner: string; discount: number };
          setState({ kind: 'need_sub', partner: d.partner, discount: d.discount });
        } else if (e instanceof ApiError && e.status === 403) {
          setState({ kind: 'need_bot' }); // не зарегистрирован — в бот, сохранив partner_id
        } else if (e instanceof ApiError && e.status === 409) {
          setState({ kind: 'error', message: String(e.detail) });
        } else {
          setState({ kind: 'error', message: 'Нет связи. Попробуйте ещё раз.' });
        }
      });
  }, [partnerId]);

  // Тикающие часы + авто-истечение
  useEffect(() => {
    if (state.kind !== 'active') return;
    const expiresAt = new Date(state.data.expires_at).getTime();
    const tick = () => {
      const serverNow = Date.now() + offsetRef.current;
      if (serverNow >= expiresAt) {
        setState({ kind: 'expired' });
        return;
      }
      setClock(new Date(serverNow).toLocaleTimeString('ru-RU'));
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [state]);

  if (state.kind === 'loading') return <div className="vg-loader"><Spinner size="l" /></div>;

  if (state.kind === 'expired')
    return (
      <Placeholder header="Экран истёк"
                   description="Отсканируйте QR на кассе заново."
                   action={<Button onClick={() => navigate('/')}>К скидкам</Button>} />
    );

  if (state.kind === 'need_bot') {
    const botUsername = import.meta.env.VITE_BOT_USERNAME as string | undefined;
    // deep link сохраняет partner_id: после регистрации бот сразу активирует скидку
    const link = `https://t.me/${botUsername}?start=p_${partnerId}`;
    return (
      <Placeholder
        header="Почти готово!"
        description="Зарегистрируйтесь в боте (телефон + согласие) — скидка активируется сразу после."
        action={botUsername && (
          <Button onClick={() => { try { openTelegramLink(link); } catch { window.open(link); } }}>
            Зарегистрироваться
          </Button>
        )}
      />
    );
  }

  if (state.kind === 'need_sub')
    return (
      <Placeholder
        header={`Скидка −${state.discount}% по подписке`}
        description={`«${state.partner}» даёт скидку подписчикам клуба. Оформите подписку и возвращайтесь!`}
        action={<Button onClick={() => navigate('/profile')}>Оформить подписку</Button>}
      />
    );

  if (state.kind === 'error')
    return (
      <Placeholder header="Не получилось" description={state.message}
                   action={<Button onClick={() => navigate('/')}>К скидкам</Button>} />
    );

  const { data } = state;
  const today = new Date(Date.now() + offsetRef.current).toLocaleDateString('ru-RU');
  const botUsername = import.meta.env.VITE_BOT_USERNAME as string | undefined;
  const [hh = '', mm = '', ss = ''] = clock.split(':');

  return (
    <div className="vg-act">
      <div className="vg-act-kind">
        {data.kind === 'daily' ? 'Скидка дня · для всех' : 'Скидка по подписке'}
      </div>
      <div className="vg-act-partner">{data.partner_name}</div>
      <div className="vg-act-pct">−{data.discount}%</div>
      <div className="vg-act-client">{data.client_name} · {today}</div>

      <div className="vg-act-ring">
        <span className="vg-act-sign">{data.daily_sign}</span>
      </div>

      <div className="vg-act-clock">
        {hh}<span className="vg-colon">:</span>{mm}<span className="vg-colon">:</span>{ss}
      </div>

      <div className="vg-act-note">
        Покажите этот экран кассиру. Часы идут, знак дня совпадает у всех — действует 5 минут.
      </div>
      {botUsername && (
        <button className="vg-act-link"
                onClick={() => { try { openTelegramLink(`https://t.me/${botUsername}`); } catch { /* dev */ } }}>
          Проблемы? Напишите в бот
        </button>
      )}
    </div>
  );
}
