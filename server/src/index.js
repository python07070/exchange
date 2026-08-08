import express from 'express';
import cors from 'cors';

import { config } from './config.js';
import { all, get, run } from './db.js';
import { seed, isSeeded } from './seed.js';
import { CATEGORIES } from './seed-data.js';
import { findBusinesses, getBusinessDetail, shapeUpdate, shapeBusiness } from './businesses.js';
import { interpretQuery, aiSearchEnabled } from './search.js';
import {
  hashPassword,
  verifyPassword,
  signToken,
  authOptional,
  authRequired,
  ownerRequired,
  publicUser,
} from './auth.js';

// First boot populates the demo dataset so the app is never empty.
if (!isSeeded()) {
  const result = seed();
  console.log(`Seeded ${result.businesses} demo businesses around ${config.seedCenter.label}.`);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(authOptional);

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Pull an optional {lat,lng} origin off the query string. */
function originFrom(query) {
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function logEvent(businessId, type) {
  try {
    run('INSERT INTO events (business_id, type) VALUES (?, ?)', businessId, type);
  } catch {
    /* analytics must never break a request */
  }
}

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

app.get('/api/meta', (req, res) => {
  res.json({
    city: config.seedCenter.label,
    center: { lat: config.seedCenter.lat, lng: config.seedCenter.lng },
    categories: CATEGORIES,
    aiSearch: aiSearchEnabled(),
    counts: {
      businesses: get('SELECT COUNT(*) AS n FROM businesses').n,
      updates: get('SELECT COUNT(*) AS n FROM updates').n,
    },
  });
});

/* ------------------------------------------------------------------ */
/* Discovery                                                           */
/* ------------------------------------------------------------------ */

app.get('/api/businesses', (req, res) => {
  const origin = originFrom(req.query);
  const businesses = findBusinesses({
    category: req.query.category || undefined,
    openNow: req.query.openNow === 'true',
    q: req.query.q || undefined,
    maxPrice: Number(req.query.maxPrice) || undefined,
    minRating: Number(req.query.minRating) || undefined,
    origin,
    radiusKm: Number(req.query.radiusKm) || undefined,
    sort: req.query.sort || 'relevance',
    limit: Number(req.query.limit) || undefined,
  });
  res.json({ businesses, total: businesses.length });
});

/**
 * Natural-language search. Returns the businesses *and* the interpretation, so
 * the UI can show the customer how their words were understood.
 */
app.get(
  '/api/search',
  asyncRoute(async (req, res) => {
    const query = String(req.query.q || '').trim();
    const origin = originFrom(req.query);

    if (!query) {
      const businesses = findBusinesses({ origin, sort: origin ? 'distance' : 'relevance', limit: 40 });
      return res.json({ query, interpretation: null, businesses, total: businesses.length });
    }

    const interpretation = await interpretQuery(query);
    const businesses = findBusinesses({
      category: interpretation.category,
      tags: interpretation.tags,
      openNow: interpretation.openNow,
      q: interpretation.q,
      maxPrice: interpretation.maxPrice,
      minRating: interpretation.minRating,
      origin,
      sort: interpretation.sort ?? 'relevance',
      limit: 40,
    });

    // A confident filter that finds nothing is worse than a looser match, so
    // peel constraints off in order of how likely they are to be the blocker
    // until something comes back. A dead end is never a useful answer.
    const fallbacks = [
      // Drop the hard constraints, keep what the query was actually about.
      { category: interpretation.category, tags: interpretation.tags, q: interpretation.q },
      // Then the subject alone.
      { category: interpretation.category },
      // Then simply what is nearby.
      {},
    ];

    let results = businesses;
    let relaxed = false;
    for (const fallback of fallbacks) {
      if (results.length > 0) break;
      relaxed = true;
      results = findBusinesses({ ...fallback, origin, sort: 'relevance', limit: 40 });
    }

    for (const b of results.slice(0, 10)) logEvent(b.id, 'search_hit');

    res.json({
      query,
      interpretation: {
        explanation: interpretation.explanation,
        source: interpretation.source,
        category: interpretation.category ?? null,
        tags: interpretation.tags ?? [],
        openNow: !!interpretation.openNow,
        sort: interpretation.sort ?? 'relevance',
        relaxed,
      },
      businesses: results,
      total: results.length,
    });
  }),
);

app.get('/api/businesses/:idOrSlug', (req, res) => {
  const detail = getBusinessDetail(req.params.idOrSlug, originFrom(req.query));
  if (!detail) return res.status(404).json({ error: 'Business not found.' });

  logEvent(detail.id, 'view');

  const favourited = req.user
    ? Boolean(get('SELECT 1 AS x FROM favourites WHERE user_id = ? AND business_id = ?', req.user.id, detail.id))
    : false;

  res.json({ business: { ...detail, favourited } });
});

/** Records a call / directions tap so owners can see what the listing drives. */
app.post('/api/businesses/:id/interaction', (req, res) => {
  const type = ['call', 'directions', 'update_view'].includes(req.body?.type) ? req.body.type : null;
  if (!type) return res.status(400).json({ error: 'Unknown interaction type.' });
  const business = get('SELECT id FROM businesses WHERE id = ?', Number(req.params.id));
  if (!business) return res.status(404).json({ error: 'Business not found.' });
  logEvent(business.id, type);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Live updates feed                                                   */
/* ------------------------------------------------------------------ */

app.get('/api/updates', (req, res) => {
  const origin = originFrom(req.query);
  const limit = Math.min(Number(req.query.limit) || 30, 100);

  const rows = all(
    `SELECT u.*, b.slug, b.name, b.category, b.photos, b.lat, b.lng
       FROM updates u
       JOIN businesses b ON b.id = u.business_id
      WHERE (u.expires_at IS NULL OR u.expires_at > datetime('now'))
        ${req.query.category ? 'AND b.category = ?' : ''}
      ORDER BY u.promoted DESC, u.created_at DESC
      LIMIT ?`,
    ...(req.query.category ? [req.query.category] : []),
    limit,
  );

  const updates = rows.map((row) =>
    shapeUpdate(row, {
      id: row.business_id,
      slug: row.slug,
      name: row.name,
      category: row.category,
      photos: row.photos,
    }),
  );

  res.json({ updates, origin });
});

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

app.post('/api/auth/register', (req, res) => {
  const { email, password, name, role } = req.body ?? {};
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Name, email and password are all required.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Please use a password of at least 8 characters.' });
  }
  if (get('SELECT 1 AS x FROM users WHERE email = ?', String(email).toLowerCase())) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const id = run(
    'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
    String(email).toLowerCase(),
    name,
    hashPassword(String(password)),
    role === 'owner' ? 'owner' : 'customer',
  ).lastInsertRowid;

  const user = get('SELECT id, email, name, role FROM users WHERE id = ?', id);
  res.status(201).json({ user: publicUser(user), token: signToken({ sub: user.id }) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};
  const user = get('SELECT * FROM users WHERE email = ?', String(email || '').toLowerCase());
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Those details do not match an account.' });
  }
  res.json({ user: publicUser(user), token: signToken({ sub: user.id }) });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

/* ------------------------------------------------------------------ */
/* Favourites + notifications                                          */
/* ------------------------------------------------------------------ */

app.get('/api/favourites', authRequired, (req, res) => {
  const rows = all(
    `SELECT b.* FROM favourites f
       JOIN businesses b ON b.id = f.business_id
      WHERE f.user_id = ? ORDER BY f.created_at DESC`,
    req.user.id,
  );
  const ids = rows.map((r) => r.id);
  const businesses = ids.length
    ? findBusinesses({ origin: originFrom(req.query) }).filter((b) => ids.includes(b.id))
    : [];
  res.json({ businesses });
});

app.put('/api/favourites/:businessId', authRequired, (req, res) => {
  const id = Number(req.params.businessId);
  if (!get('SELECT 1 AS x FROM businesses WHERE id = ?', id)) {
    return res.status(404).json({ error: 'Business not found.' });
  }
  run('INSERT OR IGNORE INTO favourites (user_id, business_id) VALUES (?, ?)', req.user.id, id);
  logEvent(id, 'favourite');
  res.json({ favourited: true });
});

app.delete('/api/favourites/:businessId', authRequired, (req, res) => {
  run('DELETE FROM favourites WHERE user_id = ? AND business_id = ?', req.user.id, Number(req.params.businessId));
  res.json({ favourited: false });
});

/** Updates posted by the places this customer follows — the notification feed. */
app.get('/api/notifications', authRequired, (req, res) => {
  const rows = all(
    `SELECT u.*, b.slug, b.name, b.category, b.photos
       FROM updates u
       JOIN businesses b ON b.id = u.business_id
       JOIN favourites f ON f.business_id = b.id
      WHERE f.user_id = ?
        AND (u.expires_at IS NULL OR u.expires_at > datetime('now'))
      ORDER BY u.created_at DESC
      LIMIT 40`,
    req.user.id,
  );

  const seenAt = req.user.seen_feed_at ? new Date(`${req.user.seen_feed_at.replace(' ', 'T')}Z`) : null;
  const notifications = rows.map((row) => {
    const update = shapeUpdate(row, {
      id: row.business_id,
      slug: row.slug,
      name: row.name,
      category: row.category,
      photos: row.photos,
    });
    return { ...update, unread: !seenAt || new Date(update.createdAt) > seenAt };
  });

  res.json({ notifications, unreadCount: notifications.filter((n) => n.unread).length });
});

app.post('/api/notifications/seen', authRequired, (req, res) => {
  run("UPDATE users SET seen_feed_at = datetime('now') WHERE id = ?", req.user.id);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Business owner dashboard                                            */
/* ------------------------------------------------------------------ */

function ownedBusiness(req, res) {
  const business = get(
    'SELECT * FROM businesses WHERE id = ? AND owner_id = ?',
    Number(req.params.id),
    req.user.id,
  );
  if (!business) {
    res.status(404).json({ error: 'That business is not on your account.' });
    return null;
  }
  return business;
}

app.get('/api/owner/businesses', ownerRequired, (req, res) => {
  const rows = all('SELECT id FROM businesses WHERE owner_id = ?', req.user.id);
  const ids = new Set(rows.map((r) => r.id));
  const businesses = findBusinesses({}).filter((b) => ids.has(b.id));
  res.json({ businesses });
});

/** Aggregated insights: 14-day trend plus headline numbers. */
app.get('/api/owner/businesses/:id/insights', ownerRequired, (req, res) => {
  const business = ownedBusiness(req, res);
  if (!business) return;

  const daily = all(
    `SELECT date(created_at) AS day,
            SUM(type = 'view')       AS views,
            SUM(type = 'directions') AS directions,
            SUM(type = 'call')       AS calls,
            SUM(type = 'search_hit') AS searchHits
       FROM events
      WHERE business_id = ? AND created_at >= datetime('now', '-14 days')
      GROUP BY day ORDER BY day`,
    business.id,
  );

  const totals = daily.reduce(
    (acc, d) => ({
      views: acc.views + (d.views ?? 0),
      directions: acc.directions + (d.directions ?? 0),
      calls: acc.calls + (d.calls ?? 0),
      searchHits: acc.searchHits + (d.searchHits ?? 0),
    }),
    { views: 0, directions: 0, calls: 0, searchHits: 0 },
  );

  const half = Math.floor(daily.length / 2) || 1;
  const firstHalf = daily.slice(0, half).reduce((n, d) => n + (d.views ?? 0), 0);
  const secondHalf = daily.slice(half).reduce((n, d) => n + (d.views ?? 0), 0);
  const trend = firstHalf ? Math.round(((secondHalf - firstHalf) / firstHalf) * 100) : 0;

  const topUpdates = all(
    `SELECT id, kind, body, views, created_at FROM updates
      WHERE business_id = ? ORDER BY views DESC LIMIT 5`,
    business.id,
  ).map((u) => ({ ...u, createdAt: `${u.created_at.replace(' ', 'T')}Z` }));

  res.json({
    business: { id: business.id, name: business.name, plan: business.plan },
    totals,
    trend,
    followers: get('SELECT COUNT(*) AS n FROM favourites WHERE business_id = ?', business.id).n,
    daily: daily.map((d) => ({
      day: d.day,
      views: d.views ?? 0,
      directions: d.directions ?? 0,
      calls: d.calls ?? 0,
      searchHits: d.searchHits ?? 0,
    })),
    topUpdates,
  });
});

app.get('/api/owner/businesses/:id/updates', ownerRequired, (req, res) => {
  const business = ownedBusiness(req, res);
  if (!business) return;
  const updates = all(
    'SELECT * FROM updates WHERE business_id = ? ORDER BY created_at DESC LIMIT 50',
    business.id,
  ).map((u) => shapeUpdate(u));
  res.json({ updates });
});

app.post('/api/owner/businesses/:id/updates', ownerRequired, (req, res) => {
  const business = ownedBusiness(req, res);
  if (!business) return;

  const body = String(req.body?.body || '').trim();
  if (body.length < 8) {
    return res.status(400).json({ error: 'Write at least a sentence so customers know what is happening.' });
  }
  if (body.length > 400) {
    return res.status(400).json({ error: 'Keep updates under 400 characters — short posts get read.' });
  }

  const kind = ['offer', 'new', 'event', 'stock', 'news'].includes(req.body?.kind) ? req.body.kind : 'news';
  const hours = Number(req.body?.expiresInHours);
  const expiresAt = Number.isFinite(hours) && hours > 0
    ? new Date(Date.now() + hours * 3_600_000).toISOString().slice(0, 19).replace('T', ' ')
    : null;

  // Promotion is the paid lever: only premium/featured accounts can boost.
  const promoted = req.body?.promoted && business.plan !== 'free' ? 1 : 0;

  const id = run(
    'INSERT INTO updates (business_id, kind, body, promoted, expires_at) VALUES (?, ?, ?, ?, ?)',
    business.id,
    kind,
    body,
    promoted,
    expiresAt,
  ).lastInsertRowid;

  res.status(201).json({ update: shapeUpdate(get('SELECT * FROM updates WHERE id = ?', id)) });
});

app.delete('/api/owner/businesses/:id/updates/:updateId', ownerRequired, (req, res) => {
  const business = ownedBusiness(req, res);
  if (!business) return;
  run('DELETE FROM updates WHERE id = ? AND business_id = ?', Number(req.params.updateId), business.id);
  res.json({ ok: true });
});

app.patch('/api/owner/businesses/:id', ownerRequired, (req, res) => {
  const business = ownedBusiness(req, res);
  if (!business) return;

  const fields = ['tagline', 'description', 'phone', 'website', 'address'];
  const updates = fields.filter((f) => typeof req.body?.[f] === 'string');
  if (updates.length) {
    run(
      `UPDATE businesses SET ${updates.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
      ...updates.map((f) => req.body[f]),
      business.id,
    );
  }

  const hours = all('SELECT * FROM hours WHERE business_id = ? ORDER BY dow', business.id);
  const row = get('SELECT * FROM businesses WHERE id = ?', business.id);
  res.json({ business: shapeBusiness(row, { hours }) });
});

/* ------------------------------------------------------------------ */

app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.path}` }));

app.use((err, req, res, _next) => {
  console.error('[api]', err);
  res.status(500).json({ error: 'Something went wrong on our side.' });
});

app.listen(config.port, () => {
  console.log(`Business Finder API listening on http://localhost:${config.port}`);
  console.log(
    aiSearchEnabled()
      ? `Natural-language search: Claude (${config.anthropicModel})`
      : 'Natural-language search: built-in interpreter (set ANTHROPIC_API_KEY to upgrade)',
  );
});
