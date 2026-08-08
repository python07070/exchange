import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import {
  Photo,
  Rating,
  StatusPill,
  Empty,
  IconPhone,
  IconRoute,
  IconHeart,
  IconHeartFilled,
  IconGlobe,
  IconClock,
  IconPin,
  timeAgo,
  priceLabel,
  formatDistance,
  UPDATE_KINDS,
} from '../components/ui.jsx';

function UpdateItem({ update }) {
  const kind = UPDATE_KINDS[update.kind] ?? UPDATE_KINDS.news;
  return (
    <article className={`update ${update.promoted ? 'update--promoted' : ''}`}>
      <div className="update__kind" aria-hidden="true">
        {kind.icon}
      </div>
      <div className="update__body">
        <p className="update__text">{update.body}</p>
        <div className="update__foot">
          <span style={{ fontWeight: 600 }}>{kind.label}</span>
          <span>·</span>
          <span>{timeAgo(update.createdAt)}</span>
          {update.promoted && (
            <>
              <span>·</span>
              <span className="badge badge--live">Promoted</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export default function BusinessPage() {
  const { slug } = useParams();
  const { origin, favourites, toggleFavourite } = useApp();
  const [business, setBusiness] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
    setBusiness(null);
    setError('');
    api
      .business(slug, origin ? { lat: origin.lat, lng: origin.lng } : {})
      .then(({ business }) => setBusiness(business))
      .catch((err) => setError(err.message));
  }, [slug, origin]);

  if (error) {
    return (
      <div className="page">
        <Empty icon="🤷" title="We couldn't find that business">
          <Link to="/" style={{ color: 'var(--brand)', fontWeight: 600 }}>
            Back to discover
          </Link>
        </Empty>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 300, borderRadius: 'var(--r-xl)' }} />
        <div className="skeleton" style={{ height: 220, marginTop: 24 }} />
      </div>
    );
  }

  const saved = favourites.has(business.id);

  const directionsUrl = `https://www.openstreetmap.org/directions?to=${business.lat}%2C${business.lng}`;

  return (
    <div className="page">
      <div className="hero">
        <Photo src={business.photo} alt={business.name} category={business.category} />
        <div className="hero__scrim" />
        <div className="hero__content">
          <div className="row wrap" style={{ gap: 8 }}>
            <StatusPill status={business.status} />
            {business.verified && <span className="badge badge--verified">Verified</span>}
            {business.plan !== 'free' && <span className="badge badge--featured">Featured</span>}
          </div>
          <h1>{business.name}</h1>
          <div className="hero__meta">
            <Rating value={business.rating} count={business.ratingCount} />
            <span>·</span>
            <span>
              {business.categoryIcon} {business.categoryLabel}
            </span>
            <span>·</span>
            <span>{priceLabel(business.priceLevel)}</span>
            {business.distanceKm != null && (
              <>
                <span>·</span>
                <span>{formatDistance(business.distanceKm)} away</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="detail">
        {/* --------------------------- main column --------------------------- */}
        <div>
          {business.tagline && (
            <p style={{ fontSize: '1.05rem', fontWeight: 500, color: 'var(--ink-2)' }}>{business.tagline}</p>
          )}
          {business.description && (
            <p className="muted" style={{ marginTop: 8, lineHeight: 1.65 }}>
              {business.description}
            </p>
          )}

          <section className="section" style={{ marginTop: 28 }}>
            <div className="section__head">
              <h2>What's happening</h2>
              <span className="small muted">{business.updates.length} updates</span>
            </div>
            {business.updates.length === 0 ? (
              <Empty icon="🕰️" title="Nothing posted yet">
                This business hasn't shared an update recently.
              </Empty>
            ) : (
              <div className="timeline">
                {business.updates.map((u) => (
                  <UpdateItem key={u.id} update={u} />
                ))}
              </div>
            )}
          </section>

          {business.photos.length > 1 && (
            <section className="section">
              <h2>Photos</h2>
              <div className="gallery">
                {business.photos.map((src, i) => (
                  <Photo key={src} src={src} alt={`${business.name} photo ${i + 1}`} category={business.category} />
                ))}
              </div>
            </section>
          )}

          {business.reviews.length > 0 && (
            <section className="section">
              <div className="section__head">
                <h2>What people say</h2>
                <Rating value={business.rating} count={business.ratingCount} />
              </div>
              <div className="card">
                {business.reviews.map((r) => (
                  <div className="review" key={r.id}>
                    <div className="spread">
                      <strong style={{ fontFamily: 'var(--font-display)' }}>{r.author}</strong>
                      <Rating value={r.rating} />
                    </div>
                    <p className="small muted" style={{ marginTop: 6 }}>
                      {r.body}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* --------------------------- side column --------------------------- */}
        <aside className="stack" style={{ gap: 16, position: 'sticky', top: 'calc(var(--topbar-h) + 16px)' }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="actions">
              <a
                className="action"
                href={business.phone ? `tel:${business.phone.replace(/\s/g, '')}` : undefined}
                onClick={() => api.interaction(business.id, 'call').catch(() => {})}
              >
                <IconPhone size={18} />
                Call
              </a>
              <a
                className="action"
                href={directionsUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => api.interaction(business.id, 'directions').catch(() => {})}
              >
                <IconRoute size={18} />
                Directions
              </a>
              <button
                className="action"
                onClick={() => toggleFavourite(business)}
                style={saved ? { color: 'var(--closed)' } : undefined}
                aria-pressed={saved}
              >
                {saved ? <IconHeartFilled size={18} /> : <IconHeart size={18} />}
                {saved ? 'Saved' : 'Save'}
              </button>
            </div>

            <div className="stack" style={{ gap: 10, marginTop: 16 }}>
              {business.address && (
                <div className="row small" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <IconPin size={15} style={{ marginTop: 2, flex: 'none', color: 'var(--muted)' }} />
                  <span>{business.address}</span>
                </div>
              )}
              {business.phone && (
                <div className="row small" style={{ gap: 8 }}>
                  <IconPhone size={15} style={{ flex: 'none', color: 'var(--muted)' }} />
                  <span>{business.phone}</span>
                </div>
              )}
              {business.website && (
                <div className="row small" style={{ gap: 8 }}>
                  <IconGlobe size={15} style={{ flex: 'none', color: 'var(--muted)' }} />
                  <a href={business.website} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)' }}>
                    Visit website
                  </a>
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div className="spread" style={{ marginBottom: 10 }}>
              <h3 className="row" style={{ gap: 7 }}>
                <IconClock size={16} /> Opening hours
              </h3>
              <StatusPill status={business.status} />
            </div>
            <div className="hours">
              {business.week.map((day) => (
                <div
                  key={day.dow}
                  className={`hours__row ${day.isToday ? 'is-today' : ''} ${day.closed ? 'is-closed' : ''}`}
                >
                  <span>{day.day}</span>
                  <span>{day.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden', height: 220 }}>
            <MapContainer
              center={[business.lat, business.lng]}
              zoom={15}
              zoomControl={false}
              scrollWheelZoom={false}
              style={{ height: '100%' }}
            >
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Marker
                position={[business.lat, business.lng]}
                icon={L.divIcon({
                  className: '',
                  html: `<div class="pin ${business.isOpen ? 'pin--open' : 'pin--closed'}" style="position:relative"><span>${business.categoryIcon}</span></div>`,
                  iconSize: [30, 30],
                  iconAnchor: [15, 30],
                })}
              />
            </MapContainer>
          </div>
        </aside>
      </div>
    </div>
  );
}
