import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT || 4000),
  dbFile: process.env.DB_FILE || path.join(here, '..', 'data', 'business-finder.db'),

  // Secret used to sign session tokens. Override in production.
  authSecret: process.env.AUTH_SECRET || 'business-finder-dev-secret-change-me',
  tokenTtlDays: 30,

  // The city the demo data is generated around. Any lat/lng works — the whole
  // app is geo-relative, so pointing this at another city just moves the map.
  seedCenter: {
    lat: Number(process.env.SEED_LAT || 43.6532),
    lng: Number(process.env.SEED_LNG || -79.3832),
    label: process.env.SEED_CITY || 'Toronto',
    // Minutes offset from UTC, used to evaluate "is it open right now" in the
    // business's own local time rather than the server's.
    // Eastern Time: -300 (EST) / -240 (EDT). Default assumes daylight time.
    tzOffsetMinutes: Number(process.env.SEED_TZ_OFFSET ?? -240),
  },

  // Optional: set ANTHROPIC_API_KEY to upgrade natural-language search from the
  // built-in interpreter to a Claude-powered one. The app works fully without it.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-opus-5',
};
