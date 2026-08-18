'use client';
import { useEffect, useState } from 'react';

const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
const blankTicket = () => ({ name: '', description: '', price_cents: 0, admits: 1, max_qty: '', is_comp: false, active: true, sort: 0, allot: {} });

export default function Admin() {
  const [pin, setPin] = useState('');
  const [authed, setAuthed] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [event, setEvent] = useState({ name: '', date: '', venue: '', tagline: '' });
  const [newCoupon, setNewCoupon] = useState('');
  const [drafts, setDrafts] = useState({});   // ticketId -> editable copy
  const [adding, setAdding] = useState(null);  // blankTicket() while adding
  const [msg, setMsg] = useState('');

  async function load(p = pin) {
    const res = await fetch(`/api/admin/config?pin=${encodeURIComponent(p)}`);
    if (res.status === 401) { setAuthed(false); setMsg('Wrong PIN'); return false; }
    const data = await res.json();
    setCfg(data);
    if (data.event) setEvent({ name: data.event.name || '', date: data.event.event_date || '', venue: data.event.venue || '', tagline: data.event.tagline || '' });
    const d = {}; (data.ticketTypes || []).forEach((t) => { d[t.id] = { ...t, max_qty: t.max_qty ?? '', allot: { ...t.allot } }; });
    setDrafts(d);
    return true;
  }

  useEffect(() => { if (authed) load(); }, [authed]);

  async function saveEvent() {
    const res = await fetch('/api/admin/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminPin: pin, ...event }) });
    setMsg(res.ok ? 'Event saved' : 'Save failed'); load();
  }
  async function addCoupon() {
    if (!newCoupon.trim()) return;
    await fetch('/api/admin/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminPin: pin, name: newCoupon.trim() }) });
    setNewCoupon(''); load();
  }
  async function renameCoupon(id, name) {
    await fetch('/api/admin/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminPin: pin, id, name }) }); load();
  }
  async function removeCoupon(id) {
    const res = await fetch('/api/admin/coupons', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminPin: pin, id }) });
    const d = await res.json(); if (!res.ok) setMsg(d.message || 'Could not remove'); load();
  }
  async function saveTicket(t) {
    const body = { adminPin: pin, ...t, price_cents: Math.round(Number(t.price_cents) || 0) };
    const res = await fetch('/api/admin/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setMsg(res.ok ? 'Ticket saved' : 'Save failed'); setAdding(null); load();
  }
  async function deleteTicket(id) {
    const res = await fetch('/api/admin/tickets', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminPin: pin, id }) });
    const d = await res.json(); setMsg(d.deactivated ? 'Had sales — deactivated instead' : 'Ticket removed'); load();
  }

  if (!authed) {
    const press = (n) => setPin((pin + n).slice(0, 6));
    return (
      <div>
        <div className="topbar"><b>MKANT · Ticket setup</b></div>
        <div className="wrap">
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Organizer sign-in</div>
            <h2 style={{ fontSize: 20 }}>Enter the admin PIN</h2>
            <div className="pindots">{[0, 1, 2, 3].map((i) => <i key={i} className={pin.length > i ? 'f' : ''} />)}</div>
            <div className="pinpad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} onClick={() => press(n)}>{n}</button>)}
              <button onClick={() => setPin('')}>✕</button>
              <button onClick={() => press(0)}>0</button>
              <button onClick={async () => { if (await load(pin)) setAuthed(true); }}>→</button>
            </div>
            {msg && <p className="err">{msg}</p>}
          </div>
        </div>
      </div>
    );
  }

  const coupons = cfg?.couponTypes || [];

  return (
    <div>
      <div className="topbar"><b>MKANT · Ticket setup</b><span style={{ marginLeft: 'auto', fontSize: 12, opacity: .85 }}>{msg}</span></div>
      <div className="wrap">

        <div className="eyebrow">Event details</div>
        <div className="card stack">
          <div><label className="f">Event name</label><input value={event.name} onChange={(e) => setEvent({ ...event, name: e.target.value })} /></div>
          <div className="row">
            <div className="grow"><label className="f">Date</label><input value={event.date} onChange={(e) => setEvent({ ...event, date: e.target.value })} placeholder="Sat, Jun 20 · 5 PM" /></div>
            <div className="grow"><label className="f">Venue</label><input value={event.venue} onChange={(e) => setEvent({ ...event, venue: e.target.value })} placeholder="Community Hall, McKinney" /></div>
          </div>
          <div><label className="f">Welcome line (on the ticket)</label><input value={event.tagline} onChange={(e) => setEvent({ ...event, tagline: e.target.value })} /></div>
          <button className="btn btn-primary" onClick={saveEvent}>Save event details</button>
        </div>

        <div className="eyebrow" style={{ marginTop: 22 }}>Coupon types</div>
        <div className="card stack">
          {coupons.length === 0 && <div className="hint">Add lunch, snacks, beverage, etc. Tickets grant these at check-in.</div>}
          {coupons.map((c) => (
            <div key={c.id} className="row" style={{ alignItems: 'center' }}>
              <input className="grow" defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && renameCoupon(c.id, e.target.value.trim())} />
              <button className="btn btn-ghost btn-sm" onClick={() => removeCoupon(c.id)}>Remove</button>
            </div>
          ))}
          <div className="divider" />
          <div className="row"><input className="grow" value={newCoupon} onChange={(e) => setNewCoupon(e.target.value)} placeholder="e.g. Dinner, Dessert, Chai" onKeyDown={(e) => e.key === 'Enter' && addCoupon()} />
            <button className="btn btn-ghost" onClick={addCoupon}>Add</button></div>
        </div>

        <div className="eyebrow" style={{ marginTop: 22 }}>Ticket types</div>
        <div className="stack">
          {Object.values(drafts).sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name)).map((t) => (
            <TicketCard key={t.id} t={t} coupons={coupons}
              onChange={(nt) => setDrafts({ ...drafts, [t.id]: nt })}
              onSave={() => saveTicket(drafts[t.id])} onDelete={() => deleteTicket(t.id)} />
          ))}
        </div>

        {adding
          ? <div style={{ marginTop: 12 }}><TicketCard t={adding} coupons={coupons} isNew
              onChange={setAdding} onSave={() => saveTicket(adding)} onCancel={() => setAdding(null)} /></div>
          : <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => setAdding(blankTicket())}>＋ Add ticket type</button>}

        <div className="card" style={{ marginTop: 22 }}>
          <b>Group &amp; family tickets</b>
          <div className="hint">Set <b>Group size</b> above 1 for a ticket that admits several people (e.g. Family = 4). Coupon counts below are the total <i>per ticket</i>, so a family ticket including four lunches = 4. Your check-in headcount then counts people, not tickets.</div>
        </div>
      </div>
    </div>
  );
}

