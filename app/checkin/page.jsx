'use client';
import { useEffect, useState } from 'react';
import s from './checkin.module.css';

// Gate check-in for an imported (externally registered) event.
// Separate from the Janapada Jaatre gate at /gate — uses /api/ext/* only.

const usd = (n) => `$${(Number(n) || 0).toFixed(2).replace(/\.00$/, '')}`;
const initials = (a, b) => (`${(a || '?')[0] || ''}${(b || '')[0] || ''}`).toUpperCase() || '?';
const fmtPhone = (d) => String(d || '').replace(/(\d{3})(\d{3})(\d{0,4})/, (m, a, b, c) => (c ? `(${a}) ${b}-${c}` : b ? `(${a}) ${b}` : a));
const time = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
const fmtReg = (t) => {
  if (!t) return '—';
  const d = new Date(String(t).replace(' ', 'T'));
  return isNaN(d) ? String(t) : d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

function memberClass(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('gold')) return s.gold;
  if (t.includes('patron')) return s.patron;
  if (t.includes('family')) return s.family;
  if (t.includes('single')) return s.single;
  return s.nonmember;
}
function MemberChip({ a }) {
  const t = a.membership_type;
  return <span className={`${s.chip} ${memberClass(t)}`}>{String(t || '').toLowerCase().includes('gold') ? '★ ' : ''}{t || 'Non-member'}</span>;
}
const PAY_LABEL = { paid: 'Payment successful', free: 'Complimentary (member)', unconfirmed: 'Payment NOT confirmed', failed: 'Payment failed' };
function PayChip({ a }) {
  return <span className={`${s.chip} ${s[a.pay_state]}`}>{a.pay_state === 'paid' ? '✓ ' : a.pay_state === 'free' ? '' : '⚠ '}{PAY_LABEL[a.pay_state]}</span>;
}

