// Обёртка над fetch: initData в каждом запросе (валидация HMAC на бэке).
import { retrieveRawInitData } from '@telegram-apps/sdk-react';

const BASE = import.meta.env.VITE_API_URL ?? '';

let initDataRaw = '';
try {
  initDataRaw = retrieveRawInitData() ?? '';
} catch {
  // вне Telegram (dev в браузере) — запросы вернут 401, экраны покажут заглушку
}

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : JSON.stringify(detail));
    this.status = status;
    this.detail = detail;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `tma ${initDataRaw}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json()).detail;
    } catch { /* не JSON */ }
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

// --- Типы ответов ---------------------------------------------------------

export interface Partner {
  id: number;
  name: string;
  category: string | null;
  address: string | null;
  discount_free: number;
  discount_premium: number;
  work_hours: string | null;
  logo_url: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface DailyDeal {
  id: number;
  name: string;
  address: string | null;
  discount_free: number;
  logo_url: string | null;
  description: string | null;
}

export interface Me {
  id: number;
  full_name: string | null;
  role: 'buyer' | 'partner' | 'admin';
  notify_daily: boolean;
  subscription: { active: boolean; days_left: number | null; pending: boolean };
  visits: number;
  saved: number;
  daily_sign: string;
}

export interface Visit {
  name: string;
  used_at: string;
  discount: number;
}

export interface Activation {
  partner_name: string;
  discount: number;
  kind: 'daily' | 'premium';
  client_name: string | null;
  daily_sign: string;
  server_time: string;
  expires_at: string;
}
