// Vékony fetch wrapper. A JWT httpOnly sütiben utazik – JS-ből nem érjük el,
// a böngésző küldi automatikusan (credentials: 'same-origin').

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `HTTP ${status}`);
    this.status = status;
    this.details = body?.details;
  }
}

async function request(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) {
      window.dispatchEvent(new Event('auth:expired'));
    }
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body ?? {}),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
};

const huf = new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 });
export const formatHuf = (v) => huf.format(Number(v || 0));
export const formatDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('hu-HU') : '');

export const STATUS_LABELS = {
  draft: 'Piszkozat',
  sent: 'Elküldve',
  accepted: 'Elfogadva',
  rejected: 'Elutasítva',
  expired: 'Lejárt',
};
