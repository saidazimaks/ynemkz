// Сканирование QR-наклейки партнёра системным сканером Telegram.
// Используется на карточке заведения и на экране «Мой QR».
import { qrScanner } from '@telegram-apps/sdk-react';

const STICKER_RE = /(?:startapp|start)=p_(\d+)/;

/** Открыть сканер и поймать наклейку партнёра (=p_<id>) → экран активации.
 *  Ловим только партнёрские deep link'и: активируется то заведение, чей QR
 *  отсканирован. false — сканер недоступен (десктоп/старый клиент). */
export async function scanPartnerSticker(navigate: (to: string) => void): Promise<boolean> {
  if (!qrScanner.open.isAvailable()) return false;
  const content = await qrScanner.open({
    text: 'Наведите на QR-наклейку на кассе',
    capture: (q) => STICKER_RE.test(q),
  });
  const m = content ? STICKER_RE.exec(content) : null;
  if (m) navigate(`/activate/${m[1]}`);
  return true;
}
