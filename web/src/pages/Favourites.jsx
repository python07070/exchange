import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import BusinessCard from '../components/BusinessCard.jsx';
import { Empty, SkeletonList } from '../components/ui.jsx';

export default function Favourites() {
  const { user, origin, favourites, setAuthOpen } = useApp();
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .favourites(origin ? { lat: origin.lat, lng: origin.lng } : {})
      .then(({ businesses }) => setBusinesses(businesses))
      .catch(() => setBusinesses([]))
      .finally(() => setLoading(false));
    // `favourites` is in the deps so removing one updates the list immediately.
  }, [user, origin, favourites]);

  if (!user) {
    return (
      <div className="page page--narrow">
        <Empty icon="💛" title="Save the places you love">
          Sign in to keep your favourites and be told the moment they post something new.
          <div>
            <button className="btn btn--primary" style={{ marginTop: 14 }} onClick={() => setAuthOpen(true)}>
              Sign in
            </button>
          </div>
        </Empty>
      </div>
    );
  }

  const openNow = businesses.filter((b) => b.isOpen).length;

  return (
    <div className="page page--narrow">
      <div className="pagehead">
        <h1>Your saved places</h1>
        <p>
          {loading
            ? 'Loading…'
            : `${businesses.length} saved · ${openNow} open right now. We'll notify you when any of them post.`}
        </p>
      </div>

      <div className="stack" style={{ gap: 14 }}>
        {loading ? (
          <SkeletonList count={3} />
        ) : businesses.length === 0 ? (
          <Empty icon="🔖" title="No favourites yet">
            Tap the heart on any business to keep it here.
          </Empty>
        ) : (
          businesses.map((b) => <BusinessCard key={b.id} business={b} />)
        )}
      </div>
    </div>
  );
}
