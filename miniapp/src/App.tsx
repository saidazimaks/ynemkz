import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { HashRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { backButton, retrieveLaunchParams } from '@telegram-apps/sdk-react';
import { Tabbar } from '@telegram-apps/telegram-ui';
import { apiGet, readCache, writeCache, type Me } from './api';
import { PageSkeleton } from './hooks';
import { ChartIcon, GearIcon, MapPinIcon, TagIcon, UserIcon } from './icons';
import Home from './pages/Home';
import Activate from './pages/Activate';
import Profile from './pages/Profile';

// Leaflet (~40% бандла) нужен только этим страницам — грузим отдельным чанком
const PartnerPage = lazy(() => import('./pages/Partner'));
const MapPage = lazy(() => import('./pages/Map'));
// Кабинеты партнёра и админа нужны единицам — покупатель этот код не качает
const PartnerCabinet = lazy(() => import('./pages/PartnerCabinet'));
const Admin = lazy(() => import('./pages/admin'));

/** startapp=p_123 (наклейка на кассе) → сразу экран активации. */
function StartParamRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    try {
      const { tgWebAppStartParam } = retrieveLaunchParams();
      const m = /^p_(\d+)$/.exec(tgWebAppStartParam ?? '');
      if (m) navigate(`/activate/${m[1]}`, { replace: true });
    } catch { /* вне Telegram */ }
  }, [navigate]);
  return null;
}

/** Системная BackButton Telegram на маршрутах глубже таббара. */
function SystemBack() {
  const location = useLocation();
  const navigate = useNavigate();
  const deep = /^\/(partners|activate)\//.test(location.pathname);

  useEffect(() => {
    if (!deep) return;
    try {
      if (backButton.show.isAvailable()) backButton.show();
      const off = backButton.onClick(() =>
        window.history.length > 1 ? navigate(-1) : navigate('/'),
      );
      return () => {
        off();
        try { backButton.hide(); } catch { /* вне Telegram */ }
      };
    } catch { return; }
  }, [deep, navigate]);
  return null;
}

function Nav({ role }: { role: Me['role'] | null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const tabs = useMemo(() => {
    const base = [
      { id: '/', text: 'Скидки', icon: <TagIcon /> },
      { id: '/map', text: 'Карта', icon: <MapPinIcon /> },
      { id: '/profile', text: 'Профиль', icon: <UserIcon /> },
    ];
    if (role === 'partner') base.push({ id: '/cabinet', text: 'Кабинет', icon: <ChartIcon /> });
    if (role === 'admin') base.push({ id: '/admin', text: 'Админ', icon: <GearIcon /> });
    return base;
  }, [role]);

  if (location.pathname.startsWith('/activate')) return null; // на экране активации таббар мешает

  return (
    <Tabbar className="vg-tabbar">
      {tabs.map((tab) => (
        <Tabbar.Item
          key={tab.id}
          text={tab.text}
          selected={location.pathname === tab.id}
          onClick={() => navigate(tab.id)}
        >
          {tab.icon}
        </Tabbar.Item>
      ))}
    </Tabbar>
  );
}

export default function App() {
  // undefined — грузится (без кэша), null — не зарегистрирован/ошибка
  const [me, setMe] = useState<Me | null | undefined>(() => readCache<Me>('/me'));

  useEffect(() => {
    // apiGet сам пишет кэши; заодно склеивается с параллельным GET /me, если есть
    apiGet<Me>('/me')
      .then(setMe)
      .catch(() => setMe((cur) => (cur === undefined ? null : cur)));
  }, []);

  const onChange = (m: Me) => { setMe(m); writeCache('/me', m); };

  return (
    <HashRouter>
      <StartParamRedirect />
      <SystemBack />
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/partners/:id" element={<PartnerPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/activate/:partnerId" element={<Activate />} />
          <Route path="/profile" element={<Profile me={me} onChange={onChange} />} />
          <Route path="/cabinet" element={<PartnerCabinet />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </Suspense>
      <Nav role={me?.role ?? null} />
    </HashRouter>
  );
}
