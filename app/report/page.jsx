'use client';
import { useEffect, useState } from 'react';

const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
const initials = (s) => String(s || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';

export default function Report() {
  const [pin, setPin] = useState('');
  const [authed, setAuthed] = useState(false);
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState('');

  async function load(p = pin) {
    const res = await fetch(`/api/admin/report?pin=${encodeURIComponent(p)}&t=${Date.now()}`, { cache: 'no-store' });
    if (res.status === 401) { setMsg('Wrong PIN'); return false; }
    if (!res.ok) { setMsg('Could not load'); return false; }
    setD(await res.json()); return true;
  }
  useEffect(() => { if (authed) { load(); const t = setInterval(load, 15000); return () => clearInterval(t); } }, [authed]);

  if (!authed) {
    const press = (n) => setPin((pin + n).slice(0, 6));
    return (
      <div><div className="topbar"><b>Report</b></div>
        <div className="wrap"><div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Organizer sign-in</div>
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

  if (!d) return <div><div className="topbar"><b>Report</b></div><div className="wrap"><div className="card">Loading…</div></div></div>;
  const cp = d.coupons || {};

  return (
    <div>
      <div className="topbar"><b>{d.event?.name || 'Report'}</b>
        <span style={{ marginLeft: 'auto', fontSize: 12, opacity: .85 }}>live · updates every 15s</span></div>
      <div className="wrap">
        <div className="stats">
          <div className="stat plum"><div className="n">{d.registrations}</div><div className="l">Orders · {d.guests} guests</div></div>
          <div className="stat teal"><div className="n">{d.checked_in_guests}</div><div className="l">Checked in</div></div>
          <div className="stat"><div className="n">{money(d.revenue_cents)}</div><div className="l">Revenue (paid)</div></div>
          <div className="stat mari"><div className="n">{money(cp.value_redeemed)}</div><div className="l">Coupons redeemed of {money(cp.value_issued)}</div></div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 16 }}>Sales by ticket type</h3>
          <div className="divider" />
          <table className="rtable"><thead><tr><th>Ticket</th><th>Sold</th><th>Revenue</th></tr></thead>
            <tbody>{(d.tiers || []).map((t, i) => (
              <tr key={i}><td>{t.name}</td><td>{t.sold}</td><td>{money(t.revenue)}</td></tr>
            ))}</tbody></table>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: 16 }}>Coupons</h3>
            <span className="hint">{cp.redeemed}/{cp.issued} redeemed</span>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 16 }}>Recent check-ins</h3>
          <div className="divider" />
          {(d.recent || []).length === 0 ? <div className="hint">No check-ins yet.</div>
            : (d.recent || []).map((r, i) => (
              <div key={i} className="li"><div className="avatar">{initials(r.buyer_name)}</div>
                <div className="grow"><div style={{ fontWeight: 600 }}>{r.buyer_name}</div><div className="hint">{r.type}</div></div>
                <span className="pill in">{r.checked_in_at ? new Date(r.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>
            ))}
        </div>

        <a className="btn btn-ghost btn-block" style={{ marginTop: 16 }} href={`/api/export?pin=${encodeURIComponent(pin)}`}>Download CSV (all registrations)</a>
      </div>
    </div>
  );
}
