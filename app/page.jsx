'use client';
import { useEffect, useRef, useState } from 'react';

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.body.appendChild(s);
  });
}
const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;

function TierSection({ title, icon, tiers, cart, setQty, note }) {
  if (!tiers || tiers.length === 0) return null;
  const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
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
  const [buyer, setBuyer] = useState({ first: '', last: '', email: '', mobile: '', zip: '' });
  const [stage, setStage] = useState('pick');     // pick | pay | done
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [order, setOrder] = useState(null);
  const dropinRef = useRef(null);
  const instRef = useRef(null);

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
  const amountCents = lineItems.reduce((s, t) => s + (t.is_comp ? 0 : t.price_cents * t.qty), 0);

  function validateBuyer() {
    if (!itemCount) return 'Select at least one ticket.';
    if (!buyer.first.trim() || !buyer.last.trim()) return 'First and last name are required.';
    if (!buyer.email.trim()) return 'Email is required.';
    if (!buyer.mobile.trim()) return 'Mobile number is required.';
    return '';
  }

  async function goPay() {
    const v = validateBuyer(); if (v) return setErr(v);
    setErr('');
    if (amountCents === 0) return submit(null);
    setStage('pay'); setBusy(true);
    try {
      const { clientToken } = await (await fetch('/api/client-token')).json();
      await loadScript('https://js.braintreegateway.com/web/dropin/1.43.0/js/dropin.min.js');
      if (instRef.current) { await instRef.current.teardown().catch(() => {}); instRef.current = null; }
      instRef.current = await window.braintree.dropin.create({ authorization: clientToken, container: dropinRef.current, card: { cardholderName: { required: true } } });
    } catch (e) { setErr('Payment form failed to load. Please retry.'); setStage('pick'); }
    setBusy(false);
  }

  async function pay() {
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

  function reset() { setOrder(null); setCart({}); setBuyer({ first: '', last: '', email: '', mobile: '', zip: '' }); setStage('pick'); }

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
          <div className="qrbox"><img src={`/api/qr?token=${encodeURIComponent(order.token)}`} alt="Entry QR" width="150" height="150" style={{ display: 'block', width: 150, height: 150 }} /></div>
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
          <div className="row" style={{ justifyContent: 'space-between', fontWeight: 800 }}>
            <span>Total</span><span>{money(amountCents)}</span>
          </div>
        </div>
        <div ref={dropinRef} />
        {err && <div className="err">{err}</div>}
        <button className="btn btn-go btn-block" disabled={busy} onClick={pay}>{busy ? 'Processing…' : `Pay ${money(amountCents)}`}</button>
        <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => { setStage('pick'); setErr(''); }}>Back</button>
      </div>
    </div>
  );

  // ---------- PICK ----------
  return (
    <div className="wrap">
      {ev.flyer_url ? <img className="flyer" src={ev.flyer_url} alt={`${ev.name} flyer`} /> : null}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 22, color: 'var(--plum)' }}>{ev.name}</h2>
        {(ev.date || ev.venue) && <div className="hint" style={{ marginTop: 4 }}>{[ev.date, ev.venue].filter(Boolean).join(' · ')}</div>}
        {ev.tagline && <p style={{ margin: '10px 0 0', color: '#443c50' }}>{ev.tagline}</p>}
        {ev.details && <p style={{ margin: '10px 0 0', color: 'var(--muted)', whiteSpace: 'pre-line', lineHeight: 1.55 }}>{ev.details}</p>}
      </div>
      {ev.pricing_note ? (
        <div className="pricebanner">
          <div className="pb-h">💡 Pricing</div>
          <div className="pb-b">{ev.pricing_note}</div>
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
          <div className="row" style={{ justifyContent: 'space-between', fontWeight: 800, marginTop: 6 }}>
            <span>{itemCount} ticket{itemCount > 1 ? 's' : ''}</span><span>{amountCents ? money(amountCents) : 'Free'}</span>
          </div>
          <div className="divider" />
          <div className="row">
            <div className="grow"><label className="f">First name *</label><input value={buyer.first} onChange={(e) => setBuyer({ ...buyer, first: e.target.value })} placeholder="Jane" /></div>
            <div className="grow"><label className="f">Last name *</label><input value={buyer.last} onChange={(e) => setBuyer({ ...buyer, last: e.target.value })} placeholder="Rao" /></div>
          </div>
          <div><label className="f">Email Id *</label><input type="email" value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} placeholder="jane@email.com" /></div>
          <div className="row">
            <div className="grow"><label className="f">Mobile number *</label><input type="tel" value={buyer.mobile} onChange={(e) => setBuyer({ ...buyer, mobile: e.target.value })} placeholder="(469) …" /></div>
            <div style={{ width: 130 }}><label className="f">Zip code</label><input value={buyer.zip} onChange={(e) => setBuyer({ ...buyer, zip: e.target.value })} placeholder="75070" /></div>
          </div>
          {err && <div className="err">{err}</div>}
          <button className="btn btn-primary btn-block" disabled={busy} onClick={goPay}>
            {amountCents ? `Continue to payment · ${money(amountCents)}` : 'Get tickets'}
          </button>
        </div>
      )}
    </div>
  );
}