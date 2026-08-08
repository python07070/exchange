import crypto from 'node:crypto';
import { config } from './config.js';
import { get } from './db.js';

/* ------------------------------------------------------------------ */
/* Passwords — scrypt with a per-user salt, no external dependency.    */
/* ------------------------------------------------------------------ */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored || '').split(':');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(derived, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ */
/* Sessions — compact HMAC-signed tokens (JWT-shaped, no dependency).  */
/* ------------------------------------------------------------------ */

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function sign(data) {
  return crypto.createHmac('sha256', config.authSecret).update(data).digest('base64url');
}

export function signToken(payload) {
  const body = {
    ...payload,
    exp: Date.now() + config.tokenTtlDays * 24 * 60 * 60 * 1000,
  };
  const data = b64url(JSON.stringify(body));
  return `${data}.${sign(data)}`;
}

export function verifyToken(token) {
  const [data, signature] = String(token || '').split('.');
  if (!data || !signature) return null;

  const expected = sign(data);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Express middleware                                                  */
/* ------------------------------------------------------------------ */

function readUser(req) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return null;
  return get('SELECT id, email, name, role, seen_feed_at FROM users WHERE id = ?', payload.sub) || null;
}

/** Attaches req.user when a valid token is present; never rejects. */
export function authOptional(req, _res, next) {
  req.user = readUser(req);
  next();
}

/** Rejects anonymous requests. */
export function authRequired(req, res, next) {
  req.user = req.user ?? readUser(req);
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  next();
}

/** Rejects anyone who is not a business owner. */
export function ownerRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'This area is for business accounts.' });
    }
    next();
  });
}

export function publicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
