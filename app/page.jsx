'use client';
import { useEffect, useRef, useState } from 'react';

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.body.appendChild(s);
  });
}
const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
const onlyDigits = (v, max) => v.replace(/\D/g, '').slice(0, max);          // numbers only
const onlyName = (v) => v.replace(/[^\p{L}\s'.\-]/gu, '').slice(0, 40);    // letters/space/'-.
const noSpaces = (v) => v.replace(/\s+/g, '').slice(0, 120);                 // email: no spaces

function TierSection({ title, icon, tiers, cart, setQty, note }) {
  if (!tiers || tiers.length === 0) return null;
  const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
const onlyDigits = (v, max) => v.replace(/\D/g, '').slice(0, max);          // numbers only
const onlyName = (v) => v.replace(/[^\p{L}\s'.\-]/gu, '').slice(0, 40);    // letters/space/'-.
const noSpaces = (v) => v.replace(/\s+/g, '').slice(0, 120);                 // email: no spaces
  return (
    <div style={{ marginTop: 18 }}>
      <div className="sechead"><span className="sec-ic">{icon}</span><span>{title}</span></div>
      {note && <div className="hint" style={{ margin: '2px 0 8px' }}>{note}</div>}
      <div className="stack">
        {tiers.map((t) => (
          <div key={t.id} className={`tier ${t.soldOut ? 'out' : ''}`} style={{ cursor: 'default' }}>
            <div className="grow">
              <div className="nm">{t.name}</div>
              {t.description && <div className="ds">{t.description}</div>}
              {t.admits > 1 && <div className="ds">Admits {t.admits} people</div>}
              {t.remaining != null && t.remaining <= 25 && !t.soldOut && <div className="ds">Only {t.remaining} left</div>}
              {t.soldOut && <div className="ds">Sold out</div>}
              <div className="pr" style={{ marginLeft: 0, marginTop: 6 }}>{t.is_comp || t.price_cents === 0 ? 'Free' : money(t.price_cents)}</div>
            </div>
            {!t.soldOut && (
              <div className="stepper" style={{ alignSelf: 'center' }}>
                <button type="button" onClick={() => setQty(t.id, (cart[t.id] || 0) - 1)}>−</button>
                <input value={cart[t.id] || 0} onChange={(e) => setQty(t.id, parseInt(e.target.value, 10) || 0)} />
                <button type="button" onClick={() => setQty(t.id, (cart[t.id] || 0) + 1)}>+</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Buy() {
  const [ev, setEv] = useState(null);
  const [cart, setCart] = useState({});           // { ticketTypeId: qty }
  const [buyer, setBuyer] = useState({ first: '', last: '', email: '', mobile: '', mobile2: '', zip: '' });
  const [stage, setStage] = useState('pick');     // pick | pay | done
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [order, setOrder] = useState(null);
  const dropinRef = useRef(null);
  const instRef = useRef(null);
  const [payReady, setPayReady] = useState(false);
  const [payError, setPayError] = useState('');
  const [payAttempt, setPayAttempt] = useState(0);

  useEffect(() => {
    document.body.classList.add('buyer-festive');
    return () => document.body.classList.remove('buyer-festive');
  }, []);

  useEffect(() => {
    fetch('/api/event', { cache: 'no-store' }).then((r) => r.json())
      .then((d) => d.error ? setErr('No event is open for sales yet.') : setEv(d))
      .catch(() => setErr('Could not load the event.'));
  }, []);

  const tiers = ev?.ticketTypes || [];
  const entryTiers = tiers.filter((t) => (t.category || 'entry') !== 'food');
  const foodTiers = tiers.filter((t) => (t.category || 'entry') === 'food');
  const setQty = (id, q) => setCart((c) => ({ ...c, [id]: Math.max(0, q) }));
  const lineItems = tiers.filter((t) => (cart[t.id] || 0) > 0).map((t) => ({ ...t, qty: cart[t.id] }));
  const itemCount = lineItems.reduce((s, t) => s + t.qty, 0);
  const subtotalCents = lineItems.reduce((s, t) => s + (t.is_comp ? 0 : t.price_cents * t.qty), 0);
  const feePct = Number(ev?.convenience_fee_pct) || 0;
  const feeCents = subtotalCents > 0 ? Math.round(subtotalCents * feePct / 100) : 0;
  const totalCents = subtotalCents + feeCents;

  function validateBuyer() {
    if (!itemCount) return 'Select at least one ticket.';
    if (!buyer.first.trim() || !buyer.last.trim()) return 'First and last name are required.';
    const email = buyer.email.trim();
    if (!email) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Please enter a valid email address.';
    const digits = buyer.mobile.replace(/\D/g, '');
    if (!buyer.mobile.trim()) return 'Mobile number is required.';
    if (digits.length !== 10) return 'Mobile number must be exactly 10 digits.';
    if (buyer.mobile.replace(/\D/g, '') !== buyer.mobile2.replace(/\D/g, '')) return 'Mobile numbers do not match. Please re-enter to confirm.';
    const zip = buyer.zip.trim();
    if (zip && !/^\d{5}$/.test(zip)) return 'Zip code must be 5 digits.';
    return '';
  }

  function goPay() {
    const v = validateBuyer(); if (v) return setErr(v);
    setErr('');
    if (totalCents === 0) return submit(null);
    setStage('pay'); setPayAttempt((n) => n + 1);
  }

  // Build the Braintree Drop-in only once the pay screen (and its container) is on screen.
  useEffect(() => {
    if (stage !== 'pay' || payAttempt === 0) return;
    let cancelled = false;
    setPayReady(false); setPayError(''); setErr('');
    const withTimeout = (promise, ms, msg) => Promise.race([
      Promise.resolve(promise),
      new Promise((_, rej) => setTimeout(() => rej(new Error(msg || 'timeout')), ms)),
    ]);
    (async () => {
      try {
        const tokenRes = await withTimeout(fetch('/api/client-token', { cache: 'no-store' }), 12000, 'token');
        const tokenData = await tokenRes.json().catch(() => ({}));
        if (!tokenRes.ok || !tokenData.clientToken) throw new Error('token');
        await withTimeout(loadScript('https://js.braintreegateway.com/web/dropin/1.43.0/js/dropin.min.js'), 12000, 'script');
        if (cancelled) return;
        if (!window.braintree?.dropin) throw new Error('script');
        // wait a tick so the (now visible) container is laid out before Braintree measures it
        await new Promise((r) => setTimeout(r, 60));
        if (!dropinRef.current) throw new Error('script');
        if (instRef.current) { await instRef.current.teardown().catch(() => {}); instRef.current = null; }
        const inst = await withTimeout(
          window.braintree.dropin.create({ authorization: tokenData.clientToken, container: dropinRef.current, card: { cardholderName: { required: true } } }),
          15000, 'create');
        if (cancelled) { await inst.teardown().catch(() => {}); return; }
        instRef.current = inst;
        setPayReady(true);
      } catch (e) {
        if (cancelled) return;
        setPayError(e.message === 'token'
          ? 'Payment is temporarily unavailable. Please try again in a moment.'
          : 'Payment form could not load — check your connection or any ad/privacy blocker, then retry.');
      }
    })();
    return () => { cancelled = true; };
  }, [stage, payAttempt]);

  async function pay() {
    if (!payReady || !instRef.current) return;
    setErr(''); setBusy(true);
    try { const { nonce } = await instRef.current.requestPaymentMethod(); await submit(nonce); }
    catch (e) { setErr('Please complete the card details.'); setBusy(false); }
  }

  async function submit(nonce) {
    setBusy(true); setErr('');
    try {
      const items = lineItems.map((t) => ({ ticketTypeId: t.id, qty: t.qty }));
      const res = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, buyer, paymentMethodNonce: nonce }) });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErr(data.message || 'Payment could not be completed.'); setBusy(false);
        if (data.error === 'sold_out') setStage('pick');
        return;
      }
      if (instRef.current) { try { await instRef.current.teardown(); } catch (e) {} instRef.current = null; }
      setOrder({ ...data, buyerName: `${buyer.first} ${buyer.last}`.trim() });
      setStage('done');
    } catch (e) { setErr('Something went wrong. Please try again.'); }
    setBusy(false);
  }

  function reset() { setOrder(null); setCart({}); setBuyer({ first: '', last: '', email: '', mobile: '', mobile2: '', zip: '' }); setPayReady(false); setPayError(''); setStage('pick'); }

  if (err && !ev && stage === 'pick') return <div className="wrap"><div className="card">{err}</div></div>;
  if (!ev) return <div className="wrap"><div className="card">Loading…</div></div>;

  // ---------- DONE ----------
  if (stage === 'done' && order) return (
    <div className="wrap">
      <div className="eyebrow">You're in</div>
      <div className="pass" style={{ marginBottom: 14 }}>
        <div className="body">
          <div className="brandline">🎟 {ev.name}</div>
          <div className="who">{order.buyerName}</div>
          <div style={{ marginTop: 10 }}>
            {order.items.filter((it) => (it.category || 'entry') !== 'food').length > 0 && <div className="passgrp">Event Entry</div>}
            {order.items.filter((it) => (it.category || 'entry') !== 'food').map((it) => (
              <div key={it.typeName} className="row" style={{ justifyContent: 'space-between', fontSize: 14, padding: '2px 0' }}><span>{it.typeName}</span><span style={{ fontWeight: 700 }}>× {it.qty}</span></div>
            ))}
            {order.items.filter((it) => (it.category || 'entry') === 'food').length > 0 && <div className="passgrp">Food Coupons</div>}
            {order.items.filter((it) => (it.category || 'entry') === 'food').map((it) => (
              <div key={it.typeName} className="row" style={{ justifyContent: 'space-between', fontSize: 14, padding: '2px 0' }}><span>{it.typeName}</span><span style={{ fontWeight: 700 }}>× {it.qty}</span></div>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 12 }}>{ev.date || 'Date TBA'} · {ev.venue || ''}</p>
        </div>
        <div className="stub">
          <div className="qrbox"><img src={`/api/qr?token=${encodeURIComponent(order.token)}`} alt="Entry QR" width="200" height="200" style={{ display: 'block' }} /></div>
          <div className="code">{order.code}</div>
          <div className="cpn" style={{ fontSize: 10 }}>one code for the group</div>
        </div>
      </div>
      <p className="hint">{order.emailed ? `A copy is on its way to ${buyer.email}.` : 'Save or screenshot this ticket.'} One QR admits your whole group. Food coupons are issued at check-in.</p>
      <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={reset}>Buy more tickets</button>
    </div>
  );

  // ---------- PAY ----------
  if (stage === 'pay') return (
    <div className="wrap">
      <div className="eyebrow">Payment</div>
      <div className="card stack">
        <div>
          {lineItems.map((t) => (
            <div key={t.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span>{t.name} × {t.qty}</span><span>{t.is_comp ? 'Free' : money(t.price_cents * t.qty)}</span>
            </div>
          ))}
          <div className="divider" />
          <div className="row" style={{ justifyContent: 'space-between' }}><span>Subtotal</span><span>{money(subtotalCents)}</span></div>
          {feeCents > 0 && <div className="row" style={{ justifyContent: 'space-between' }}><span>Convenience fee ({feePct}%)</span><span>{money(feeCents)}</span></div>}
          <div className="row" style={{ justifyContent: 'space-between', fontWeight: 800, marginTop: 2 }}>
            <span>Total</span><span>{money(totalCents)}</span>
          </div>
        </div>
        {!payReady && !payError && <div className="hint" style={{ textAlign: 'center', padding: '18px 0' }}>Loading secure payment form…</div>}
        <div ref={dropinRef} style={{ minHeight: payReady ? 40 : 0 }} />
        {payError && (
          <div>
            <div className="err">{payError}</div>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => setPayAttempt((n) => n + 1)}>Retry</button>
          </div>
        )}
        {err && <div className="err">{err}</div>}
        {payReady && <button className="btn btn-go btn-block" disabled={busy} onClick={pay}>{busy ? 'Processing…' : `Pay ${money(totalCents)}`}</button>}
        <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => { setStage('pick'); setErr(''); setPayError(''); if (instRef.current) { instRef.current.teardown().catch(() => {}); instRef.current = null; } setPayReady(false); }}>Back</button>
      </div>
    </div>
  );

  // ---------- PICK ----------
  return (
    <div className="wrap">
      {ev.flyer_url ? <img className="flyer" src={ev.flyer_url} alt={`${ev.name} flyer`} /> : null}
      <div className="event-hero">
        <div className="eh-glow" aria-hidden="true" />
        <div className="eh-inner">
          {ev.tagline && <div className="eh-eyebrow">{ev.tagline}</div>}
          <h2 className="eh-title">{ev.name}</h2>
          <div className="eh-chips">
            {(() => {
              const dateStr = [ev.start_date, ev.end_date && ev.end_date !== ev.start_date ? ev.end_date : null].filter(Boolean).join(' – ') || ev.date;
              const timeStr = [ev.start_time, ev.end_time].filter(Boolean).join(' – ');
              return (<>
                {dateStr && <span className="eh-chip">📅 {dateStr}</span>}
                {timeStr && <span className="eh-chip">🕒 {timeStr}</span>}
                {ev.venue && <span className="eh-chip">📍 {ev.venue}</span>}
              </>);
            })()}
          </div>
          {ev.details && <p className="eh-details">{ev.details}</p>}
        </div>
      </div>
      {(ev.pricing_note || ev.pricing_deadline) ? (
        <div className="pricebanner">
          {ev.pricing_deadline ? <div className="pb-deadline">⏰ {ev.pricing_deadline}</div> : null}
          {ev.pricing_note ? <><div className="pb-h">💡 Pricing</div><div className="pb-b">{ev.pricing_note}</div></> : null}
        </div>
      ) : null}

      <TierSection title="Event Entry" icon="🎟" tiers={entryTiers} cart={cart} setQty={setQty} />
      <TierSection title="Food Coupons" icon="🍽" tiers={foodTiers} cart={cart} setQty={setQty}
        note="Prepaid food coupons — redeem at the food stalls." />

      {itemCount > 0 && (
        <div className="card stack" style={{ marginTop: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Your order</div>
          <table className="cart-tbl"><tbody>
            {lineItems.filter((t) => (t.category || 'entry') !== 'food').length > 0 && <tr className="grp"><td colSpan={3}>Event Entry</td></tr>}
            {lineItems.filter((t) => (t.category || 'entry') !== 'food').map((t) => (
              <tr key={t.id}><td>{t.name}</td><td className="q">×{t.qty}</td><td className="p">{t.is_comp || t.price_cents === 0 ? 'Free' : money(t.price_cents * t.qty)}</td></tr>
            ))}
            {lineItems.filter((t) => (t.category || 'entry') === 'food').length > 0 && <tr className="grp"><td colSpan={3}>Food Coupons</td></tr>}
            {lineItems.filter((t) => (t.category || 'entry') === 'food').map((t) => (
              <tr key={t.id}><td>{t.name}</td><td className="q">×{t.qty}</td><td className="p">{t.is_comp || t.price_cents === 0 ? 'Free' : money(t.price_cents * t.qty)}</td></tr>
            ))}
          </tbody></table>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <span>{itemCount} ticket{itemCount > 1 ? 's' : ''}</span><span>{subtotalCents ? money(subtotalCents) : 'Free'}</span>
          </div>
          {feeCents > 0 && <div className="row" style={{ justifyContent: 'space-between' }}><span>Convenience fee ({feePct}%)</span><span>{money(feeCents)}</span></div>}
          {feeCents > 0 && <div className="row" style={{ justifyContent: 'space-between', fontWeight: 800 }}><span>Total</span><span>{money(totalCents)}</span></div>}
          <div className="divider" />
          <div className="row">
            <div className="grow"><label className="f">First name *</label><input value={buyer.first} onChange={(e) => setBuyer({ ...buyer, first: onlyName(e.target.value) })} placeholder="Jane" /></div>
            <div className="grow"><label className="f">Last name *</label><input value={buyer.last} onChange={(e) => setBuyer({ ...buyer, last: onlyName(e.target.value) })} placeholder="Rao" /></div>
          </div>
          <div><label className="f">Email Id *</label><input type="email" inputMode="email" value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: noSpaces(e.target.value) })} onBlur={(e) => setBuyer({ ...buyer, email: e.target.value.trim().toLowerCase() })} placeholder="jane@email.com" /></div>
          <div className="row">
            <div className="grow"><label className="f">Mobile number *</label><input type="tel" inputMode="numeric" maxLength={10} value={buyer.mobile} onChange={(e) => setBuyer({ ...buyer, mobile: onlyDigits(e.target.value, 10) })} placeholder="10-digit mobile" /></div>
            <div style={{ width: 130 }}><label className="f">Zip code</label><input inputMode="numeric" maxLength={5} value={buyer.zip} onChange={(e) => setBuyer({ ...buyer, zip: onlyDigits(e.target.value, 5) })} placeholder="75070" /></div>
          </div>
          <div><label className="f">Confirm mobile number *</label>
            <input type="tel" inputMode="numeric" maxLength={10} value={buyer.mobile2}
              onChange={(e) => setBuyer({ ...buyer, mobile2: onlyDigits(e.target.value, 10) })}
              onPaste={(e) => e.preventDefault()} placeholder="Re-enter 10-digit mobile" />
            {buyer.mobile2 && buyer.mobile.replace(/\D/g, '') !== buyer.mobile2.replace(/\D/g, '') && <div className="hint" style={{ color: '#C62828', marginTop: 4 }}>Numbers don't match yet.</div>}
          </div>
          {err && <div className="err">{err}</div>}
          <button className="btn btn-primary btn-block" disabled={busy} onClick={goPay}>
            {totalCents ? `Continue to payment · ${money(totalCents)}` : 'Get tickets'}
          </button>
        </div>
      )}
    </div>
  );
}
