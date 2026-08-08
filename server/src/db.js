import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

export const db = new DatabaseSync(config.dbFile);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer',   -- customer | owner
  seen_feed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS businesses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  owner_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  tagline       TEXT,
  description   TEXT,
  address       TEXT,
  phone         TEXT,
  website       TEXT,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  tz_offset     INTEGER NOT NULL DEFAULT 0,        -- minutes from UTC
  price_level   INTEGER NOT NULL DEFAULT 2,        -- 1..4
  rating        REAL NOT NULL DEFAULT 0,
  rating_count  INTEGER NOT NULL DEFAULT 0,
  tags          TEXT NOT NULL DEFAULT '[]',        -- JSON array of lowercase keywords
  photos        TEXT NOT NULL DEFAULT '[]',        -- JSON array of image urls
  plan          TEXT NOT NULL DEFAULT 'free',      -- free | featured | premium
  verified      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_businesses_category ON businesses(category);
CREATE INDEX IF NOT EXISTS idx_businesses_geo      ON businesses(lat, lng);

CREATE TABLE IF NOT EXISTS hours (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  dow         INTEGER NOT NULL,                    -- 0 = Sunday .. 6 = Saturday
  opens       INTEGER,                             -- minutes after local midnight
  closes      INTEGER,                             -- may exceed 1440 when it runs past midnight
  closed      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_hours_business ON hours(business_id);

-- The "living profile": timely posts that give customers a reason to visit today.
CREATE TABLE IF NOT EXISTS updates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'news',        -- offer | new | event | stock | news
  body        TEXT NOT NULL,
  photo       TEXT,
  promoted    INTEGER NOT NULL DEFAULT 0,
  views       INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_updates_business ON updates(business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS favourites (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, business_id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author      TEXT NOT NULL,
  rating      INTEGER NOT NULL,
  body        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_business ON reviews(business_id, created_at DESC);

-- Raw signal behind the owner-facing insights.
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,                       -- view | call | directions | favourite | update_view | search_hit
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_business ON events(business_id, created_at);
`);

/** Read rows as plain objects. */
export function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

export function get(sql, ...params) {
  return db.prepare(sql).get(...params);
}

export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

export function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value ?? '');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}
