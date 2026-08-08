import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Photo, Empty, timeAgo, UPDATE_KINDS, IconBell, IconSparkle } from '../components/ui.jsx';

function FeedItem({ update, unread }) {
  const kind = UPDATE_KINDS[update.kind] ?? UPDATE_KINDS.news;
  return (
    <Link
      to={`/b/${update.business.slug}`}
      className={`update ${update.promoted ? 'update--promoted' : ''}`}
      style={{ gridTemplateColumns: '52px minmax(0, 1fr)' }}
    >
      <Photo
        src={update.business.photo}
        alt={update.business.name}
        category={update.business.category}
        style={{ width: 52, height: 52 }}
      />
      <div className="update__body">
        <div className="spread">
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem' }}>
            {update.business.name}
          </strong>
          {unread && <span className="badge badge--live">New</span>}
        </div>
        <p className="update__text small">{update.body}</p>
        <div className="update__foot">
          <span aria-hidden="true">{kind.icon}</span>
          <span style={{ fontWeight: 600 }}>{kind.label}</span>
          <span>·</span>
          <span>{timeAgo(update.createdAt)}</span>
          {update.promoted && (
            <>
              <span>·</span>
              <span className="tiny">Promoted</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

/**
 * Two feeds in one page: what the whole city is posting, and — when signed in —
 * what the customer's saved places have posted since they last looked.
 */
export default function Feed() {
  const { user, meta, notifications, markNotificationsSeen, setAuthOpen } = useApp();
  const [updates, setUpdates] = useState([]);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('city');

  useEffect(() => {
    setLoading(true);
    api
      .updates({ category, limit: 60 })
      .then(({ updates }) => setUpdates(updates))
      .catch(() => setUpdates([]))
      .finally(() => setLoading(false));
  }, [category]);

  useEffect(() => {
    if (tab === 'following') markNotificationsSeen();
  }, [tab, markNotificationsSeen]);

  const list = tab === 'following' ? notifications : updates;

  return (
    <div className="page page--narrow">
      <div className="pagehead">
        <h1>Happening right now</h1>
        <p>
          Live posts from businesses across {meta?.city ?? 'the city'} — fresh stock, tonight's events,
          offers that end today. This is the information you won't find on a map.
        </p>
      </div>

      <div className="tabs" style={{ marginBottom: 20 }}>
        <button className={tab === 'city' ? 'is-on' : ''} onClick={() => setTab('city')}>
          <span className="row" style={{ gap: 6, justifyContent: 'center' }}>
            <IconSparkle size={13} /> Across the city
          </span>
        </button>
        <button className={tab === 'following' ? 'is-on' : ''} onClick={() => setTab('following')}>
          <span className="row" style={{ gap: 6, justifyContent: 'center' }}>
            <IconBell size={13} /> Places you follow
            {notifications.filter((n) => n.unread).length > 0 && (
              <span className="badge badge--live">{notifications.filter((n) => n.unread).length}</span>
            )}
          </span>
        </button>
      </div>

      {tab === 'city' && (
        <div className="rail" style={{ marginBottom: 18 }}>
          <button className={`chip ${!category ? 'is-on' : ''}`} onClick={() => setCategory('')}>
            All
          </button>
          {(meta?.categories ?? []).map((c) => (
            <button
              key={c.id}
              className={`chip ${category === c.id ? 'is-on' : ''}`}
              onClick={() => setCategory(category === c.id ? '' : c.id)}
            >
              <span aria-hidden="true">{c.icon}</span> {c.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'following' && !user ? (
        <Empty icon="🔔" title="Sign in to follow your favourite places">
          <button className="btn btn--primary" style={{ marginTop: 10 }} onClick={() => setAuthOpen(true)}>
            Sign in
          </button>
        </Empty>
      ) : loading && tab === 'city' ? (
        <div className="stack" style={{ gap: 12 }}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton" style={{ height: 96 }} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Empty
          icon={tab === 'following' ? '💤' : '📭'}
          title={tab === 'following' ? 'Nothing new from your places' : 'No posts in this category yet'}
        >
          {tab === 'following'
            ? 'Save a few more businesses and their updates will land here.'
            : 'Try another category.'}
        </Empty>
      ) : (
        <div className="timeline">
          {list.map((update) => (
            <FeedItem key={update.id} update={update} unread={update.unread} />
          ))}
        </div>
      )}
    </div>
  );
}
