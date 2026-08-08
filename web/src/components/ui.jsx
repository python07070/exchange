import { useEffect, useState } from 'react';

/* ------------------------------------------------------------------ */
/* Icons — inline so the app has no icon-font dependency.              */
/* ------------------------------------------------------------------ */

const svg = (path, extra = {}) =>
  function Icon({ size = 18, ...props }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={extra.fill ?? 'none'}
        stroke={extra.fill ? 'none' : 'currentColor'}
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {path}
      </svg>
    );
  };

export const IconSearch = svg(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </>,
);
export const IconPin = svg(
  <>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </>,
);
export const IconHeart = svg(
  <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1Z" />,
);
export const IconHeartFilled = svg(
  <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1Z" />,
  { fill: 'currentColor' },
);
export const IconStar = svg(
  <path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8L12 3Z" />,
  { fill: 'currentColor' },
);
export const IconBolt = svg(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />);
export const IconPhone = svg(
  <path d="M21 16.9v2.6a2 2 0 0 1-2.2 2 19.5 19.5 0 0 1-8.5-3 19.2 19.2 0 0 1-5.9-5.9 19.5 19.5 0 0 1-3-8.6A2 2 0 0 1 3.4 2H6a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.1 9.8a16 16 0 0 0 6 6l1.2-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7A2 2 0 0 1 21 16.9Z" />,
);
export const IconRoute = svg(
  <>
    <path d="M4 20 20 4" />
    <path d="M15 4h5v5" />
  </>,
);
export const IconClock = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.2 1.9" />
  </>,
);
export const IconBell = svg(
  <>
    <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
    <path d="M13.7 20a2 2 0 0 1-3.4 0" />
  </>,
);
export const IconChart = svg(
  <>
    <path d="M4 20h16" />
    <path d="M7 20v-6M12 20V6M17 20v-9" />
  </>,
);
export const IconMap = svg(
  <>
    <path d="m9 4-6 2.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z" />
    <path d="M9 4v13M15 7v13" />
  </>,
);
export const IconSun = svg(
  <>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>,
);
export const IconMoon = svg(<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z" />);
export const IconClose = svg(<path d="M6 6l12 12M18 6 6 18" />);
export const IconGlobe = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" />
  </>,
);
export const IconPlus = svg(<path d="M12 5v14M5 12h14" />);
export const IconTrash = svg(
  <>
    <path d="M4 7h16M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" />
    <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
  </>,
);
export const IconSparkle = svg(
  <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />,
  { fill: 'currentColor' },
);

/* ------------------------------------------------------------------ */
/* Small shared components                                             */
/* ------------------------------------------------------------------ */

/** Live open/closed state. The dot pulses while a business is open. */
export function StatusPill({ status, className = '' }) {
  if (!status) return null;
  return (
    <span className={`status status--${status.status} ${className}`}>
      <span className="status__dot" />
      {status.label}
    </span>
  );
}

const CATEGORY_GLYPH = {
  restaurant: '🍽️', cafe: '☕', bakery: '🥐', grocery: '🛒', pharmacy: '💊',
  retail: '🛍️', electronics: '📱', beauty: '💈', fitness: '🏋️', nightlife: '🎷',
  dessert: '🍨', books: '📚', kids: '🎠', services: '🔧', health: '🩺', pets: '🐾',
};

/**
 * Photo with a designed fallback. Remote images may be unavailable offline, so
 * the category glyph on a brand gradient is always rendered underneath.
 */
export function Photo({ src, alt, category, className = '', style }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  return (
    <div className={`photo ${className}`} style={style}>
      <span className="photo__fallback" aria-hidden="true">
        {CATEGORY_GLYPH[category] ?? '📍'}
      </span>
      {src && !failed && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{ position: 'absolute', inset: 0, opacity: loaded ? 1 : 0 }}
        />
      )}
    </div>
  );
}

export function Rating({ value, count }) {
  if (!value) return null;
  return (
    <span className="rating">
      <IconStar size={13} />
      {value.toFixed(1)}
      {count ? <span className="muted" style={{ fontWeight: 500 }}>&nbsp;({count})</span> : null}
    </span>
  );
}

export const priceLabel = (level) => '$'.repeat(Math.max(1, Math.min(4, level || 2)));

export function Modal({ children, onClose, labelledBy }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal__backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>
  );
}

export function Empty({ icon = '🔍', title, children }) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <h3>{title}</h3>
      {children && <p className="small">{children}</p>}
    </div>
  );
}

export function SkeletonList({ count = 5 }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bcard" style={{ cursor: 'default' }}>
          <div className="skeleton" style={{ aspectRatio: 1 }} />
          <div className="stack" style={{ gap: 8, padding: 6 }}>
            <div className="skeleton" style={{ height: 16, width: '55%' }} />
            <div className="skeleton" style={{ height: 12, width: '75%' }} />
            <div className="skeleton" style={{ height: 30, width: '100%' }} />
          </div>
        </div>
      ))}
    </>
  );
}

/** "just now" / "3h ago" / "2d ago" — the freshness cue the product runs on. */
export function timeAgo(iso) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const UPDATE_KINDS = {
  offer: { icon: '🏷️', label: 'Offer' },
  new: { icon: '✨', label: 'New' },
  event: { icon: '📣', label: 'Event' },
  stock: { icon: '📦', label: 'Just in' },
  news: { icon: '📰', label: 'News' },
};

export const formatDistance = (km) => {
  if (km == null) return null;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
};
