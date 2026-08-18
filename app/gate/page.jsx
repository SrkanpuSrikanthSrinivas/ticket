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
const initials = (s) => String(s || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';

export default function Gate() {
  const [pin, setPin] = useState('');
  const [authed, setAuthed] = useState(false);
  const [mode, setMode] = useState('type');
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState(null);
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
    if (!data.matches?.length) { setCard({ kind: 'none', q: val }); return; }
    if (data.matches.length === 1) return showReady(data.matches[0]);
    setMatches(data.matches);
  }

  function showReady(m) {
    setMatches(null);
    if (m.status === 'checked_in') setCard({ kind: 'warn', ...m });
    else setCard({ kind: 'ready', ...m });
  }

  async function doCheckin(ticketId) {
    setBusy(true);
    const res = await fetch('/api/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId, staffPin: pin }) });
    const data = await res.json(); setBusy(false);
    if (data.ok) setCard({ kind: 'ok', ...data.ticket });
    else setCard({ kind: 'warn', ...(data.ticket || {}), buyer_name: data.ticket?.buyer_name });
  }

  function reset() { setQ(''); setMatches(null); setCard(null); }

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
            <button className={mode === 'type' ? 'on' : ''} onClick={() => { setMode('type'); stopScan(); }}>Type / search</button>
            <button className={mode === 'scan' ? 'on' : ''} onClick={() => { setMode('scan'); startScan(); }}>Scan QR</button>
          </div>
          {mode === 'type' ? (
            <div style={{ marginTop: 14 }}>
              <div className="row">
                <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ticket code, name, or email"
                  onKeyDown={(e) => e.key === 'Enter' && lookup()} />
                <button className="btn btn-primary" disabled={busy} onClick={() => lookup()}>Find</button>
              </div>
              <div className="hint">Type a name to see everyone who matches.</div>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}><div id="reader" /><div className="hint">Point at the ticket QR. If the camera won't open, use Type / search.</div></div>
          )}
        </div>

        {matches && (
          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 16 }}>{matches.length} matches</h3>
            <div className="divider" />
            {matches.map((m) => (
              <div key={m.id} className="li" style={{ cursor: 'pointer' }} onClick={() => showReady(m)}>
                <div className="avatar">{initials(m.buyer_name)}</div>
                <div className="grow"><div style={{ fontWeight: 600 }}>{m.buyer_name}</div><div className="hint">{m.type_name} · {m.code}</div></div>
                <span className={`pill ${m.status === 'checked_in' ? 'in' : 'reg'}`}>{m.status === 'checked_in' ? 'In' : 'Valid'}</span>
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
          <div className="result" style={{ marginTop: 16 }}>
            <div className="big">Ready at the gate</div>
            <div className="li" style={{ border: 0, padding: '12px 0 4px' }}>
              <div className="avatar">{initials(card.buyer_name)}</div>
              <div className="grow"><div style={{ fontWeight: 600, fontSize: 17 }}>{card.buyer_name}</div><div className="hint">{card.type_name} · {card.code}</div></div>
            </div>
            <button className="btn btn-go btn-block" style={{ marginTop: 8 }} disabled={busy} onClick={() => doCheckin(card.id)}>
              {busy ? 'Checking in…' : 'Check in & issue coupons'}
            </button>
          </div>
        )}

        {card?.kind === 'ok' && (
          <div className="result ok" style={{ marginTop: 16 }}>
            <div className="big"><span className="check">✓</span> {card.buyer_name} is in</div>
            <p className="hint" style={{ marginTop: 6 }}>{card.type_name}</p>
            <div className="eyebrow" style={{ marginTop: 14 }}>Coupons issued — hand these over</div>
            <div className="chips">
              {(card.coupons || []).filter((c) => c.id).map((c) => <span key={c.id} className="chip">🍽 {c.name}{c.value_cents ? ` · ${money(c.value_cents)}` : ''}</span>)}
              {(!card.coupons || card.coupons.filter((c) => c.id).length === 0) && <span className="hint">No coupons on this ticket.</span>}
            </div>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 16 }} onClick={reset}>Next guest</button>
          </div>
        )}

        {card?.kind === 'warn' && (
          <div className="result warn" style={{ marginTop: 16 }}>
            <div className="big">⚠️ Already checked in</div>
            <p className="hint" style={{ marginTop: 6 }}>{card.buyer_name} — {card.type_name}{card.checked_in_at ? ` · ${new Date(card.checked_in_at).toLocaleString()}` : ''}.</p>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={reset}>Next guest</button>
          </div>
        )}
      </div>
    </div>
  );
}
