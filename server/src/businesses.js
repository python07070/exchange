import { all, get, parseJson } from './db.js';
import { openState, weekSchedule } from './hours.js';
import { CATEGORIES } from './seed-data.js';

const PLAN_BOOST = { premium: 1.25, featured: 1.12, free: 1 };

export const categoryIndex = new Map(CATEGORIES.map((c) => [c.id, c]));

/** Great-circle distance in kilometres. */
export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Load every business's hours in one query, grouped by business id. */
function hoursByBusiness(ids) {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = all(`SELECT * FROM hours WHERE business_id IN (${placeholders})`, ...ids);
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.business_id)) map.set(row.business_id, []);
    map.get(row.business_id).push(row);
  }
  return map;
}

/** Most recent non-expired update per business, in one query. */
function latestUpdateByBusiness(ids) {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = all(
    `SELECT u.* FROM updates u
     WHERE u.business_id IN (${placeholders})
       AND (u.expires_at IS NULL OR u.expires_at > datetime('now'))
       AND u.id = (
         SELECT id FROM updates
         WHERE business_id = u.business_id
           AND (expires_at IS NULL OR expires_at > datetime('now'))
         ORDER BY created_at DESC, id DESC LIMIT 1
       )`,
    ...ids,
  );
  return new Map(rows.map((r) => [r.business_id, shapeUpdate(r)]));
}

export function shapeUpdate(row, business) {
  return {
    id: row.id,
    businessId: row.business_id,
    kind: row.kind,
    body: row.body,
    photo: row.photo,
    promoted: !!row.promoted,
    views: row.views,
    createdAt: `${row.created_at.replace(' ', 'T')}Z`,
    ...(business
      ? {
          business: {
            id: business.id,
            slug: business.slug,
            name: business.name,
            category: business.category,
            photo: parseJson(business.photos, [])[0] ?? null,
          },
        }
      : {}),
  };
}

export function shapeBusiness(row, { hours = [], origin = null, latestUpdate = null, now = Date.now() } = {}) {
  const status = openState(hours, row.tz_offset, now);
  const photos = parseJson(row.photos, []);
  const category = categoryIndex.get(row.category);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    categoryLabel: category?.label ?? row.category,
    categoryIcon: category?.icon ?? '📍',
    tagline: row.tagline,
    description: row.description,
    address: row.address,
    phone: row.phone,
    website: row.website,
    lat: row.lat,
    lng: row.lng,
    priceLevel: row.price_level,
    rating: row.rating,
    ratingCount: row.rating_count,
    tags: parseJson(row.tags, []),
    photo: photos[0] ?? null,
    photos,
    plan: row.plan,
    verified: !!row.verified,
    isOpen: status.open,
    status,
    latestUpdate,
    distanceKm: origin ? distanceKm(origin.lat, origin.lng, row.lat, row.lng) : null,
  };
}

/**
 * Ranking blends five signals so the list feels like a good local guide rather
 * than a raw database dump: proximity, whether it is open right now, how fresh
 * its latest update is, its rating, and its subscription plan.
 */
function score(business, { hasOrigin }) {
  let s = 1;

  if (hasOrigin && business.distanceKm != null) {
    // Halves roughly every 2km.
    s *= 1 / (1 + business.distanceKm / 2);
  }

  s *= business.isOpen ? 1.35 : 0.8;

  if (business.latestUpdate) {
    const ageHours = (Date.now() - new Date(business.latestUpdate.createdAt).getTime()) / 3_600_000;
    s *= ageHours < 6 ? 1.4 : ageHours < 24 ? 1.25 : ageHours < 72 ? 1.1 : 1;
  }

  s *= 0.7 + (business.rating / 5) * 0.6;
  s *= Math.min(1.15, 1 + Math.log10(1 + business.ratingCount) / 25);
  s *= PLAN_BOOST[business.plan] ?? 1;

  return s;
}

/**
 * @param {object} filters
 * @param {string} [filters.category]
 * @param {boolean} [filters.openNow]
 * @param {string} [filters.q]        free text matched against name/tags/description
 * @param {string[]} [filters.tags]   all-of tag match (used by the NL interpreter)
 * @param {number} [filters.maxPrice]
 * @param {number} [filters.minRating]
 * @param {{lat:number,lng:number}} [filters.origin]
 * @param {number} [filters.radiusKm]
 * @param {'relevance'|'distance'|'rating'|'updated'} [filters.sort]
 * @param {number} [filters.limit]
 */
