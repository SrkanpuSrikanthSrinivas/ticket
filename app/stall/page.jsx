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

export default function Stall() {
  const [pin, setPin] = useState('');
  const [authed, setAuthed] = useState(false);
  const [mode, setMode] = useState('type');
  const [q, setQ] = useState('');
  const [state, setState] = useState(null); // { kind:'none'|'notin'|'ticket', ticket }
  const [busy, setBusy] = useState(false);
  const scannerRef = useRef(null);

  useEffect(() => () => stopScan(), []);
  function stopScan() { if (scannerRef.current) { try { scannerRef.current.stop().then(() => scannerRef.current?.clear()).catch(() => {}); } catch {} scannerRef.current = null; } }
  async function startScan() {
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js');
      stopScan();
      scannerRef.current = new window.Html5Qrcode('reader');
      await scannerRef.current.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 } },
        (txt) => { stopScan(); setMode('type'); lookup(txt); }, () => {});
    } catch (e) {}
  }

  async function lookup(text) {
    const val = (text ?? q).trim(); if (!val) return;
    setBusy(true); setState(null);
    const res = await fetch('/api/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: val, staffPin: pin }) });
    if (res.status === 401) { setAuthed(false); setBusy(false); return; }
    const data = await res.json();
    if (!data.matches?.length) { setBusy(false); setState({ kind: 'none', q: val }); return; }
    const m = data.matches[0];
    if (m.status === 'valid') { setBusy(false); setState({ kind: 'notin', name: m.buyer_name }); return; }
    await loadOrder(m.id);
  }

  async function loadOrder(orderId) {
    setBusy(true);
    const res = await fetch('/api/ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, staffPin: pin }) });
    const data = await res.json(); setBusy(false);
    if (data.order) setState({ kind: 'ticket', ticket: data.order, coupons: data.coupons || [] });
  }

  async function redeem(couponId, orderId) {
    setBusy(true);
    await fetch('/api/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ couponId, staffPin: pin }) });
    await loadOrder(orderId);
  }
  async function redeemAll(orderId) {
    setBusy(true);
    await fetch('/api/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redeemAll: true, orderId, staffPin: pin }) });
    await loadOrder(orderId);
  }
  function reset() { setQ(''); setState(null); }

  if (!authed) {
    const press = (d) => setPin((pin + d).slice(0, 6));
    return (
      <div>
        <div className="topbar"><b>Food coupons</b></div>
        <div className="wrap">
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Staff sign-in</div>
            <h2 style={{ fontSize: 20 }}>Enter the stall PIN</h2>
            <div className="pindots">{[0, 1, 2, 3].map((i) => <i key={i} className={pin.length > i ? 'f' : ''} />)}</div>
            <div className="pinpad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} onClick={() => press(n)}>{n}</button>)}
              <button onClick={() => setPin('')}>✕</button>
              <button onClick={() => press(0)}>0</button>
              <button onClick={() => setAuthed(pin.length >= 3)}>→</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const t = state?.kind === 'ticket' ? state.ticket : null;
  const coupons = (state?.coupons || []).filter((c) => c.id);
  const left = coupons.filter((c) => !c.redeemed).length;
  const valueLeft = coupons.filter((c) => !c.redeemed).reduce((s, c) => s + (c.value_cents || 0), 0);

  return (
    <div>
      <div className="topbar"><b>Food coupons</b></div>
      <div className="wrap">
        <div className="card">
          <div className="segment">
            <button className={mode === 'type' ? 'on' : ''} onClick={() => { setMode('type'); stopScan(); }}>Type / search</button>
            <button className={mode === 'scan' ? 'on' : ''} onClick={() => { setMode('scan'); startScan(); }}>Scan QR</button>
          </div>
          {mode === 'type' ? (
            <div className="row" style={{ marginTop: 14 }}>
              <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ticket code or name" onKeyDown={(e) => e.key === 'Enter' && lookup()} />
              <button className="btn btn-primary" disabled={busy} onClick={() => lookup()}>Find</button>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}><div id="reader" /><div className="hint">Scan the guest's ticket QR.</div></div>
          )}
        </div>

        {state?.kind === 'none' && (
          <div className="result warn" style={{ marginTop: 16 }}>
            <div className="big">No match</div>
            <p className="hint">Nothing found for “{state.q}”.</p>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={reset}>Try again</button>
          </div>
        )}

        {state?.kind === 'notin' && (
          <div className="result warn" style={{ marginTop: 16 }}>
            <div className="big">Not checked in yet</div>
            <p className="hint">{state.name} needs to check in at the gate before coupons are issued.</p>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={reset}>Back</button>
          </div>
        )}

        {t && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="li" style={{ border: 0, padding: '0 0 12px' }}>
              <div className="avatar">{initials(t.buyer_name)}</div>
              <div className="grow"><div style={{ fontWeight: 600, fontSize: 17 }}>{t.buyer_name}</div><div className="hint">{t.items} · {t.code}</div></div>
              <span className="pill in">{left} left · {money(valueLeft)}</span>
            </div>
            <div className="divider" />
            <div className="chips">
              {coupons.length === 0 && <span className="hint">No coupons on this ticket.</span>}
              {coupons.map((c) => c.redeemed
                ? <span key={c.id} className="chip done">✓ {c.name}{c.value_cents ? ` · ${money(c.value_cents)}` : ''}</span>
                : <span key={c.id} className="chip">🍽 {c.name}{c.value_cents ? ` · ${money(c.value_cents)}` : ''}
                    <button className="btn btn-go btn-sm" disabled={busy} onClick={() => redeem(c.id, t.id)}>Redeem</button></span>)}
            </div>
            {coupons.length > 0 && (
              <button className="btn btn-mari btn-block" style={{ marginTop: 14 }} disabled={busy || left === 0} onClick={() => redeemAll(t.id)}>
                {left ? `Redeem all ${left} remaining` : 'All redeemed'}
              </button>
            )}
            <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={reset}>Next guest</button>
          </div>
        )}
      </div>
    </div>
  );
}
