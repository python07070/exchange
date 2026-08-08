import { db, run, get } from './db.js';
import { config } from './config.js';
import { hashPassword } from './auth.js';
import { BUSINESSES, HOUR_PRESETS, REVIEW_FALLBACKS } from './seed-data.js';

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** SQLite-friendly UTC timestamp, `n` minutes in the past. */
const minutesAgo = (n) =>
  new Date(Date.now() - n * 60_000).toISOString().slice(0, 19).replace('T', ' ');

const photosFor = (slug) =>
  JSON.stringify([
    `https://picsum.photos/seed/${slug}-a/1200/800`,
    `https://picsum.photos/seed/${slug}-b/1200/800`,
    `https://picsum.photos/seed/${slug}-c/1200/800`,
  ]);

export function isSeeded() {
  return (get('SELECT COUNT(*) AS n FROM businesses')?.n ?? 0) > 0;
}

export function seed({ force = false } = {}) {
  if (isSeeded() && !force) return { skipped: true };

  db.exec(`
    DELETE FROM events;
    DELETE FROM reviews;
    DELETE FROM favourites;
    DELETE FROM updates;
    DELETE FROM hours;
    DELETE FROM businesses;
    DELETE FROM users;
    DELETE FROM sqlite_sequence WHERE name IN
      ('events','reviews','updates','hours','businesses','users');
  `);

  /* ---------------- demo accounts ---------------- */

  const password = hashPassword('demo1234');

  const ownerId = run(
    'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
    'owner@demo.test',
    'Jordan Lee',
    password,
    'owner',
  ).lastInsertRowid;

  const customerId = run(
    'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
    'customer@demo.test',
    'Sam Rivers',
    password,
    'customer',
  ).lastInsertRowid;

  /* ---------------- businesses ---------------- */

  const { lat: baseLat, lng: baseLng, tzOffsetMinutes } = config.seedCenter;

  const insertBusiness = db.prepare(`
    INSERT INTO businesses
      (slug, owner_id, name, category, tagline, description, address, phone, website,
       lat, lng, tz_offset, price_level, rating, rating_count, tags, photos, plan, verified)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insertHours = db.prepare(
    'INSERT INTO hours (business_id, dow, opens, closes, closed) VALUES (?,?,?,?,?)',
  );
  const insertUpdate = db.prepare(
    'INSERT INTO updates (business_id, kind, body, promoted, views, created_at) VALUES (?,?,?,?,?,?)',
  );
  const insertReview = db.prepare(
    'INSERT INTO reviews (business_id, author, rating, body, created_at) VALUES (?,?,?,?,?)',
  );
  const insertEvent = db.prepare(
    'INSERT INTO events (business_id, type, created_at) VALUES (?,?,?)',
  );

  // The demo owner runs the first four businesses so the dashboard has content.
  const OWNED = new Set(['golden-wok', 'sunrise-bakery', 'the-corner-cup', 'market-fresh-grocers']);

  let businessCount = 0;

  for (const b of BUSINESSES) {
    const id = insertBusiness.run(
      b.slug,
      OWNED.has(b.slug) ? ownerId : null,
      b.name,
      b.category,
      b.tagline ?? null,
      b.description ?? null,
      b.address ?? null,
      b.phone ?? null,
      b.website ?? null,
      baseLat + b.d[0],
      baseLng + b.d[1],
      tzOffsetMinutes,
      b.price ?? 2,
      b.rating ?? 0,
      b.ratingCount ?? 0,
      JSON.stringify(b.tags ?? []),
      photosFor(b.slug),
      b.plan ?? 'free',
      b.verified ? 1 : 0,
    ).lastInsertRowid;

    const preset = HOUR_PRESETS[b.hours] ?? HOUR_PRESETS.standard;
    for (let dow = 0; dow < 7; dow += 1) {
      const slot = preset[dow];
      if (!slot) {
        insertHours.run(id, dow, null, null, 1);
      } else {
        insertHours.run(id, dow, toMinutes(slot[0]), toMinutes(slot[1]), 0);
      }
    }

    for (const [ago, kind, body, opts] of b.updates ?? []) {
      insertUpdate.run(
        id,
        kind,
        body,
        opts?.promoted ? 1 : 0,
        // Plausible view counts: newer posts have had less time to accumulate.
        Math.max(12, Math.round((10080 - Math.min(ago, 10000)) / 14)),
        minutesAgo(ago),
      );
    }

    const reviews = (b.reviews ?? []).length ? b.reviews : REVIEW_FALLBACKS.slice(0, 2);
    reviews.forEach(([author, rating, text], i) => {
      insertReview.run(id, author, rating, text, minutesAgo(1440 * (i + 2) + i * 37));
    });

    // Two weeks of interaction history so the owner insights panel has a trend.
    const popularity = { premium: 46, featured: 28, free: 14 }[b.plan ?? 'free'];
    for (let day = 13; day >= 0; day -= 1) {
      const weekendBoost = [5, 6].includes((new Date(Date.now() - day * 86_400_000)).getUTCDay()) ? 1.6 : 1;
      const views = Math.round(popularity * weekendBoost * (0.7 + ((day * 37) % 11) / 18));
      for (let v = 0; v < views; v += 1) {
        insertEvent.run(id, 'view', minutesAgo(day * 1440 + ((v * 53) % 1400)));
      }
      for (let v = 0; v < Math.max(1, Math.round(views / 9)); v += 1) {
        insertEvent.run(id, 'directions', minutesAgo(day * 1440 + ((v * 91) % 1400)));
      }
      for (let v = 0; v < Math.max(1, Math.round(views / 14)); v += 1) {
        insertEvent.run(id, 'call', minutesAgo(day * 1440 + ((v * 71) % 1400)));
      }
    }

    businessCount += 1;
  }

  /* ---------------- a few favourites for the demo customer ---------------- */

  for (const slug of ['sunrise-bakery', 'the-corner-cup', 'scoop-and-swirl']) {
    const b = get('SELECT id FROM businesses WHERE slug = ?', slug);
    if (b) {
      run('INSERT OR IGNORE INTO favourites (user_id, business_id) VALUES (?, ?)', customerId, b.id);
    }
  }

  return { skipped: false, businesses: businessCount };
}

// `npm run seed` re-seeds from scratch.
if (process.argv.includes('--force') || process.argv[1]?.endsWith('seed.js')) {
  const result = seed({ force: process.argv.includes('--force') });
  console.log(
    result.skipped
      ? 'Database already contains data — nothing to do (use --force to reset).'
      : `Seeded ${result.businesses} businesses around ${config.seedCenter.label}.`,
  );
}
