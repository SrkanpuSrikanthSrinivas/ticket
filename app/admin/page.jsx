'use client';
import { useEffect, useState } from 'react';

const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  let data = {}; try { data = await res.json(); } catch {}
  return { ok: res.ok, data };
}

export default function Admin() {
  const [pin, setPin] = useState('');
  const [authed, setAuthed] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [modal, setModal] = useState(null);
  const [msg, setMsg] = useState('');

  async function load(p = pin) {
    const res = await fetch(`/api/admin/config?pin=${encodeURIComponent(p)}&t=${Date.now()}`, { cache: 'no-store' });
    if (res.status === 401) { setMsg('Wrong PIN'); return false; }
    if (!res.ok) { setMsg('Could not load — check the database'); return false; }
    setCfg(await res.json());
    return true;
  }
  useEffect(() => { if (authed) load(); }, [authed]);
  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 2600); }

  // --- optimistic local state so the UI reflects a confirmed save instantly ---
  function applyTicket(patch) {
    setCfg((prev) => {
      if (!prev) return prev;
      let list = [...(prev.ticketTypes || [])];
      if (patch.remove) list = list.filter((x) => x.id !== patch.remove);
      else if (patch.ticket) {
        const i = list.findIndex((x) => x.id === patch.ticket.id);
        if (i >= 0) list[i] = { ...list[i], ...patch.ticket }; else list.push(patch.ticket);
      }
      return { ...prev, ticketTypes: list };
    });
  }
  const setCoupons = (listOrFn) => setCfg((prev) => prev ? { ...prev, couponTypes: typeof listOrFn === 'function' ? listOrFn(prev.couponTypes || []) : listOrFn } : prev);
  const setEvent = (patch) => setCfg((prev) => prev ? { ...prev, event: { ...prev.event, ...patch } } : prev);

  if (!authed) {
    const press = (n) => setPin((pin + n).slice(0, 6));
    return (
      <div>
        <div className="topbar"><b>Ticket setup</b></div>
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

  const ev = cfg?.event;
  const coupons = cfg?.couponTypes || [];
  const tickets = [...(cfg?.ticketTypes || [])].sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name));
  const foodValue = (t) => coupons.reduce((s, c) => s + (t.allot?.[c.id] || 0) * (c.value_cents || 0), 0);
  const couponSummary = (t) => {
    const parts = coupons.filter((c) => (t.allot?.[c.id] || 0) > 0).map((c) => `${c.name}×${t.allot[c.id]}`);
    return parts.length ? `${money(foodValue(t))} food · ${parts.join(', ')}` : 'No food coupons';
  };
  const availText = (t) => {
    const cap = t.max_qty == null ? 'Unlimited' : `${t.max_qty} available`;
    return t.sold ? `${cap} · ${t.sold} sold` : cap;
  };

  return (
    <div>
      <div className="topbar"><b>{ev?.name || 'Ticket setup'}</b>
        <span style={{ marginLeft: 'auto', fontSize: 12, opacity: .9 }}>{msg}</span></div>
      <div className="wrap">

        <div className="section-h"><div className="eyebrow">Event</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setModal({ kind: 'event' })}>Edit</button></div>
        <div className="card summary">
          <div className="grow">
            <div className="s1">{ev?.name || 'Untitled event'}</div>
            <div className="s2">{[ev?.event_date, ev?.venue].filter(Boolean).join(' · ') || 'Add date & venue'}</div>
          </div>
        </div>

        <div className="section-h"><div className="eyebrow">Food coupon denominations</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setModal({ kind: 'coupons' })}>Manage</button></div>
        <div className="card">
          {coupons.length ? coupons.map((c) => <span key={c.id} className="cchip">{c.name} · {money(c.value_cents)}</span>)
            : <div className="hint">No denominations yet. Tap Manage to add $2, $5, $8, $10…</div>}
        </div>

        <div className="section-h"><div className="eyebrow">Ticket types</div>
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'ticket', ticket: null })}>＋ New ticket</button></div>
        {tickets.length === 0 && <div className="card hint">No tickets yet. Create your first ticket type — individual, group, or comp.</div>}
        {tickets.map((t) => (
          <button key={t.id} className="trow" onClick={() => setModal({ kind: 'ticket', ticket: t })}>
            <div className="grow">
              <div className="tn">{t.name}
                {t.is_comp && <span className="badge comp">Comp</span>}
                {t.active === false && <span className="badge off">Off</span>}
              </div>
              <div className="tm">{t.admits > 1 ? `Group of ${t.admits} · ` : ''}{availText(t)}</div>
              <div className="tm">{couponSummary(t)}</div>
            </div>
            <div className="tp">{t.is_comp || t.price_cents === 0 ? 'Free' : money(t.price_cents)}</div>
            <svg className="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        ))}
      </div>

      {modal?.kind === 'event' && <EventModal pin={pin} event={ev} onClose={() => setModal(null)}
        onSaved={(patch) => { setEvent(patch); setModal(null); flash('Event saved'); }} />}
      {modal?.kind === 'coupons' && <CouponsModal pin={pin} coupons={coupons} onClose={() => setModal(null)} onSync={setCoupons} />}
      {modal?.kind === 'ticket' && <TicketModal pin={pin} ticket={modal.ticket} coupons={coupons} onClose={() => setModal(null)}
        onSaved={(m, patch) => { applyTicket(patch); setModal(null); flash(m); }} />}
    </div>
  );
}

function Sheet({ title, onClose, children, footer }) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h3>{title}</h3><button className="iconbtn" onClick={onClose}>×</button></div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

function EventModal({ pin, event, onClose, onSaved }) {
  const [f, setF] = useState({ name: event?.name || '', date: event?.event_date || '', venue: event?.venue || '', tagline: event?.tagline || '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async () => {
    if (!f.name.trim()) return setErr('Event name is required.');
    setBusy(true);
    const { ok, data } = await post('/api/admin/event', { adminPin: pin, ...f });
    setBusy(false);
    if (ok) onSaved({ name: f.name.trim(), event_date: f.date, venue: f.venue, tagline: f.tagline });
    else setErr(data.message || 'Save failed.');
  };
  return (
    <Sheet title="Event details" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary grow" disabled={busy} onClick={save}>Save</button></>}>
      <div><label className="f">Event name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="row">
        <div className="grow"><label className="f">Date</label><input value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} placeholder="Sat, Jun 20 · 5 PM" /></div>
        <div className="grow"><label className="f">Venue</label><input value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} placeholder="Community Hall" /></div>
      </div>
      <div><label className="f">Welcome line (on the ticket)</label><input value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></div>
      {err && <div className="err">{err}</div>}
    </Sheet>
  );
}

