// Дефолтные иконки Leaflet ломаются под бандлерами — собираем явно.
// CSS Leaflet импортируем здесь же: leafletIcon тянут только Map и Partner,
// поэтому стили уезжают в их ленивый чанк, а не в общий index.css.
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

export const markerIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});
