import { useNavigate } from 'react-router-dom';
import { Spinner } from '@telegram-apps/telegram-ui';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { type Partner } from './../api';
import { useCachedApi } from './../hooks';
import { markerIcon } from './leafletIcon';

const EKIBASTUZ: [number, number] = [51.7298, 75.3266];

function LocateButton() {
  const map = useMap();
  const locate = () => {
    navigator.geolocation?.getCurrentPosition((pos) =>
      map.setView([pos.coords.latitude, pos.coords.longitude], 15),
    );
  };
  return (
    <button className="vg-locate" onClick={locate}>Рядом со мной</button>
  );
}

export default function MapPage() {
  const navigate = useNavigate();
  // undefined — грузим точки, null — ошибка сети (карта при этом работает).
  // useCachedApi: точки из кэша рисуются мгновенно, свежий запрос — только
  // если прошлый ответ старше TTL (переключение вкладок не дёргает сеть).
  const [pins, retryPins] = useCachedApi<Partner[]>('/map');

  // Партнёры без координат на карту не попадают
  const shown = (pins ?? []).filter((p) => p.lat != null && p.lng != null);

  return (
    <div className="map-full">
      <MapContainer center={EKIBASTUZ} zoom={13} style={{ height: '100%' }}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                   attribution="© OpenStreetMap" />
        {shown.map((p) => (
          <Marker key={p.id} position={[p.lat!, p.lng!]} icon={markerIcon}>
            <Popup>
              <b>{p.name}</b> — −{p.discount_premium}%
              <br />{p.address}
              <br /><a onClick={() => navigate(`/partners/${p.id}`)}>Подробнее</a>
            </Popup>
          </Marker>
        ))}
        <LocateButton />
      </MapContainer>

      {/* Статус загрузки точек — плашкой поверх карты, сама карта живая */}
      {pins === undefined && (
        <div className="vg-map-note">
          <Spinner size="s" />
          Загружаем заведения…
        </div>
      )}
      {pins === null && (
        <div className="vg-map-note">
          Точки не загрузились.
          <button onClick={retryPins}>Повторить</button>
        </div>
      )}
      {pins !== undefined && pins !== null && shown.length === 0 && (
        <div className="vg-map-note">На карте пока нет заведений</div>
      )}
    </div>
  );
}
