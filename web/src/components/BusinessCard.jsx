import { useNavigate } from 'react-router-dom';
import { useApp } from '../store.jsx';
import {
  Photo,
  Rating,
  StatusPill,
  IconHeart,
  IconHeartFilled,
  IconPin,
  formatDistance,
  priceLabel,
  timeAgo,
  UPDATE_KINDS,
} from './ui.jsx';

/**
 * The core discovery unit. Everything a customer needs to decide in one glance:
 * what it is, how far, whether it is open right now, and — the part other maps
 * don't have — what is happening there today.
 */
export default function BusinessCard({ business, active, onHover, onLeave }) {
  const navigate = useNavigate();
  const { favourites, toggleFavourite } = useApp();
  const saved = favourites.has(business.id);
  const update = business.latestUpdate;

  return (
    <article
      className={`bcard ${active ? 'is-active' : ''}`}
      onMouseEnter={() => onHover?.(business.id)}
      onMouseLeave={() => onLeave?.()}
      onClick={() => navigate(`/b/${business.slug}`)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/b/${business.slug}`);
        }
      }}
    >
      <Photo src={business.photo} alt={business.name} category={business.category} />

      <div className="bcard__body">
        <div className="spread" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <div className="bcard__title">
              <span className="bcard__name truncate">{business.name}</span>
              {business.verified && <span className="badge badge--verified">Verified</span>}
              {business.plan !== 'free' && !business.verified && (
                <span className="badge badge--featured">Featured</span>
              )}
            </div>
            <div className="bcard__meta">
              <span>
                {business.categoryIcon} {business.categoryLabel}
              </span>
              <i className="bcard__dot" />
              <span>{priceLabel(business.priceLevel)}</span>
              {business.distanceKm != null && (
                <>
                  <i className="bcard__dot" />
                  <span className="row" style={{ gap: 3 }}>
                    <IconPin size={12} />
                    {formatDistance(business.distanceKm)}
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            className={`fav ${saved ? 'is-on' : ''}`}
            aria-label={saved ? `Remove ${business.name} from favourites` : `Save ${business.name}`}
            aria-pressed={saved}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavourite(business);
            }}
          >
            {saved ? <IconHeartFilled size={15} /> : <IconHeart size={15} />}
          </button>
        </div>

        <div className="row wrap" style={{ gap: 8 }}>
          <StatusPill status={business.status} />
          <Rating value={business.rating} count={business.ratingCount} />
          {business.status?.detail && (
            <span className="tiny muted">{business.status.detail}</span>
          )}
        </div>

        {update ? (
          <p className="bcard__update">
            <span aria-hidden="true">{UPDATE_KINDS[update.kind]?.icon ?? '📰'}</span>
            <span className="grow">
              {update.body}
              <strong> · {timeAgo(update.createdAt)}</strong>
            </span>
          </p>
        ) : (
          business.tagline && <p className="small muted truncate">{business.tagline}</p>
        )}
      </div>
    </article>
  );
}
