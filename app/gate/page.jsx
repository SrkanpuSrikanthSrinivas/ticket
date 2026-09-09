'use client';
import { useEffect, useRef, useState } from 'react';

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej; document.body.appendChild(s);
  });
}
const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
function groupCoupons(list) {
  const m = {};
  (list || []).filter((c) => c.id).forEach((c) => { const k = c.name + '|' + c.value_cents; (m[k] ||= { name: c.name, value_cents: c.value_cents, qty: 0 }).qty++; });
  return Object.values(m);
}
function splitItems(str) {
  return String(str || '').split(', ').filter(Boolean).map((part) => {
    const m = part.match(/^(.*?)\s*×\s*(\d+)$/);
    return m ? { name: m[1], qty: m[2] } : { name: part, qty: 1 };
  });
}
const initials = (s) => String(s || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';

export default function Gate() {
  const [pin, setPin] = useState('');
  const [authed, setAuthed] = useState(false);
  const [mode, setMode] = useState('type');
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [card, setCard] = useState(null);   // { kind:'ready'|'ok'|'warn', ... }
  const [busy, setBusy] = useState(false);
  const scannerRef = useRef(null);

  useEffect(() => () => stopScan(), []);

  function stopScan() {
    if (scannerRef.current) { try { scannerRef.current.stop().then(() => scannerRef.current?.clear()).catch(() => {}); } catch {} scannerRef.current = null; }
  }
  async function startScan() {
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js');
      stopScan();
      scannerRef.current = new window.Html5Qrcode('reader');
      await scannerRef.current.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 } },
        (txt) => { stopScan(); setMode('type'); lookup(txt); }, () => {});
    } catch (e) { /* camera unavailable — manual works */ }
  }

  async function lookup(text) {
    const val = (text ?? q).trim(); if (!val) return;
    setBusy(true); setMatches(null); setCard(null);
    const res = await fetch('/api/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: val, staffPin: pin }) });
    if (res.status === 401) { setAuthed(false); setBusy(false); return; }
    const data = await res.json();
    setBusy(false);
    setTruncated(!!data.truncated);
    if (!data.matches?.length) { setCard({ kind: 'none', q: val }); return; }
    if (data.matches.length === 1) return showReady(data.matches[0]);
    setMatches(data.matches);
  }

  async function showReady(m) {
    setMatches(null); setBusy(true);
    let detail = {};
    try {
      const res = await fetch('/api/ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: m.id, staffPin: pin }) });
      const data = await res.json();
      detail = { ticketRows: data.ticketRows || [], couponPreview: data.couponPreview || [], coupons: data.coupons || [], checked_in: data.order?.checked_in };
    } catch (e) {}
    setBusy(false);
    const isIn = detail.checked_in ?? (m.status === 'checked_in');
    setCard({ kind: isIn ? 'warn' : 'ready', ...m, ...detail });
  }

  async function doCheckin(orderId) {
    setBusy(true);
    const res = await fetch('/api/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, staffPin: pin }) });
    const data = await res.json(); setBusy(false);
    if (data.ok) setCard({ kind: 'ok', ...data.order, coupons: data.coupons });
    else setCard({ kind: 'warn', ...(data.order || {}), coupons: data.coupons });
  }

  useEffect(() => {
    if (mode !== 'type' && mode !== 'phone') return;
    const val = q.trim();
    const minLen = mode === 'phone' ? 3 : 2;
    if (val.length < minLen) { setMatches(null); if (card?.kind === 'none') setCard(null); return; }
    const id = setTimeout(() => lookup(val), 250);
    return () => clearTimeout(id);
  }, [q, mode]);

  function reset() { setQ(''); setMatches(null); setCard(null); setTruncated(false); }

  // --- PIN sign-in ---
  if (!authed) {
    const press = (d) => { const n = (pin + d).slice(0, 6); setPin(n); };
    return (
      <div>
        <div className="topbar"><b>Gate check-in</b></div>
        <div className="wrap">
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Staff sign-in</div>
            <h2 style={{ fontSize: 20 }}>Enter the gate PIN</h2>
            <div className="pindots">{[0, 1, 2, 3].map((i) => <i key={i} className={pin.length > i ? 'f' : ''} />)}</div>
            <div className="pinpad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} onClick={() => press(n)}>{n}</button>)}
              <button onClick={() => setPin('')}>✕</button>
              <button onClick={() => press(0)}>0</button>
              <button onClick={() => setAuthed(pin.length >= 3)}>→</button>
            </div>
            <p className="hint">Ask the organizer for today's PIN.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="topbar"><b>Gate check-in</b></div>
      <div className="wrap">
        <div className="card">
          <div className="segment">
            <button className={mode === 'phone' ? 'on' : ''} onClick={() => { setMode('phone'); stopScan(); setQ(''); setMatches(null); setCard(null); }}>📱 Phone</button>
            <button className={mode === 'type' ? 'on' : ''} onClick={() => { setMode('type'); stopScan(); setQ(''); setMatches(null); setCard(null); }}>🔎 Name / Email</button>
            <button className={mode === 'scan' ? 'on' : ''} onClick={() => { setMode('scan'); startScan(); setQ(''); setMatches(null); setCard(null); }}>📷 Scan QR</button>
          </div>

          {mode === 'phone' && (() => {
            const press = (dgt) => setQ((q + dgt).replace(/\D/g, '').slice(0, 10));
            return (
              <div style={{ marginTop: 14 }}>
                <div className="phone-display">{q ? q.replace(/(\d{3})(\d{3})(\d{0,4})/, (m, a, b, c) => c ? `(${a}) ${b}-${c}` : (b ? `(${a}) ${b}` : a)) : <span style={{ color: 'var(--muted)' }}>Enter phone number</span>}</div>
                <div className="pinpad numpad">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} onClick={() => press(String(n))}>{n}</button>)}
                  <button onClick={() => setQ(q.slice(0, -1))} aria-label="delete">⌫</button>
                  <button onClick={() => press('0')}>0</button>
                  <button onClick={() => setQ('')} aria-label="clear">✕</button>
                </div>
                <div className="hint" style={{ textAlign: 'center' }}>Searches as you type (from 3 digits).</div>
              </div>
            );
          })()}

          {mode === 'type' && (
            <div style={{ marginTop: 14 }}>
              <div className="row">
                <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, order code, or transaction id"
                  onKeyDown={(e) => e.key === 'Enter' && lookup()} autoFocus />
                <button className="btn btn-primary" disabled={busy} onClick={() => lookup()}>Find</button>
              </div>
              <div className="hint">Type a name, email, order code (MKANT-…), or Braintree transaction id.</div>
            </div>
          )}

          {mode === 'scan' && (
            <div style={{ marginTop: 12 }}><div id="reader" /><div className="hint">Point at the ticket QR. If the camera won't open, use another tab.</div></div>
          )}
        </div>

        {matches && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3 style={{ fontSize: 16 }}>{truncated ? '50+ matches' : `${matches.length} match${matches.length === 1 ? '' : 'es'}`}</h3>
              {truncated && <span className="hint">Keep typing to narrow</span>}
            </div>
            <div className="divider" />
            {matches.map((m) => (
              <div key={m.id} className="li" style={{ cursor: 'pointer' }} onClick={() => showReady(m)}>
                <div className="avatar">{initials(m.buyer_name)}</div>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{m.buyer_name}</div>
                  <div className="hint">{m.items} · {m.guests} guest{m.guests === 1 ? '' : 's'}</div>
                </div>
                <span className={`pill ${m.status === 'checked_in' ? 'in' : 'reg'}`}>
                  {m.status === 'checked_in' ? `In${m.checked_in_at ? ' · ' + new Date(m.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}` : 'Valid'}
                </span>
              </div>
            ))}
          </div>
        )}

        {card?.kind === 'none' && (
          <div className="result warn" style={{ marginTop: 16 }}>
            <div className="big">No match</div>
            <p className="hint">Nothing found for “{card.q}”. Check the code or search by name.</p>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={reset}>Try again</button>
          </div>
        )}

        {card?.kind === 'ready' && (
          <div className="gcard ready">
            <div className="ghead">
              <div className="gav">{initials(card.buyer_name)}</div>
              <div><div className="gname">{card.buyer_name}</div><div className="gsub">Ready to check in</div></div>
              <div className="gbadge"><div className="gn">{card.guests}</div><div className="gl">guest{card.guests === 1 ? '' : 's'}</div></div>
            </div>
            <div className="gbody">
              {(() => {
                const rows = card.ticketRows?.length ? card.ticketRows : splitItems(card.items).map((x) => ({ ...x, category: 'entry' }));
                const entry = rows.filter((r) => (r.category || 'entry') !== 'food');
                const food = rows.filter((r) => (r.category || 'entry') === 'food');
                return (<>
                  {entry.length > 0 && <><div className="gsec">🎟 Entry tickets</div>
                    <div className="gitems">{entry.map((it, i) => <div className="gitem" key={i}><span>{it.name}</span><span className="gq">{it.qty}</span></div>)}</div></>}
                  {food.length > 0 && <><div className="gsec" style={{ marginTop: 12 }}>🍽 Food coupon tickets</div>
                    <div className="gitems">{food.map((it, i) => <div className="gitem" key={i}><span>{it.name}</span><span className="gq">{it.qty}</span></div>)}</div></>}
                </>);
              })()}
              {card.couponPreview?.length > 0 && (<>
                <div className="gsec" style={{ marginTop: 14 }}>🍽 Food coupons to issue</div>
                <div className="gitems">{card.couponPreview.map((c, i) => (
                  <div className="gitem" key={i}><span>🍽 {c.name}</span><span className="gq">{c.qty}</span></div>
                ))}</div>
              </>)}
              <div className="gcode" style={{ marginTop: 10 }}>{card.code}</div>
              <button className="btn btn-go btn-block" style={{ marginTop: 14 }} disabled={busy} onClick={() => doCheckin(card.id)}>
                {busy ? 'Checking in…' : `Check in & issue coupons`}
              </button>
            </div>
          </div>
        )}

        {card?.kind === 'ok' && (
          <div className="gcard ok">
            <div className="ghead">
              <div className="gav"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></div>
              <div><div className="gname">{card.buyer_name}</div><div className="gsub">Checked in · {card.items}</div></div>
              <div className="gbadge"><div className="gn">{card.guests}</div><div className="gl">in</div></div>
            </div>
            <div className="gbody">
              <div className="gsec">🍽 Coupons to hand over</div>
              <div className="gitems">
                {groupCoupons(card.coupons).map((c, i) => <div className="gitem" key={i}><span>🍽 {c.name}{c.value_cents ? ` · ${money(c.value_cents)}` : ''}</span><span className="gq">{c.qty}</span></div>)}
                {groupCoupons(card.coupons).length === 0 && <div className="hint">No coupons for this order.</div>}
              </div>
              <div className="coupon-total"><span className="ct-l">Total value</span><span className="ct-v">{money((card.coupons || []).reduce((s, c) => s + (c.value_cents || 0), 0))}</span></div>
              <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={reset}>Next group →</button>
            </div>
          </div>
        )}

        {card?.kind === 'warn' && (
          <div className="gcard warn">
            <div className="ghead">
              <div className="gav">{initials(card.buyer_name)}</div>
              <div><div className="gname">{card.buyer_name}</div><div className="gsub">⚠️ Already checked in{card.checked_in_at ? ` · ${new Date(card.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</div></div>
            </div>
            <div className="gbody">
              <div className="gsub" style={{ color: 'var(--muted)' }}>{card.items}</div>
              <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={reset}>Next group</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
