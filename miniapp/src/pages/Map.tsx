import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { api, type Partner } from './../api';
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
  const [pins, setPins] = useState<Partner[]>([]);

  useEffect(() => {
    api<Partner[]>('/map').then(setPins).catch(() => {});
  }, []);

  return (
    <div className="map-full">
      <MapContainer center={EKIBASTUZ} zoom={13} style={{ height: '100%' }}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                   attribution="© OpenStreetMap" />
        {pins.map((p) => (
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
    </div>
  );
}
