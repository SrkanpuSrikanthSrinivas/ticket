'use client';
import { useEffect, useState } from 'react';

const nf = (n) => (n == null ? '—' : Number(n).toLocaleString());
const money = (n) => (n == null ? '—' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export default function Impact() {
  const [pin, setPin] = useState('');
  const [authed, setAuthed] = useState(false);
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState('');

  async function load(p = pin) {
    const res = await fetch(`/api/impact?pin=${encodeURIComponent(p)}&t=${Date.now()}`, { cache: 'no-store' });
    if (res.status === 401) { setMsg('Wrong PIN'); return false; }
    if (!res.ok) { setMsg('Could not load'); return false; }
    setD(await res.json()); return true;
  }
  useEffect(() => { if (authed) load(); }, [authed]);

  if (!authed) {
    const press = (n) => setPin((pin + n).slice(0, 6));
    return (
      <div><div className="topbar"><b>Impact</b></div>
        <div className="wrap"><div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Private — organizer only</div>
          <h2 style={{ fontSize: 20 }}>Enter the admin PIN</h2>
          <div className="pindots">{[0, 1, 2, 3].map((i) => <i key={i} className={pin.length > i ? 'f' : ''} />)}</div>
          <div className="pinpad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} onClick={() => press(n)}>{n}</button>)}
            <button onClick={() => setPin('')}>✕</button><button onClick={() => press(0)}>0</button>
            <button onClick={async () => { if (await load(pin)) setAuthed(true); }}>→</button>
          </div>{msg && <p className="err">{msg}</p>}
        </div></div>
      </div>
    );
  }

  if (!d) return <div><div className="topbar"><b>Impact</b></div><div className="wrap"><div className="card">Loading…</div></div></div>;

  const cards = [
    { k: 'Tickets processed', v: nf(d.tickets_processed), ic: '🎟' },
    { k: 'Transactions processed', v: nf(d.transactions_processed), ic: '💳' },
    { k: 'Events supported', v: nf(d.events_supported), ic: '🎪' },
    { k: 'Guests served', v: nf(d.guests_served), ic: '👥' },
    { k: 'Unique users served', v: nf(d.users_served), ic: '🧑‍🤝‍🧑' },
    { k: 'Months in production', v: nf(d.months_in_production), ic: '🚀' },
    { k: 'Value processed', v: money(d.value_processed_usd), ic: '📈' },
    { k: 'In production since', v: d.production_since || '—', ic: '📅' },
  ];

  return (
    <div className="impact">
      <div className="impact-hero">
        <div className="ih-eyebrow">Adoption &amp; Impact · Private</div>
        <h1 className="ih-title">{d.platform}</h1>
        <p className="ih-sub">Production ticketing platform in real-world use by {d.organization}.</p>
      </div>

      <div className="impact-grid">
        {cards.map((c) => (
          <div className="impact-card" key={c.k}>
            <div className="ic-ic">{c.ic}</div>
            <div className="ic-v">{c.v}</div>
            <div className="ic-k">{c.k}</div>
          </div>
        ))}
      </div>

      {Array.isArray(d.monthly) && d.monthly.length > 0 && (
        <div className="impact-monthly">
          <div className="im-h">Monthly growth</div>
          <table className="rtable">
            <thead><tr><th>Month</th><th>Transactions</th><th>Tickets</th><th>Value</th></tr></thead>
            <tbody>{d.monthly.map((m) => (
              <tr key={m.month}><td>{m.month}</td><td>{nf(m.transactions)}</td><td>{nf(m.tickets)}</td><td>{money(m.value_usd)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div className="impact-foot">
        <div><b>Organization using platform:</b> {d.organization}</div>
        <div><b>Data source:</b> {d.data_source}</div>
        <div><b>Last updated:</b> {new Date(d.updated_at).toLocaleString()}</div>
        <div className="ic-note">Private view. Figures are aggregate and generated automatically from the live production database.</div>
      </div>
    </div>
  );
}
