// Separate gate check-in for events registered OUTSIDE this app (e.g. an
// exported registration spreadsheet). Uses its own ext_* tables only — nothing
// here reads or writes the ticketing tables (events/orders/tickets/coupons).
import { sql } from './db';

let ensured = false;
export async function ensureExtSchema() {
  if (ensured) return;
  await sql`create table if not exists ext_events (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  )`;
  await sql`create table if not exists ext_attendees (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references ext_events(id) on delete cascade,
    reg_key text not null,
    member_id text,
    member_expiry text,
    first_name text,
    last_name text,
    email text,
    city text,
    state text,
    mobile text,
    mobile_digits text,
    txn_id text,
    payment_method text,
    payment_status text,
    membership_type text,
    amount_paid numeric(10,2) not null default 0,
    registered_at timestamp,
    reg_status text,
    comment text,
    adults int not null default 0,
    children int not null default 0,
    raw jsonb,
    checked_in_at timestamptz,
    checked_in_by text,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique (event_id, reg_key)
  )`;
  await sql`create index if not exists ext_attendees_event_idx on ext_attendees(event_id)`;
  ensured = true;
}

// ---------- import: spreadsheet row (header -> value) to a normalized record ----------
const norm = (k) => String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const str = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' || s === '-' || s.toUpperCase() === 'N/A' ? null : s;
};
const int = (v) => { const n = parseInt(String(v ?? '').replace(/[^0-9-]/g, ''), 10); return Number.isFinite(n) && n > 0 ? n : 0; };
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const pad = (n) => String(n).padStart(2, '0');

// Excel serial date or a date string -> 'YYYY-MM-DD HH:MM:SS' wall-clock text.
// Uses UTC getters on both paths so the wall-clock time is preserved exactly
// (no timezone shift), whichever machine did the upload.
function toWallClock(v) {
  if (v === null || v === undefined || v === '') return null;
  let d;
  if (typeof v === 'number') d = new Date(Math.round((v - 25569) * 86400000));
  else { d = new Date(String(v).trim().replace(/(\.\d+)?Z?$/, 'Z')); if (isNaN(d)) d = new Date(String(v)); }
  if (isNaN(d)) return null;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function normalizeRow(row) {
  const m = {};
  for (const [k, v] of Object.entries(row || {})) m[norm(k)] = v;
  const pick = (...keys) => { for (const k of keys) if (m[k] !== undefined) return m[k]; return undefined; };
  const pickPrefix = (p) => { const k = Object.keys(m).find((x) => x.startsWith(p)); return k ? m[k] : undefined; };

  // "F-126091 - 01/25/2027"  ->  member id + expiry
  const memberRaw = String(pick('memberidexpirydate', 'memberid') ?? '').trim();
  let memberId = null, memberExpiry = null;
  if (memberRaw && memberRaw !== '-') {
    const parts = memberRaw.split(/\s+-\s+/);
    memberId = str(parts[0]);
    memberExpiry = str(parts[1]);
  }

  const email = str(pick('email', 'emailid'));
  const mobile = str(pick('mobile', 'mobilenumber', 'phone'));
  let digits = (mobile || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  const regRaw = pick('registereddate', 'registrationdate', 'registered');
  const txn = str(pick('transactionid', 'txnid'));
  const first = str(pick('firstname'));
  const last = str(pick('lastname'));

  // Stable identity for re-imports: email + the registration timestamp as stored in
  // the file (an Excel serial number or a string) — timezone independent.
  const regKey = [String(email || '').toLowerCase(), regRaw ?? '', txn || '', regRaw == null ? `${first}|${last}` : ''].join('|');

  return {
    reg_key: regKey,
    event_name: str(pick('eventname')),
    member_id: memberId,
    member_expiry: memberExpiry,
    first_name: first,
    last_name: last,
    email,
    city: str(pick('city')),
    state: str(pick('state')),
    mobile,
    mobile_digits: digits || null,
    txn_id: txn,
    payment_method: str(pick('paymentmethod')),
    payment_status: str(pick('paymentstatus')),
    membership_type: str(pick('membershiptype', 'membership')),
    amount_paid: num(pick('amountpaid', 'amount')),
    registered_at: toWallClock(regRaw),
    reg_status: str(pick('status')),
    comment: str(pick('comment', 'comments')),
    adults: int(pickPrefix('adult')),
    children: int(pickPrefix('child')),
    raw: row,
  };
}

// ---------- check-in view: derive the flags gate staff need ----------
const PAID = ['paid', 'completed', 'complete', 'success', 'successful', 'captured', 'settled', 'approved'];
const FAILED = ['failed', 'declined', 'refunded', 'cancelled', 'canceled', 'voided', 'pending', 'unpaid'];

export function payState(r) {
  const st = String(r.payment_status || '').toLowerCase();
  const method = String(r.payment_method || '').toLowerCase();
  const amt = Number(r.amount_paid) || 0;
  if (FAILED.includes(st)) return 'failed';
  if (amt > 0 && PAID.includes(st)) return 'paid';
  if (amt === 0 && (method === 'free' || PAID.includes(st))) return 'free';
  return 'unconfirmed';
}

export function memberExpired(expiry) {
  const m = String(expiry || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return false;
  const exp = Date.UTC(+m[3], +m[1] - 1, +m[2]);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return exp < today;
}

export function decorate(r) {
  const { raw, reg_key, registered_text, ...rest } = r;
  return {
    ...rest,
    // wall-clock text ('YYYY-MM-DDTHH:MM:SS', no zone) so it shows exactly as registered
    registered_at: registered_text || null,
    amount_paid: Number(r.amount_paid) || 0,
    adults: Number(r.adults) || 0,
    children: Number(r.children) || 0,
    reg_count: Number(r.reg_count) || 1,
    pay_state: payState(r),
    member_expired: memberExpired(r.member_expiry),
  };
}

export const staffOk = (pin) => !!pin && (pin === process.env.STAFF_PIN || pin === process.env.ADMIN_PIN);
