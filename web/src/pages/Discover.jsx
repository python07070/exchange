import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import BusinessCard from '../components/BusinessCard.jsx';
import BusinessMap from '../components/BusinessMap.jsx';
import { Empty, SkeletonList, IconSparkle, IconMap, IconBolt } from '../components/ui.jsx';

const SORTS = [
  { id: 'relevance', label: 'Best match' },
  { id: 'distance', label: 'Closest' },
  { id: 'rating', label: 'Top rated' },
  { id: 'updated', label: 'Just posted' },
];

export default function Discover() {
  const { meta, origin } = useApp();
  const [params, setParams] = useSearchParams();

  const query = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const openNow = params.get('openNow') === 'true';
  const sort = params.get('sort') ?? 'relevance';

  const [businesses, setBusinesses] = useState([]);
  const [interpretation, setInterpretation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [showMap, setShowMap] = useState(false);

  const setParam = useCallback(
    (key, value) => {
      const next = new URLSearchParams(params);
      if (!value) next.delete(key);
      else next.set(key, String(value));
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const geo = origin ? { lat: origin.lat, lng: origin.lng } : {};

    const load = query
      ? api.search({ q: query, ...geo })
      : api.businesses({ category, openNow, sort, limit: 60, ...geo });

    load
      .then((data) => {
        if (cancelled) return;
        setBusinesses(data.businesses);
        setInterpretation(data.interpretation ?? null);
      })
      .catch(() => !cancelled && setBusinesses([]))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [query, category, openNow, sort, origin]);

  const openCount = useMemo(() => businesses.filter((b) => b.isOpen).length, [businesses]);

  return (
    <div className={`discover ${showMap ? 'show-map' : ''}`}>
      <section className="results" aria-label="Search results">
        <header className="results__head">
          <div className="spread wrap">
            <div>
              <h1 style={{ fontSize: '1.35rem' }}>
                {query ? `Results for "${query}"` : `What's around you in ${meta?.city ?? 'town'}`}
              </h1>
              <p className="small muted">
                {loading
                  ? 'Looking…'
                  : `${businesses.length} ${businesses.length === 1 ? 'place' : 'places'} · ${openCount} open right now`}
              </p>
            </div>
          </div>

          {interpretation && (
            <div className="interpretation">
              <span className="interpretation__icon">
                <IconSparkle size={13} />
              </span>
              <div className="grow">
                <div className="small" style={{ fontWeight: 600 }}>
                  {interpretation.explanation}
                </div>
                <div className="tiny muted">
                  {interpretation.relaxed
                    ? 'Nothing matched exactly, so we widened the search.'
                    : `Understood by the ${interpretation.source === 'claude' ? 'AI' : 'built-in'} interpreter.`}
                </div>
              </div>
            </div>
          )}

          {!query && (
            <>
              <div className="filters">
                <button
                  className={`chip chip--open ${openNow ? 'is-on' : ''}`}
                  onClick={() => setParam('openNow', openNow ? '' : 'true')}
                  aria-pressed={openNow}
                >
                  <IconBolt size={13} /> Open now
                </button>
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    className={`chip ${sort === s.id ? 'is-on' : ''}`}
                    onClick={() => setParam('sort', s.id === 'relevance' ? '' : s.id)}
                    aria-pressed={sort === s.id}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="rail" role="group" aria-label="Categories">
                <button
                  className={`chip ${!category ? 'is-on' : ''}`}
                  onClick={() => setParam('category', '')}
                  aria-pressed={!category}
                >
                  All
                </button>
                {(meta?.categories ?? []).map((c) => (
                  <button
                    key={c.id}
                    className={`chip ${category === c.id ? 'is-on' : ''}`}
                    onClick={() => setParam('category', category === c.id ? '' : c.id)}
                    aria-pressed={category === c.id}
                  >
                    <span aria-hidden="true">{c.icon}</span> {c.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </header>

        {loading ? (
          <SkeletonList count={6} />
        ) : businesses.length === 0 ? (
          <Empty title="Nothing matched that">
            Try fewer words, or clear the filters to see everything nearby.
          </Empty>
        ) : (
          businesses.map((business) => (
            <BusinessCard
              key={business.id}
              business={business}
              active={business.id === activeId}
              onHover={setActiveId}
              onLeave={() => setActiveId(null)}
            />
          ))
        )}
      </section>

      <BusinessMap
        businesses={businesses}
        origin={origin}
        activeId={activeId}
        onSelect={setActiveId}
      />

      <button className="btn btn--primary mapToggle" onClick={() => setShowMap((v) => !v)}>
        <IconMap size={16} /> {showMap ? 'Show list' : 'Show map'}
      </button>
    </div>
  );
}
