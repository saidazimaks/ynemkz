/** Интеграция с Telegram (MainButton/BackButton) и загрузка с кэшем.
 *  Все вызовы SDK в try/catch — в браузере без Telegram хуки тихо бездействуют. */
import { useEffect, useRef, useState } from 'react';
import { backButton, mainButton } from '@telegram-apps/sdk-react';
import { api, readCache, writeCache } from './api';

const BRAND_BG = '#ff8a1e';
const BRAND_FG = '#ffffff';

/** Системная нижняя кнопка Telegram как главное действие экрана. */
export function useMainButton(
  text: string,
  onClick: () => void,
  { visible = true, enabled = true, loading = false } = {},
) {
  const cb = useRef(onClick);
  cb.current = onClick;

  useEffect(() => {
    try {
      const off = mainButton.onClick(() => cb.current());
      return off;
    } catch { return; }
  }, []);

  useEffect(() => {
    try {
      if (mainButton.mount.isAvailable() && !mainButton.isMounted()) mainButton.mount();
      mainButton.setParams({
        text,
        isVisible: visible,
        isEnabled: enabled && !loading,
        isLoaderVisible: loading,
        backgroundColor: BRAND_BG,
        textColor: BRAND_FG,
      });
    } catch { /* вне Telegram */ }
    return () => {
      try { mainButton.setParams({ isVisible: false }); } catch { /* вне Telegram */ }
    };
  }, [text, visible, enabled, loading]);
}

/** Системная стрелка «назад» в шапке Telegram. */
export function useBackButton(onBack: () => void) {
  const cb = useRef(onBack);
  cb.current = onBack;

  useEffect(() => {
    try {
      if (backButton.show.isAvailable()) backButton.show();
      const off = backButton.onClick(() => cb.current());
      return () => {
        off();
        try { backButton.hide(); } catch { /* вне Telegram */ }
      };
    } catch { return; }
  }, []);
}

/** GET с кэшем: undefined — грузится впервые, null — ошибка без кэша.
 *  Из sessionStorage отдаёт мгновенно, свежее подтягивает фоном. */
export function useCachedApi<T>(path: string): T | null | undefined {
  const [data, setData] = useState<T | null | undefined>(() => readCache<T>(path));

  useEffect(() => {
    let alive = true;
    api<T>(path)
      .then((fresh) => {
        if (!alive) return;
        setData(fresh);
        writeCache(path, fresh);
      })
      .catch(() => {
        if (!alive) return;
        setData((d) => (d === undefined ? null : d));
      });
    return () => { alive = false; };
  }, [path]);

  return data;
}

/** Мерцающая заглушка страницы (fallback для lazy-роутов и первой загрузки). */
export function PageSkeleton() {
  return (
    <div className="vg-page">
      <div className="vg-skel vg-skel-hero" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="vg-skel vg-skel-card" />
      ))}
    </div>
  );
}