function TicketCard({ t, coupons, onChange, onSave, onDelete, onCancel, isNew }) {
  const set = (k, v) => onChange({ ...t, [k]: v });
  const setAllot = (cid, v) => onChange({ ...t, allot: { ...t.allot, [cid]: v } });
  return (
    <div className="card stack">
      <div className="row">
        <div className="grow"><label className="f">Ticket name</label>
          <input value={t.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Adult, Family (up to 4)" /></div>
        <div style={{ width: 120 }}><label className="f">Price ($)</label>
          <input type="number" min="0" step="1" value={t.price_cents ? t.price_cents / 100 : 0}
            onChange={(e) => set('price_cents', Math.round((Number(e.target.value) || 0) * 100))} disabled={t.is_comp} /></div>
      </div>
      <div><label className="f">Description</label>
        <input value={t.description || ''} onChange={(e) => set('description', e.target.value)} placeholder="What's included" /></div>
      <div className="row">
        <div className="grow"><label className="f">Group size (people admitted)</label>
          <input type="number" min="1" step="1" value={t.admits} onChange={(e) => set('admits', Math.max(1, parseInt(e.target.value, 10) || 1))} /></div>
        <div className="grow"><label className="f">Tickets available</label>
          <input type="number" min="0" step="1" value={t.max_qty} onChange={(e) => set('max_qty', e.target.value)} placeholder="unlimited" /></div>
      </div>
      <label className="row" style={{ alignItems: 'center', gap: 8 }}>
        <input type="checkbox" style={{ width: 18 }} checked={!!t.is_comp} onChange={(e) => set('is_comp', e.target.checked)} />
        <span className="f" style={{ margin: 0 }}>Comp ticket (volunteers / performers — no payment)</span>
      </label>

      <div>
        <label className="f">Food coupons included (total per ticket)</label>
        {coupons.length === 0 ? <div className="hint">Add coupon types first.</div> : coupons.map((c) => (
          <div key={c.id} className="row" style={{ alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <span>{c.name}</span>
            <input type="number" min="0" step="1" style={{ width: 80, textAlign: 'center' }}
              value={t.allot?.[c.id] || 0} onChange={(e) => setAllot(c.id, parseInt(e.target.value, 10) || 0)} />
          </div>
        ))}
      </div>

      <div className="divider" />
      <div className="row">
        <button className="btn btn-primary grow" onClick={onSave}>{isNew ? 'Create ticket' : 'Save'}</button>
        {isNew ? <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
               : <button className="btn btn-ghost" onClick={onDelete}>Delete</button>}
      </div>
    </div>
  );
}
