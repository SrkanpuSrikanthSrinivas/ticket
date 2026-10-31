'use client';
import { useState } from 'react';
import s from '../checkin.module.css';

// Organizer: import a registration export (.xlsx / .csv) as a separate check-in event.
// The file is parsed in the browser; only the rows are sent to /api/ext/import.

const SHEETJS = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.XLSX) return res();
    const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = rej; document.body.appendChild(el);
  });
}
const nk = (k) => String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export default function ExtImport() {
  const [pin, setPin] = useState('');
  const [authed, setAuthed] = useState(false);
  const [msg, setMsg] = useState('');
  const [events, setEvents] = useState([]);
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState(null);
  const [eventName, setEventName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function loadEvents(p = pin) {
    const r = await fetch(`/api/ext/events?pin=${encodeURIComponent(p)}&t=${Date.now()}`, { cache: 'no-store' });
    if (r.ok) setEvents((await r.json()).events || []);
  }
  async function signIn() {
    const r = await fetch(`/api/admin/config?pin=${encodeURIComponent(pin)}&t=${Date.now()}`, { cache: 'no-store' });
    if (r.status === 401) return setMsg('Wrong PIN');
    setAuthed(true); setMsg(''); loadEvents(pin);
  }

  async function onFile(f) {
    setFile(f); setRows(null); setResult(null); setMsg('');
    if (!f) return;
    try {
      await loadScript(SHEETJS);
      const wb = window.XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = window.XLSX.utils.sheet_to_json(ws, { defval: null, raw: true })
        .filter((r) => Object.values(r).some((v) => v !== null && String(v).trim() !== ''));
      if (!data.length) return setMsg('No rows found in the first sheet.');
      const keys = Object.keys(data[0]).map(nk);
      const need = ['firstname', 'lastname', 'email'];
      const missing = need.filter((k) => !keys.includes(k));
      if (missing.length) return setMsg(`This doesn't look like the registration export — missing column(s): ${missing.join(', ')}.`);
      setRows(data);
      const evCol = Object.keys(data[0]).find((k) => nk(k) === 'eventname');
      setEventName(String((evCol && data.find((r) => r[evCol])?.[evCol]) || '').trim());
    } catch (e) { setMsg('Could not read that file. Use the .xlsx or .csv export.'); }
  }

  async function doImport() {
    setBusy(true); setMsg(''); setResult(null);
    try {
      const r = await fetch('/api/ext/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminPin: pin, eventName, rows }) });
      const d = await r.json();
      if (!r.ok || !d.ok) setMsg(d.message || 'Import failed.');
      else { setResult(d); loadEvents(); }
    } catch (e) { setMsg('Import failed — check the connection.'); }
    setBusy(false);
  }

  if (!authed) {
    const press = (n) => setPin((pin + n).slice(0, 8));
    return (
      <div><div className="topbar"><b>Import registrations</b></div>
        <div className="wrap"><div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Organizer sign-in</div>
          <h2 style={{ fontSize: 20 }}>Enter the admin PIN</h2>
          <div className="pindots">{[0, 1, 2, 3].map((i) => <i key={i} className={pin.length > i ? 'f' : ''} />)}</div>
          <div className="pinpad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} onClick={() => press(n)}>{n}</button>)}
            <button onClick={() => setPin('')}>✕</button><button onClick={() => press(0)}>0</button>
            <button onClick={signIn}>→</button>
          </div>{msg && <p className="err">{msg}</p>}
        </div></div>
      </div>
    );
  }

  const count = (re) => {
    if (!rows) return 0;
    const col = Object.keys(rows[0]).find((k) => re.test(nk(k)));
    return col ? rows.reduce((t, r) => t + (parseInt(r[col], 10) || 0), 0) : 0;
  };

  return (
    <div>
      <div className="topbar"><b>Import registrations</b><a href="/checkin" style={{ marginLeft: 'auto', color: '#fff', fontSize: 13 }}>Open check-in →</a></div>
      <div className="wrap">
        <div className="card">
          <h3 style={{ fontSize: 17 }}>Upload the registration export</h3>
          <p className="hint">Use the event's exported .xlsx (or .csv). Re-uploading a newer export adds new registrations and updates details — it never undoes anyone's check-in.</p>
          <div className={s.drop}>
            <div style={{ fontWeight: 700 }}>Choose file</div>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onFile(e.target.files?.[0] || null)} />
            {file && <div className="hint" style={{ marginTop: 8 }}>{file.name}</div>}
          </div>

          {rows && (
            <>
              <div className={s.previewGrid}>
                <div className={s.stat}><div className={s.statN}>{rows.length}</div><div className={s.statL}>Registrations</div></div>
                <div className={s.stat}><div className={s.statN}>{count(/^adult/)}</div><div className={s.statL}>Adults</div></div>
                <div className={s.stat}><div className={s.statN}>{count(/^child/)}</div><div className={s.statL}>Children</div></div>
              </div>
              <div style={{ marginTop: 14 }}>
                <label className="f">Event name</label>
                <input value={eventName} onChange={(e) => setEventName(e.target.value)}
                  style={{ width: '100%', font: 'inherit', padding: '12px 13px', border: '1px solid var(--line)', borderRadius: 12 }} />
                <div className="hint">Keep the same name when re-importing so it updates the same event.</div>
              </div>
              <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={busy || !eventName.trim()} onClick={doImport}>
                {busy ? 'Importing…' : `Import ${rows.length} registrations`}
              </button>
            </>
          )}
          {msg && <div className="err" style={{ marginTop: 12 }}>{msg}</div>}
          {result && <p className={s.ok} style={{ marginTop: 12 }}>✓ {result.event}: {result.added} added, {result.updated} updated ({result.rows} in file).</p>}
        </div>

        {events.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 16 }}>Imported events</h3>
            <table className="rtable" style={{ marginTop: 8 }}>
              <thead><tr><th>Event</th><th>Registrations</th><th>Checked in</th></tr></thead>
              <tbody>{events.map((e) => (
                <tr key={e.id}><td>{e.name}</td><td>{e.registrations} · {e.adults + e.children} people</td><td>{e.checked_in} · {e.people_in} people</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