export default function ExtCheckin() {
  const pin = process.env.NEXT_PUBLIC_GATE_PIN || '';
  const [events, setEvents] = useState(null);
  const [eventId, setEventId] = useState('');
  const [mode, setMode] = useState('phone');
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [sel, setSel] = useState(null);
  const [justIn, setJustIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function loadEvents(keep) {
    try {
      const r = await fetch(`/api/ext/events?pin=${encodeURIComponent(pin)}&t=${Date.now()}`, { cache: 'no-store' });
      if (r.status === 401) { setErr('auth'); return; }
      const d = await r.json();
      setEvents(d.events || []);
      if (!keep && d.events?.length) {
        let saved = ''; try { saved = localStorage.getItem('extEventId') || ''; } catch (e) {}
        setEventId(d.events.some((e) => e.id === saved) ? saved : d.events[0].id);
      }
    } catch (e) { setErr('Could not load events.'); }
  }
  useEffect(() => { if (pin) loadEvents(false); }, []);
  useEffect(() => { if (eventId) { try { localStorage.setItem('extEventId', eventId); } catch (e) {} } reset(); }, [eventId]);

  async function lookup(val) {
    setBusy(true);
    try {
      const r = await fetch('/api/ext/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staffPin: pin, eventId, q: val }) });
      const d = await r.json();
      setMatches(d.matches || []); setTruncated(!!d.truncated);
      if ((d.matches || []).length === 1) { setSel(d.matches[0]); setJustIn(false); }
    } catch (e) { setErr('Search failed — check the connection.'); }
    setBusy(false);
  }

  useEffect(() => {
    if (!eventId) return;
    const val = q.trim();
    const min = mode === 'phone' ? 3 : 2;
    if (val.length < min) { setMatches(null); return; }
    const t = setTimeout(() => lookup(val), 250);
    return () => clearTimeout(t);
  }, [q, mode, eventId]);

  async function checkIn(a) {
    const guests = a.adults + a.children;
    if ((a.pay_state === 'unconfirmed' || a.pay_state === 'failed') &&
      !window.confirm(`${PAY_LABEL[a.pay_state]} for ${a.first_name} ${a.last_name}.\n\nCheck in ${guests} guest(s) anyway?`)) return;
    setBusy(true);
    try {
      const r = await fetch('/api/ext/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staffPin: pin, id: a.id }) });
      const d = await r.json();
      if (d.attendee) {
        setSel(d.attendee); setJustIn(!!d.ok);
        setMatches((m) => (m ? m.map((x) => (x.id === d.attendee.id ? d.attendee : x)) : m));
        loadEvents(true);
      } else setErr(d.message || 'Check-in failed.');
    } catch (e) { setErr('Check-in failed — check the connection.'); }
    setBusy(false);
  }

  function reset() { setQ(''); setMatches(null); setSel(null); setJustIn(false); setErr(''); }

  if (!pin || err === 'auth') {
    return (
      <div><div className="topbar"><b>Event check-in</b></div>
        <div className="wrap"><div className="card" style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 18 }}>Check-in access isn't set up</h2>
          <p className="hint">Ask the organizer to set <b>NEXT_PUBLIC_GATE_PIN</b> (to the staff PIN) and redeploy.</p>
        </div></div>
      </div>
    );
  }

  const ev = events?.find((e) => e.id === eventId);
  const expected = ev ? ev.adults + ev.children : 0;

  return (
    <div>
      <div className="topbar"><b>{ev ? ev.name : 'Event check-in'}</b><span style={{ marginLeft: 'auto', fontSize: 12, opacity: .85 }}>Gate check-in</span></div>
      <div className="wrap">
        {events && events.length === 0 && (
          <div className="card"><b>No event imported yet.</b><p className="hint">An organizer can import the registration export at <span className="mono">/checkin/import</span>.</p></div>
        )}

        {events && events.length > 1 && (
          <select className={s.eventSelect} value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}

        {ev && (
          <div className={s.stats}>
            <div className={s.stat}>
              <div className={s.statN}>{ev.checked_in} <small>/ {ev.registrations}</small></div>
              <div className={s.statL}>Registrations checked in</div>
              <div className={s.bar}><div className={s.barFill} style={{ width: `${ev.registrations ? (100 * ev.checked_in) / ev.registrations : 0}%` }} /></div>
            </div>
            <div className={s.stat}>
              <div className={s.statN}>{ev.people_in} <small>/ {expected}</small></div>
              <div className={s.statL}>People in · {ev.adults} adults, {ev.children} children</div>
              <div className={s.bar}><div className={s.barFill} style={{ width: `${expected ? (100 * ev.people_in) / expected : 0}%` }} /></div>
            </div>
          </div>
        )}

        {ev && (
          <div className="card">
            <div className="segment">
              <button className={mode === 'phone' ? 'on' : ''} onClick={() => { setMode('phone'); reset(); }}>📱 Phone</button>
              <button className={mode === 'text' ? 'on' : ''} onClick={() => { setMode('text'); reset(); }}>🔎 Name / Email</button>
            </div>

            {mode === 'phone' && (
              <div style={{ marginTop: 14 }}>
                <input className="phone-input" inputMode="numeric" autoComplete="off" aria-label="Phone number" autoFocus
                  value={fmtPhone(q)} placeholder="Type or paste phone number"
                  onChange={(e) => setQ(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  onPaste={(e) => { e.preventDefault(); let d = (e.clipboardData.getData('text') || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); setQ(d.slice(0, 10)); }} />
                <div className="pinpad numpad">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} onClick={() => setQ((q + n).slice(0, 10))}>{n}</button>)}
                  <button onClick={() => setQ(q.slice(0, -1))} aria-label="delete">⌫</button>
                  <button onClick={() => setQ((q + '0').slice(0, 10))}>0</button>
                  <button onClick={() => setQ('')} aria-label="clear">✕</button>
                </div>
                <div className="hint" style={{ textAlign: 'center' }}>Type, paste, or tap — searches from 3 digits.</div>
              </div>
            )}

            {mode === 'text' && (
              <div style={{ marginTop: 14 }}>
                <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
                  placeholder="First / last name, email, transaction ID, or member ID"
                  style={{ width: '100%', font: 'inherit', padding: '13px 14px', border: '1px solid var(--line)', borderRadius: 12 }} />
                <div className="hint">Searches as you type (from 2 characters).</div>
              </div>
            )}
          </div>
        )}

        {err && err !== 'auth' && <div className="err" style={{ marginTop: 12 }}>{err}</div>}
        {busy && !matches && <div className="hint" style={{ marginTop: 12 }}>Searching…</div>}

        {matches && !sel && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3 style={{ fontSize: 16 }}>{matches.length === 0 ? 'No match' : truncated ? '50+ matches' : `${matches.length} match${matches.length === 1 ? '' : 'es'}`}</h3>
              {truncated && <span className="hint">Keep typing to narrow</span>}
            </div>
            {matches.length === 0 && <p className="hint">Nothing found for “{q}”. Try the other tab, or search by last name.</p>}
            {matches.map((a) => (
              <div key={a.id} className={s.row} onClick={() => { setSel(a); setJustIn(false); }}>
                <div className="avatar">{initials(a.first_name, a.last_name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={s.rowName}>{a.first_name} {a.last_name}</div>
                  <div className={s.rowMeta}>
                    <MemberChip a={a} />
                    <span>{a.adults} adult{a.adults === 1 ? '' : 's'}{a.children ? ` · ${a.children} child${a.children === 1 ? '' : 'ren'}` : ''}</span>
                    {a.reg_count > 1 && <span className={`${s.chip} ${s.dupChip}`}>{a.reg_count} registrations</span>}
                  </div>
                </div>
                {a.checked_in_at
                  ? <span className={`${s.chip} ${s.inChip}`}>In · {time(a.checked_in_at)}</span>
                  : <span className={`${s.chip} ${s[a.pay_state]}`}>{a.pay_state === 'paid' ? 'Paid' : a.pay_state === 'free' ? 'Comp' : '⚠ Unpaid?'}</span>}
              </div>
            ))}
          </div>
        )}

        {sel && <Detail a={sel} justIn={justIn} busy={busy} onCheckIn={() => checkIn(sel)}
          onBack={() => { setSel(null); setJustIn(false); if (matches && matches.length === 1) reset(); }}
          onNext={reset} hasList={matches && matches.length > 1} />}
      </div>
    </div>
  );
}

function Detail({ a, justIn, busy, onCheckIn, onBack, onNext, hasList }) {
  const guests = a.adults + a.children;
  const already = !!a.checked_in_at && !justIn;
  const headCls = justIn ? s.headIn : already ? s.headAlready : '';
  const payBad = a.pay_state === 'unconfirmed' || a.pay_state === 'failed';

  return (
    <div className={s.card}>
      <div className={`${s.head} ${headCls}`}>
        <div className={s.avatar}>{justIn ? '✓' : initials(a.first_name, a.last_name)}</div>
        <div style={{ minWidth: 0 }}>
          <div className={s.name}>{a.first_name} {a.last_name}</div>
          <div className={s.sub}>
            {justIn ? `Checked in · ${time(a.checked_in_at)}` : already ? `⚠ Already checked in · ${time(a.checked_in_at)}` : 'Ready to check in'}
            <MemberChip a={a} />
          </div>
        </div>
        <div className={s.total}><div className={s.totalN}>{guests}</div><div className={s.totalL}>guest{guests === 1 ? '' : 's'}</div></div>
      </div>

      <div className={s.body}>
        {payBad && <div className={`${s.warn} ${s.warnRed}`}>⚠ {PAY_LABEL[a.pay_state]} — no successful payment on record{a.amount_paid ? ` for ${usd(a.amount_paid)}` : ''}. Verify before admitting.</div>}
        {a.member_expired && <div className={`${s.warn} ${s.warnAmber}`}>⚠ Membership expired on {a.member_expiry}{a.pay_state === 'free' ? ' — entry was complimentary as a member.' : '.'}</div>}
        {a.reg_count > 1 && <div className={`${s.warn} ${s.warnBlue}`}>ℹ This email has {a.reg_count} separate registrations — check each one in on its own.</div>}

        <div className={s.secTitle}>Tickets</div>
        <div className={s.guests}>
          <div className={s.guest}>Adult <span className={`${s.guestN} ${a.adults ? '' : s.zero}`}>{a.adults}</span></div>
          <div className={s.guest}>Child 5–12 <span className={`${s.guestN} ${a.children ? '' : s.zero}`}>{a.children}</span></div>
        </div>

        <div className={s.secTitle}>Payment</div>
        <div className={s.kv}>
          <div className={s.k}>Status</div><div className={s.v}><PayChip a={a} /></div>
          <div className={s.k}>Amount paid</div><div className={s.v}>{usd(a.amount_paid)}</div>
          <div className={s.k}>Method</div><div className={s.v}>{a.payment_method || '—'}</div>
          <div className={s.k}>Transaction ID</div><div className={`${s.v} mono`}>{a.txn_id || '—'}</div>
          <div className={s.k}>Pay status</div><div className={s.v}>{a.payment_status || '—'}</div>
        </div>

        <div className={s.secTitle}>Membership</div>
        <div className={s.kv}>
          <div className={s.k}>Type</div><div className={s.v}><MemberChip a={a} /></div>
          <div className={s.k}>Member ID</div><div className={`${s.v} mono`}>{a.member_id || '—'}</div>
          <div className={s.k}>Expires</div><div className={`${s.v} ${a.member_expired ? s.expired : ''}`}>{a.member_expiry ? `${a.member_expiry}${a.member_expired ? ' (expired)' : ''}` : '—'}</div>
        </div>

        <div className={s.secTitle}>Contact</div>
        <div className={s.kv}>
          <div className={s.k}>Mobile</div><div className={s.v}>{a.mobile || '—'}</div>
          <div className={s.k}>Email</div><div className={s.v}>{a.email || '—'}</div>
          <div className={s.k}>City / State</div><div className={s.v}>{[a.city, a.state].filter(Boolean).join(', ') || '—'}</div>
        </div>

        <div className={s.secTitle}>Registration</div>
        <div className={s.kv}>
          <div className={s.k}>Registered</div><div className={s.v}>{fmtReg(a.registered_at)}</div>
          {a.reg_status && <><div className={s.k}>Status</div><div className={s.v}>{a.reg_status}</div></>}
          {a.comment && <><div className={s.k}>Comment</div><div className={s.v}>{a.comment}</div></>}
        </div>

        <div className={s.actions}>
          {!a.checked_in_at && (
            <button className={`btn btn-block ${s.bigBtn} ${payBad ? s.danger : 'btn-go'}`} disabled={busy || guests === 0} onClick={onCheckIn}>
              {busy ? 'Checking in…' : payBad ? `Check in ${guests} anyway` : `Check in ${guests} guest${guests === 1 ? '' : 's'}`}
            </button>
          )}
          {a.checked_in_at && <button className={`btn btn-primary btn-block ${s.bigBtn}`} onClick={onNext}>Next guest →</button>}
          {hasList && <button className="btn btn-ghost btn-block" onClick={onBack}>← Back to results</button>}
          {!a.checked_in_at && <button className="btn btn-ghost btn-block" onClick={onNext}>Cancel</button>}
        </div>
      </div>
    </div>
  );
}
