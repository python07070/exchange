const TOKEN_KEY = 'bf.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

/** Build a query string, dropping empty values so URLs stay readable. */
function qs(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export const api = {
  meta: () => request('/meta'),

  businesses: (params) => request(`/businesses${qs(params)}`),
  search: (params) => request(`/search${qs(params)}`),
  business: (idOrSlug, params) => request(`/businesses/${idOrSlug}${qs(params)}`),
  interaction: (id, type) => request(`/businesses/${id}/interaction`, { method: 'POST', body: { type } }),

  updates: (params) => request(`/updates${qs(params)}`),

  register: (body) => request('/auth/register', { method: 'POST', body, auth: false }),
  login: (body) => request('/auth/login', { method: 'POST', body, auth: false }),
  me: () => request('/auth/me'),

  favourites: (params) => request(`/favourites${qs(params)}`),
  addFavourite: (id) => request(`/favourites/${id}`, { method: 'PUT' }),
  removeFavourite: (id) => request(`/favourites/${id}`, { method: 'DELETE' }),

  notifications: () => request('/notifications'),
  markNotificationsSeen: () => request('/notifications/seen', { method: 'POST' }),

  ownerBusinesses: () => request('/owner/businesses'),
  insights: (id) => request(`/owner/businesses/${id}/insights`),
  ownerUpdates: (id) => request(`/owner/businesses/${id}/updates`),
  postUpdate: (id, body) => request(`/owner/businesses/${id}/updates`, { method: 'POST', body }),
  deleteUpdate: (id, updateId) => request(`/owner/businesses/${id}/updates/${updateId}`, { method: 'DELETE' }),
  updateProfile: (id, body) => request(`/owner/businesses/${id}`, { method: 'PATCH', body }),
};
