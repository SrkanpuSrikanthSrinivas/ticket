'use client';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.body.appendChild(s);
  });
}
const money = (c) => `$${(c / 100).toFixed(2)}`;

export default function Buy() {
  const [ev, setEv] = useState(null);
  const [sel, setSel] = useState(null);
  const [qty, setQty] = useState(1);
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' });
  const [stage, setStage] = useState('pick'); // pick | pay | done
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ticket, setTicket] = useState(null);
  const dropinRef = useRef(null);
  const instRef = useRef(null);
  const qrRef = useRef(null);

  useEffect(() => {
    fetch('/api/event').then((r) => r.json())
      .then((d) => d.error ? setErr('No event is open for sales yet.') : setEv(d))
      .catch(() => setErr('Could not load the event.'));
  }, []);

  useEffect(() => {
    if (ticket && qrRef.current) QRCode.toCanvas(qrRef.current, ticket.token, { width: 172, margin: 1 });
  }, [ticket]);

  const tier = ev?.ticketTypes?.find((t) => t.id === sel);
  const isPaid = tier && !tier.is_comp && tier.price_cents > 0;
  const amountCents = tier ? tier.price_cents * qty : 0;

  async function goPay() {
    setErr('');
    if (!tier) return setErr('Please choose a ticket.');
    if (!buyer.name || !buyer.email) return setErr('Name and email are required.');
    if (!isPaid) return submit(null);
    setStage('pay'); setBusy(true);
    try {
      const { clientToken } = await (await fetch('/api/client-token')).json();
      await loadScript('https://js.braintreegateway.com/web/dropin/1.43.0/js/dropin.min.js');
      if (instRef.current) { await instRef.current.teardown().catch(() => {}); instRef.current = null; }
      instRef.current = await window.braintree.dropin.create({ authorization: clientToken, container: dropinRef.current });
    } catch (e) { setErr('Payment form failed to load. Please retry.'); setStage('pick'); }
    setBusy(false);
  }

  async function pay() {
    setErr(''); setBusy(true);
    try {
      const { nonce } = await instRef.current.requestPaymentMethod();
      await submit(nonce);
    } catch (e) { setErr('Please complete the card details.'); setBusy(false); }
  }

  async function submit(nonce) {
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketTypeId: tier.id, qty, buyer, paymentMethodNonce: nonce }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.error === 'sold_out') { setErr('Sorry — that ticket just sold out.'); setStage('pick'); }
        else setErr(data.message || 'Payment could not be completed.');
        setBusy(false); return;
      }
      setTicket({ ...data, name: buyer.name, typeName: tier.name, qty });
      setStage('done');
    } catch (e) { setErr('Something went wrong. Please try again.'); }
    setBusy(false);
  }

  if (err && !ev && stage === 'pick') return <div className="wrap"><div className="card">{err}</div></div>;
  if (!ev) return <div className="wrap"><div className="card">Loading…</div></div>;

  if (stage === 'done' && ticket) return (
    <div className="wrap">
      <div className="eyebrow">You're in</div>
      <div className="pass">
        <div className="body">
          <div className="brandline">🎟 {ev.name}</div>
          <div className="who">{ticket.name}</div>
          <span className="type">{ticket.typeName}{ticket.qty > 1 ? ` × ${ticket.qty}` : ''}</span>
          <p className="hint" style={{ marginTop: 14 }}>{ev.date || 'Date TBA'} · {ev.venue || ''}</p>
          <p className="hint">A copy is on its way to {buyer.email}. Food coupons are issued at check-in.</p>
        </div>
        <div className="stub">
          <div className="qrbox"><canvas ref={qrRef} /></div>
          <div className="code">{ticket.code}</div>
        </div>
      </div>
      <button className="btn btn-ghost btn-block" style={{ marginTop: 16 }}
        onClick={() => { setTicket(null); setSel(null); setQty(1); setBuyer({ name: '', email: '', phone: '' }); setStage('pick'); }}>
        Buy another ticket
      </button>
    </div>
  );

  if (stage === 'pay') return (
    <div className="wrap">
      <div className="eyebrow">Payment</div>
      <div className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div><b>{tier.name}</b>{qty > 1 ? ` × ${qty}` : ''}<div className="hint">{buyer.name} · {buyer.email}</div></div>
          <div style={{ fontFamily: 'Bricolage Grotesque', fontWeight: 800, fontSize: 22 }}>{money(amountCents)}</div>
        </div>
        <div ref={dropinRef} />
        {err && <div className="err">{err}</div>}
        <button className="btn btn-go btn-block" disabled={busy} onClick={pay}>{busy ? 'Processing…' : `Pay ${money(amountCents)}`}</button>
        <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => { setStage('pick'); setErr(''); }}>Back</button>
      </div>
    </div>
  );

  return (
    <div className="wrap">
      <div className="eyebrow">{ev.name}{ev.date ? ` · ${ev.date}` : ''}</div>
      <div className="stack">
        <div>
          <label className="f">Choose your ticket</label>
          <div className="stack">
            {ev.ticketTypes.map((t) => (
              <div key={t.id} className={`tier ${sel === t.id ? 'on' : ''} ${t.soldOut ? 'out' : ''}`}
                onClick={() => !t.soldOut && setSel(t.id)}>
                <div className="radio" />
                <div className="grow">
                  <div className="nm">{t.name}</div>
                  {t.description && <div className="ds">{t.description}</div>}
                  {t.admits > 1 && <div className="ds">Admits {t.admits} people</div>}
                  {t.remaining != null && t.remaining <= 25 && !t.soldOut && <div className="ds">Only {t.remaining} left</div>}
                  {t.soldOut && <div className="ds">Sold out</div>}
                </div>
                <div className="pr">{t.is_comp || t.price_cents === 0 ? 'Free' : money(t.price_cents)}</div>
              </div>
            ))}
          </div>
        </div>

        {tier && (
          <div className="card stack">
            <div className="row">
              <div className="grow"><label className="f">Full name</label>
                <input value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} placeholder="Jane Rao" /></div>
              <div style={{ width: 110 }}><label className="f">Qty</label>
                <input type="number" min="1" value={qty} onChange={(e) => setQty(Math.max(1, +e.target.value || 1))} /></div>
            </div>
            <div><label className="f">Email</label>
              <input type="email" value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} placeholder="jane@email.com" /></div>
            <div><label className="f">Phone (optional)</label>
              <input value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} placeholder="(469) …" /></div>
            {err && <div className="err">{err}</div>}
            <button className="btn btn-primary btn-block" disabled={busy} onClick={goPay}>
              {isPaid ? `Continue to payment · ${money(amountCents)}` : 'Get ticket'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