export function findBusinesses(filters = {}) {
  const where = [];
  const params = [];

  if (filters.category) {
    where.push('category = ?');
    params.push(filters.category);
  }
  if (filters.maxPrice) {
    where.push('price_level <= ?');
    params.push(filters.maxPrice);
  }
  if (filters.minRating) {
    where.push('rating >= ?');
    params.push(filters.minRating);
  }
  if (filters.q) {
    // Match every word somewhere in the record rather than the whole phrase
    // verbatim, so "golden wok noodles" still finds Golden Wok.
    for (const word of String(filters.q).split(/\s+/).filter(Boolean).slice(0, 6)) {
      where.push('(name LIKE ? OR tagline LIKE ? OR description LIKE ? OR tags LIKE ? OR category LIKE ?)');
      const like = `%${word}%`;
      params.push(like, like, like, like, like);
    }
  }

  const sql = `SELECT * FROM businesses${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
  let rows = all(sql, ...params);

  // How many of the requested tags each business hits. A business is kept if it
  // matches any of them, but the count is remembered: "cheap tacos late night"
  // must not put a 24-hour pharmacy above the taqueria just because both are
  // open late.
  const tagMatches = new Map();
  if (filters.tags?.length) {
    const wanted = filters.tags.map((t) => t.toLowerCase());
    rows = rows.filter((row) => {
      const haystack =
        `${row.name} ${row.tagline ?? ''} ${row.description ?? ''} ${row.tags} ${row.category}`.toLowerCase();
      const hits = wanted.filter((tag) => haystack.includes(tag)).length;
      if (hits > 0) tagMatches.set(row.id, hits);
      return hits > 0;
    });
  }

  const ids = rows.map((r) => r.id);
  const hoursMap = hoursByBusiness(ids);
  const updateMap = latestUpdateByBusiness(ids);

  let shaped = rows.map((row) =>
    shapeBusiness(row, {
      hours: hoursMap.get(row.id) ?? [],
      origin: filters.origin ?? null,
      latestUpdate: updateMap.get(row.id) ?? null,
    }),
  );

  if (filters.openNow) shaped = shaped.filter((b) => b.isOpen);
  if (filters.origin && filters.radiusKm) {
    shaped = shaped.filter((b) => b.distanceKm != null && b.distanceKm <= filters.radiusKm);
  }

  const hasOrigin = Boolean(filters.origin);
  switch (filters.sort) {
    case 'distance':
      shaped.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
      break;
    case 'rating':
      shaped.sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount);
      break;
    case 'updated':
      shaped.sort(
        (a, b) =>
          new Date(b.latestUpdate?.createdAt ?? 0).getTime() -
          new Date(a.latestUpdate?.createdAt ?? 0).getTime(),
      );
      break;
    default:
      shaped.sort(
        (a, b) =>
          // Businesses matching more of the asked-for tags come first; the
          // blended score orders everything within a tier.
          (tagMatches.get(b.id) ?? 0) - (tagMatches.get(a.id) ?? 0) ||
          score(b, { hasOrigin }) - score(a, { hasOrigin }),
      );
  }

  return filters.limit ? shaped.slice(0, filters.limit) : shaped;
}

/** Full detail payload for a single business page. */
export function getBusinessDetail(idOrSlug, origin = null) {
  const row =
    get('SELECT * FROM businesses WHERE slug = ?', String(idOrSlug)) ??
    get('SELECT * FROM businesses WHERE id = ?', Number(idOrSlug) || -1);
  if (!row) return null;

  const hours = all('SELECT * FROM hours WHERE business_id = ? ORDER BY dow', row.id);
  const updates = all(
    `SELECT * FROM updates WHERE business_id = ?
       AND (expires_at IS NULL OR expires_at > datetime('now'))
     ORDER BY created_at DESC, id DESC LIMIT 20`,
    row.id,
  ).map((u) => shapeUpdate(u));
  const reviews = all(
    'SELECT id, author, rating, body, created_at FROM reviews WHERE business_id = ? ORDER BY created_at DESC LIMIT 20',
    row.id,
  ).map((r) => ({
    id: r.id,
    author: r.author,
    rating: r.rating,
    body: r.body,
    createdAt: `${r.created_at.replace(' ', 'T')}Z`,
  }));

  return {
    ...shapeBusiness(row, { hours, origin, latestUpdate: updates[0] ?? null }),
    week: weekSchedule(hours, row.tz_offset),
    updates,
    reviews,
  };
}
