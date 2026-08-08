import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Link } from 'react-router-dom';
import { StatusPill, Rating, formatDistance } from './ui.jsx';

/**
 * Markers are built as HTML so they can carry the live open/closed colour and a
 * ripple for businesses that posted in the last few hours.
 */
function pinIcon(business, { active }) {
  const live =
    business.latestUpdate &&
    Date.now() - new Date(business.latestUpdate.createdAt).getTime() < 6 * 3_600_000;

  const classes = [
    'pin',
    business.isOpen ? 'pin--open' : 'pin--closed',
    active ? 'pin--active' : '',
    live ? 'pin--live' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const size = active ? 40 : 30;
  return L.divIcon({
    className: 'pin-wrap',
    html: `<div class="${classes}" style="position:relative"><span>${business.categoryIcon}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 4],
  });
}

/** Keeps the viewport framed on whatever the list is currently showing. */
function FitBounds({ businesses, origin }) {
  const map = useMap();

  useEffect(() => {
    const points = businesses.map((b) => [b.lat, b.lng]);
    if (origin) points.push([origin.lat, origin.lng]);
    if (points.length === 0) return;

    if (points.length === 1) {
      map.setView(points[0], 15, { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(points).pad(0.18), { animate: true, maxZoom: 16 });
  }, [businesses, origin, map]);

  return null;
}

/** Pans to the card the customer is hovering, without changing zoom. */
function FollowActive({ businesses, activeId }) {
  const map = useMap();
  useEffect(() => {
    if (!activeId) return;
    const target = businesses.find((b) => b.id === activeId);
    if (target) map.panTo([target.lat, target.lng], { animate: true, duration: 0.4 });
  }, [activeId, businesses, map]);
  return null;
}

export default function BusinessMap({ businesses, origin, activeId, onSelect }) {
  const center = useMemo(() => {
    if (origin) return [origin.lat, origin.lng];
    if (businesses.length) return [businesses[0].lat, businesses[0].lng];
    return [26.2285, 50.586];
  }, [origin, businesses]);

  return (
    <div className="mapwrap">
      <MapContainer center={center} zoom={14} zoomControl scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <FitBounds businesses={businesses} origin={origin} />
        <FollowActive businesses={businesses} activeId={activeId} />

        {origin?.real && (
          <CircleMarker
            center={[origin.lat, origin.lng]}
            radius={7}
            pathOptions={{ color: '#fff', weight: 3, fillColor: '#5A4FF3', fillOpacity: 1 }}
          >
            <Popup>You are here</Popup>
          </CircleMarker>
        )}

        {businesses.map((business) => (
          <Marker
            key={business.id}
            position={[business.lat, business.lng]}
            icon={pinIcon(business, { active: business.id === activeId })}
            eventHandlers={{ click: () => onSelect?.(business.id) }}
          >
            <Popup>
              <div className="stack" style={{ gap: 6 }}>
                <Link to={`/b/${business.slug}`} style={{ fontWeight: 700 }}>
                  {business.name}
                </Link>
                <div className="row wrap" style={{ gap: 6 }}>
                  <StatusPill status={business.status} />
                  <Rating value={business.rating} />
                </div>
                <div className="tiny muted">
                  {business.categoryLabel}
                  {business.distanceKm != null && ` · ${formatDistance(business.distanceKm)}`}
                </div>
                {business.latestUpdate && (
                  <div className="tiny" style={{ marginTop: 2 }}>
                    {business.latestUpdate.body}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="maplegend">
        <span>
          <i style={{ background: 'var(--open)' }} /> Open now
        </span>
        <span>
          <i style={{ background: 'var(--closed)' }} /> Closed
        </span>
        <span>
          <i style={{ background: 'var(--accent)' }} /> Posted today
        </span>
      </div>
    </div>
  );
}