function CouponsModal({ pin, coupons, onClose, onSync }) {
  const [list, setList] = useState(() => coupons.map((c) => ({ ...c })));
  const [name, setName] = useState(''); const [dollars, setDollars] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');

  const editLocal = (id, patch) => setList((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));

  const persist = async (id) => {
    const c = list.find((x) => x.id === id); if (!c) return;
    const { ok, data } = await post('/api/admin/coupons', { adminPin: pin, id, name: c.name, value_cents: c.value_cents });
    if (ok) { onSync(list); setErr(''); } else setErr(data.message || 'Could not save that coupon.');
  };

  const add = async () => {
    const v = Math.round((Number(dollars) || 0) * 100);
    const label = name.trim() || `$${v / 100}`;
    if (!v && !name.trim()) return setErr('Enter a label and/or a dollar value.');
    setBusy(true);
    const { ok, data } = await post('/api/admin/coupons', { adminPin: pin, name: label, value_cents: v });
    setBusy(false);
    if (ok) { const nl = [...list, { id: data.id, name: label, value_cents: v }]; setList(nl); onSync(nl); setName(''); setDollars(''); setErr(''); }
    else setErr(data.message || 'Could not add.');
  };

  const remove = async (id) => {
    setBusy(true);
    const res = await fetch('/api/admin/coupons', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminPin: pin, id }) });
    setBusy(false);
    if (res.ok) { const nl = list.filter((c) => c.id !== id); setList(nl); onSync(nl); setErr(''); }
    else { const d = await res.json().catch(() => ({})); setErr(d.message || 'Coupons already issued — cannot remove.'); }
  };

  return (
    <Sheet title="Food coupon denominations" onClose={onClose} footer={<button className="btn btn-primary btn-block" onClick={onClose}>Done</button>}>
      <div className="hint">The coupon values guests spend at food stalls — $2, $5, $8, $10. Edit a value and tap away to save.</div>
      {list.map((c) => (
        <div key={c.id} className="row" style={{ alignItems: 'center', gap: 8 }}>
          <input className="grow" value={c.name} onChange={(e) => editLocal(c.id, { name: e.target.value })} onBlur={() => persist(c.id)} />
          <div className="pricewrap" style={{ width: 96 }}><span>$</span>
            <input type="number" min="0" step="1" value={(c.value_cents || 0) / 100}
              onChange={(e) => editLocal(c.id, { value_cents: Math.round((Number(e.target.value) || 0) * 100) })}
              onBlur={() => persist(c.id)} /></div>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => remove(c.id)}>✕</button>
        </div>
      ))}
      <div className="divider" />
      <div className="row" style={{ gap: 8 }}>
        <input className="grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Label (e.g. $5 coupon)" />
        <div className="pricewrap" style={{ width: 96 }}><span>$</span>
          <input type="number" min="0" step="1" value={dollars} onChange={(e) => setDollars(e.target.value)} placeholder="5" /></div>
      </div>
      <button className="btn btn-ghost btn-block" disabled={busy} onClick={add}>Add denomination</button>
      {err && <div className="err">{err}</div>}
    </Sheet>
  );
}

