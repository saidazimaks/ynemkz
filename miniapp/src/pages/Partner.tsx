import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Avatar, Button, Cell, List, Placeholder, Section, Spinner } from '@telegram-apps/telegram-ui';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { openLink } from '@telegram-apps/sdk-react';
import { api, type Partner } from './../api';
import { markerIcon } from './leafletIcon';

export default function PartnerPage() {
  const { id } = useParams();
  const [partner, setPartner] = useState<Partner | null | undefined>(undefined);

  useEffect(() => {
    api<Partner>(`/partners/${id}`).then(setPartner).catch(() => setPartner(null));
  }, [id]);

  if (partner === undefined) return <Spinner size="l" />;
  if (partner === null) return <Placeholder header="Не найдено" description="Заведение недоступно" />;

  const route2gis = () => {
    // 2GIS — стандарт в Казахстане (раздел 4.5)
    const query = encodeURIComponent(`${partner.name} ${partner.address ?? 'Экибастуз'}`);
    try { openLink(`https://2gis.kz/search/${query}`); }
    catch { window.open(`https://2gis.kz/search/${query}`); }
  };

  return (
    <List>
      <Section header={partner.name}>
        {partner.logo_url && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
            <Avatar size={96} src={partner.logo_url} acronym={partner.name[0]} />
          </div>
        )}
        <Cell subtitle="Скидка по подписке" after={<b>−{partner.discount_premium}%</b>}>Подписчикам</Cell>
        <Cell subtitle="По скидке дня" after={<b>−{partner.discount_free}%</b>}>Всем</Cell>
        {partner.address && <Cell subtitle={partner.work_hours ?? ''}>{partner.address}</Cell>}
      </Section>

      {partner.lat && partner.lng && (
        <MapContainer center={[partner.lat, partner.lng]} zoom={16} style={{ height: 200 }}
                      dragging={false} zoomControl={false}>
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                     attribution="© OpenStreetMap" />
          <Marker position={[partner.lat, partner.lng]} icon={markerIcon} />
        </MapContainer>
      )}

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button stretched onClick={route2gis}>Маршрут в 2GIS</Button>
        <Button stretched mode="gray" disabled>
          Для скидки — отсканируйте QR на кассе
        </Button>
      </div>
    </List>
  );
}
