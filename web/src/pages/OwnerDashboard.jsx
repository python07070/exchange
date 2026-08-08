import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import {
  Empty,
  StatusPill,
  Photo,
  timeAgo,
  IconChart,
  IconTrash,
  IconBolt,
  UPDATE_KINDS,
} from '../components/ui.jsx';

const MAX_BODY = 400;

/** 14-day bar chart. Pure CSS — no charting dependency for four series. */
function Chart({ daily }) {
  const peak = Math.max(1, ...daily.map((d) => d.views));
  return (
    <div className="chart" role="img" aria-label="Daily profile views over the last 14 days">
      {daily.map((d) => (
        <div className="chart__col" key={d.day} title={`${d.day}: ${d.views} views`}>
          <div className="chart__bar" style={{ height: `${Math.max(4, (d.views / peak) * 100)}%` }} />
          <span className="chart__label">{new Date(`${d.day}T00:00:00`).getDate()}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, delta }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value.toLocaleString()}</div>
      {delta !== undefined && (
        <div className={`stat__delta stat__delta--${delta >= 0 ? 'up' : 'down'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs. the previous week
        </div>
      )}
    </div>
  );
}

/** The composer is the product's paid surface — one post, straight to nearby customers. */
function Composer({ business, onPosted }) {
  const { toast } = useApp();
  const [body, setBody] = useState('');
  const [kind, setKind] = useState('news');
  const [promoted, setPromoted] = useState(false);
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canPromote = business.plan !== 'free';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { update } = await api.postUpdate(business.id, {
        body: body.trim(),
        kind,
        promoted: promoted && canPromote,
        expiresInHours: expires ? Number(expires) : undefined,
      });
      setBody('');
      setPromoted(false);
      setExpires('');
      toast('Posted — nearby customers can see it now');
      onPosted(update);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card composer" onSubmit={submit}>
      <div>
        <h3>Post an update</h3>
        <p className="small muted" style={{ marginTop: 4 }}>
          Say what is happening right now. Specific beats general — "warm cinnamon rolls just came out"
          brings people in; "we are open" does not.
        </p>
      </div>

      <div className="composer__kinds" role="group" aria-label="Update type">
        {Object.entries(UPDATE_KINDS).map(([id, k]) => (
          <button
            key={id}
            type="button"
            className={`chip ${kind === id ? 'is-on' : ''}`}
            onClick={() => setKind(id)}
            aria-pressed={kind === id}
          >
            <span aria-hidden="true">{k.icon}</span> {k.label}
          </button>
        ))}
      </div>

      <div>
        <label className="label" htmlFor="composer-body">Your update</label>
        <textarea
          id="composer-body"
          className="textarea"
          value={body}
          maxLength={MAX_BODY}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Fresh strawberries arrived this morning. First come, first served."
          required
        />
        <div className="spread" style={{ marginTop: 6 }}>
          <span className="composer__count">
            {body.length}/{MAX_BODY}
          </span>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 12 }}>
        <div className="grow" style={{ minWidth: 180 }}>
          <label className="label" htmlFor="composer-expiry">Expires after</label>
          <select
            id="composer-expiry"
            className="select"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          >
            <option value="">Doesn't expire</option>
            <option value="4">4 hours</option>
            <option value="12">12 hours</option>
            <option value="24">1 day</option>
            <option value="72">3 days</option>
          </select>
        </div>

        <label
          className="row grow"
          style={{ gap: 10, minWidth: 200, cursor: canPromote ? 'pointer' : 'not-allowed', marginTop: 22 }}
          title={canPromote ? '' : 'Promotion is available on paid plans'}
        >
          <input
            type="checkbox"
            checked={promoted}
            disabled={!canPromote}
            onChange={(e) => setPromoted(e.target.checked)}
          />
          <span className="small">
            <strong>Promote this post</strong>
            <br />
            <span className="muted tiny">
              {canPromote ? 'Reaches more nearby customers' : 'Available on paid plans'}
            </span>
          </span>
        </label>
      </div>

      {error && <div className="alert">{error}</div>}

      <button className="btn btn--primary" disabled={busy || body.trim().length < 8}>
        <IconBolt size={15} /> {busy ? 'Posting…' : 'Post update'}
      </button>
    </form>
  );
}

export default function OwnerDashboard() {
  const { user, setAuthOpen, toast } = useApp();
  const [businesses, setBusinesses] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [insights, setInsights] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);

  const selected = useMemo(
    () => businesses.find((b) => b.id === selectedId) ?? null,
    [businesses, selectedId],
  );

  useEffect(() => {
    if (user?.role !== 'owner') {
      setLoading(false);
      return;
    }
    api
      .ownerBusinesses()
      .then(({ businesses }) => {
        setBusinesses(businesses);
        setSelectedId((id) => id ?? businesses[0]?.id ?? null);
      })
      .catch(() => setBusinesses([]))
      .finally(() => setLoading(false));
  }, [user]);

  const loadDetail = useCallback((id) => {
    if (!id) return;
    Promise.all([api.insights(id), api.ownerUpdates(id)])
      .then(([ins, upd]) => {
        setInsights(ins);
        setUpdates(upd.updates);
      })
      .catch(() => {});
  }, []);

  useEffect(() => loadDetail(selectedId), [selectedId, loadDetail]);

  const removeUpdate = async (updateId) => {
    setUpdates((u) => u.filter((x) => x.id !== updateId));
    try {
      await api.deleteUpdate(selectedId, updateId);
      toast('Update removed');
    } catch (err) {
      toast(err.message);
      loadDetail(selectedId);
    }
  };

  if (!user) {
    return (
      <div className="page page--narrow">
        <Empty icon="🏪" title="Business accounts only">
          Sign in with a business account to post updates and see your numbers.
          <div>
            <button className="btn btn--primary" style={{ marginTop: 14 }} onClick={() => setAuthOpen(true)}>
              Sign in
            </button>
          </div>
        </Empty>
      </div>
    );
  }

  if (user.role !== 'owner') {
    return (
      <div className="page page--narrow">
        <Empty icon="🏪" title="This area is for business accounts">
          Create a business account to list your shop and reach nearby customers.
        </Empty>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    );
  }

  if (businesses.length === 0) {
    return (
      <div className="page page--narrow">
        <Empty icon="📍" title="No businesses on your account yet">
          Once your business is listed it will appear here with its updates and insights.
        </Empty>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="pagehead">
        <h1>Your business</h1>
        <p>Post what's happening today, and see exactly what it drives.</p>
      </div>

      <div className="dash">
        <aside className="dash__nav" aria-label="Your businesses">
          {businesses.map((b) => (
            <button
              key={b.id}
              className={b.id === selectedId ? 'is-on' : ''}
              onClick={() => setSelectedId(b.id)}
              aria-pressed={b.id === selectedId}
            >
              <strong className="truncate">{b.name}</strong>
              <span className="row" style={{ gap: 6 }}>
                <StatusPill status={b.status} />
                {b.plan !== 'free' && <span className="badge badge--featured">{b.plan}</span>}
              </span>
            </button>
          ))}
        </aside>

        <div className="stack" style={{ gap: 20 }}>
          {selected && insights && (
            <>
              <div className="card" style={{ padding: 20 }}>
                <div className="spread wrap" style={{ marginBottom: 16 }}>
                  <div className="row" style={{ gap: 12 }}>
                    <Photo
                      src={selected.photo}
                      alt={selected.name}
                      category={selected.category}
                      style={{ width: 48, height: 48 }}
                    />
                    <div>
                      <h2>{selected.name}</h2>
                      <Link to={`/b/${selected.slug}`} className="small" style={{ color: 'var(--brand)' }}>
                        View public page →
                      </Link>
                    </div>
                  </div>
                  <span className="small muted row" style={{ gap: 6 }}>
                    <IconChart size={15} /> Last 14 days
                  </span>
                </div>

                <div className="stats">
                  <Stat label="Profile views" value={insights.totals.views} delta={insights.trend} />
                  <Stat label="Directions" value={insights.totals.directions} />
                  <Stat label="Calls" value={insights.totals.calls} />
                  <Stat label="Followers" value={insights.followers} />
                </div>

                <Chart daily={insights.daily} />
              </div>

              <Composer
                business={selected}
                onPosted={(update) => {
                  setUpdates((u) => [update, ...u]);
                  loadDetail(selected.id);
                }}
              />

              <section className="section">
                <div className="section__head">
                  <h2>Your updates</h2>
                  <span className="small muted">{updates.length} posted</span>
                </div>
                {updates.length === 0 ? (
                  <Empty icon="✍️" title="Nothing posted yet">
                    Your first update takes about ten seconds.
                  </Empty>
                ) : (
                  <div className="timeline">
                    {updates.map((u) => (
                      <article key={u.id} className={`update ${u.promoted ? 'update--promoted' : ''}`}>
                        <div className="update__kind" aria-hidden="true">
                          {UPDATE_KINDS[u.kind]?.icon ?? '📰'}
                        </div>
                        <div className="update__body">
                          <div className="spread" style={{ alignItems: 'flex-start' }}>
                            <p className="update__text grow">{u.body}</p>
                            <button
                              className="btn btn--icon btn--sm btn--ghost"
                              onClick={() => removeUpdate(u.id)}
                              aria-label="Delete this update"
                            >
                              <IconTrash size={14} />
                            </button>
                          </div>
                          <div className="update__foot">
                            <span>{timeAgo(u.createdAt)}</span>
                            <span>·</span>
                            <span>{u.views.toLocaleString()} views</span>
                            {u.promoted && (
                              <>
                                <span>·</span>
                                <span className="badge badge--live">Promoted</span>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
