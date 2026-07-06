import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Placeholder } from '@telegram-apps/telegram-ui';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { openLink } from '@telegram-apps/sdk-react';
import { api, type Partner } from './../api';
import { useMainButton } from './../hooks';
import { markerIcon } from './leafletIcon';

export default function PartnerPage() {
  const { id } = useParams();
  const [partner, setPartner] = useState<Partner | null | undefined>(undefined);

  useEffect(() => {
    api<Partner>(`/partners/${id}`).then(setPartner).catch(() => setPartner(null));
  }, [id]);

  const route2gis = () => {
    if (!partner) return;
    // 2GIS — стандарт в Казахстане (раздел 4.5)
    const query = encodeURIComponent(`${partner.name} ${partner.address ?? 'Экибастуз'}`);
    try { openLink(`https://2gis.kz/search/${query}`); }
    catch { window.open(`https://2gis.kz/search/${query}`); }
  };

  // Главное действие — системная кнопка Telegram
  useMainButton('Маршрут в 2GIS', route2gis, { visible: !!partner });

  if (partner === undefined)
    return (
      <div className="vg-page">
        <div className="vg-skel vg-skel-hero" />
        <div className="vg-skel vg-skel-card" />
      </div>
    );
  if (partner === null) return <Placeholder header="Не найдено" description="Заведение недоступно" />;

  return (
    <div className="vg-page vg-stagger">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 2px 4px' }}>
        {partner.logo_url
          ? <img className="vg-logo" style={{ width: 64, height: 64, borderRadius: 18 }} src={partner.logo_url} alt="" />
          : <div className="vg-logo" style={{ width: 64, height: 64, borderRadius: 18, fontSize: 26 }}>{partner.name[0]}</div>}
        <div>
          <div className="vg-display" style={{ fontWeight: 700, fontSize: 20, color: 'var(--tgui--text_color)' }}>
            {partner.name}
          </div>
          {partner.category && (
            <div style={{ fontSize: 13, color: 'var(--tgui--hint_color)', marginTop: 2 }}>
              {partner.category}
            </div>
          )}
        </div>
      </div>

      <div className="vg-stat-grid" style={{ marginTop: 12 }}>
        <div className="vg-stat">
          <div className="vg-stat-num" style={{ color: 'var(--vg-accent)' }}>−{partner.discount_premium}%</div>
          <div className="vg-stat-cap">по подписке</div>
        </div>
        <div className="vg-stat">
          <div className="vg-stat-num">−{partner.discount_free}%</div>
          <div className="vg-stat-cap">по скидке дня, всем</div>
        </div>
      </div>

      {(partner.address || partner.work_hours) && (
        <div className="vg-card" style={{ marginTop: 12, cursor: 'default' }}>
          <div className="vg-card-body">
            {partner.address && <div className="vg-card-name">{partner.address}</div>}
            {partner.work_hours && <div className="vg-card-meta">{partner.work_hours}</div>}
          </div>
        </div>
      )}

      {partner.lat && partner.lng && (
        <div style={{ borderRadius: 'var(--vg-radius)', overflow: 'hidden', marginTop: 2 }}>
          <MapContainer center={[partner.lat, partner.lng]} zoom={16} style={{ height: 190 }}
                        dragging={false} zoomControl={false}>
            <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                       attribution="© OpenStreetMap" />
            <Marker position={[partner.lat, partner.lng]} icon={markerIcon} />
          </MapContainer>
        </div>
      )}

      {/* «Маршрут в 2GIS» — системной MainButton внизу */}
      <div className="vg-empty" style={{ padding: '18px 16px' }}>
        Для скидки отсканируйте QR на кассе заведения
      </div>
    </div>
  );
}