function Stepper({ value, onChange, min = 0 }) {
  const set = (v) => onChange(Math.max(min, v));
  return (
    <div className="stepper">
      <button type="button" onClick={() => set((+value || 0) - 1)}>−</button>
      <input value={value} onChange={(e) => set(parseInt(e.target.value, 10) || 0)} />
      <button type="button" onClick={() => set((+value || 0) + 1)}>+</button>
    </div>
  );
}

function TicketModal({ pin, ticket, coupons, onClose, onSaved }) {
  const editing = !!ticket?.id;
  const [f, setF] = useState({
    id: ticket?.id, name: ticket?.name || '', priceDollars: ticket ? (ticket.price_cents || 0) / 100 : 0,
    description: ticket?.description || '', admits: ticket?.admits || 1, max_qty: ticket?.max_qty ?? '',
    is_comp: !!ticket?.is_comp, active: ticket?.active !== false, sort: ticket?.sort || 0, allot: { ...(ticket?.allot || {}) },
  });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setAllot = (cid, v) => setF((p) => ({ ...p, allot: { ...p.allot, [cid]: v } }));
  const foodTotal = coupons.reduce((s, c) => s + (f.allot?.[c.id] || 0) * (c.value_cents || 0), 0);

  const save = async () => {
    if (!f.name.trim()) return setErr('Give the ticket a name.');
    setBusy(true); setErr('');
    const { ok, data } = await post('/api/admin/tickets', {
      adminPin: pin, id: f.id, name: f.name.trim(), description: f.description,
      price_cents: f.is_comp ? 0 : Math.round((Number(f.priceDollars) || 0) * 100),
      admits: f.admits, max_qty: f.max_qty === '' ? null : f.max_qty, is_comp: f.is_comp, active: f.active, sort: f.sort, allot: f.allot,
    });
    setBusy(false);
    if (ok) {
      const saved = {
        id: data.id, name: f.name.trim(), description: f.description,
        price_cents: f.is_comp ? 0 : Math.round((Number(f.priceDollars) || 0) * 100),
        admits: f.admits, max_qty: f.max_qty === '' ? null : (parseInt(f.max_qty, 10) || null),
        is_comp: f.is_comp, active: f.active, sort: f.sort, allot: { ...f.allot }, sold: ticket?.sold || 0,
      };
      onSaved(editing ? 'Ticket updated' : 'Ticket created', { ticket: saved });
    } else setErr(data.message || 'Save failed.');
  };
  const del = async () => {
    if (!confirm('Delete this ticket type?')) return;
    setBusy(true);
    const res = await fetch('/api/admin/tickets', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminPin: pin, id: f.id }) });
    const d = await res.json(); setBusy(false);
    if (d.deactivated) onSaved('Had sales — turned off instead', { ticket: { ...ticket, active: false } });
    else onSaved('Ticket deleted', { remove: f.id });
  };

  return (
    <Sheet title={editing ? 'Edit ticket' : 'New ticket'} onClose={onClose}
      footer={<>
        {editing && <button className="btn btn-ghost" disabled={busy} onClick={del}>Delete</button>}
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary grow" disabled={busy} onClick={save}>{editing ? 'Save changes' : 'Create ticket'}</button>
      </>}>
      <div><label className="f">Ticket name</label>
        <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Adult, Family (up to 4)" autoFocus /></div>
      <div className="row">
        <div className="grow"><label className="f">Price</label>
          <div className="pricewrap"><span>$</span>
            <input type="number" min="0" step="1" value={f.is_comp ? 0 : f.priceDollars} onChange={(e) => set('priceDollars', e.target.value)} disabled={f.is_comp} /></div></div>
        <div className="grow"><label className="f">Tickets available</label>
          <input type="number" min="0" step="1" value={f.max_qty} onChange={(e) => set('max_qty', e.target.value)} placeholder="unlimited" /></div>
      </div>
      <div><label className="f">Description</label>
        <input value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="What's included" /></div>
      <div className="allot-row">
        <div><div style={{ fontWeight: 600 }}>Group size</div><div className="hint" style={{ margin: 0 }}>People one ticket admits</div></div>
        <Stepper value={f.admits} min={1} onChange={(v) => set('admits', v)} />
      </div>
      <label className="allot-row switch" style={{ cursor: 'pointer' }}>
        <div><div style={{ fontWeight: 600 }}>Comp ticket</div><div className="hint" style={{ margin: 0 }}>Volunteers / performers — no payment</div></div>
        <span><input type="checkbox" checked={f.is_comp} onChange={(e) => set('is_comp', e.target.checked)} /><span className="track"><span className="knob" /></span></span>
      </label>
      <div>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <label className="f" style={{ margin: 0 }}>Food coupons included</label>
          <span style={{ fontWeight: 700, color: 'var(--marigold-ink)' }}>{money(foodTotal)} total</span>
        </div>
        {coupons.length === 0 ? <div className="hint">No denominations yet — add some under “Manage”.</div>
          : coupons.map((c) => (
            <div key={c.id} className="allot-row">
              <span>{c.name} <span className="hint" style={{ margin: 0 }}>({money(c.value_cents)})</span></span>
              <Stepper value={f.allot?.[c.id] || 0} onChange={(v) => setAllot(c.id, v)} />
            </div>
          ))}
      </div>
      {editing && (
        <label className="allot-row switch" style={{ cursor: 'pointer' }}>
          <div><div style={{ fontWeight: 600 }}>Active</div><div className="hint" style={{ margin: 0 }}>Show this ticket to buyers</div></div>
          <span><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /><span className="track"><span className="knob" /></span></span>
        </label>
      )}
      {err && <div className="err">{err}</div>}
    </Sheet>
  );
}
