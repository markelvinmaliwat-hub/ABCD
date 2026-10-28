/**
 * MMMDA Logistics / PLDT dashboard backend  ->  your Google Sheet
 *
 *  - First tab (gid=0)  : Activity log  (Time, Email, Agent Code, ... )  <- dashboard READS it from the CSV link
 *  - Tab "Payment_Log"  : every "For payment" update                     <- dashboard READS it from the CSV link
 *  - Accounts           : stored PRIVATELY inside this script (NOT in the sheet), so the
 *                         sheet can be public-read without exposing anyone's password.
 *
 * Deploy as: Web app | Execute as: Me | Who has access: Anyone
 */
const SHEET_ID = '11-VVgEX5ugFP4suckiaV_LitXz2VhuYe3HhDv4rLcdA';
const TZ = 'Asia/Manila';
const ACT_HEADERS = ['Time', 'Email', 'Agent Code', 'Agent Name', 'Action', 'Where', 'Search / Details', 'Device', 'Visitor ID'];
const PAY_NAME = 'Payment_Log';
const PAY_HEADERS = ['Saved At', 'Key', 'Subscriber', 'Account', 'Agent', 'Action', 'Action Label', 'Date of Payment', 'Remarks', 'Saved By (email)', 'Agent Code', 'Saved By (name)'];
const MAX_READ = 5000;

/* Run this ONCE (Run > setup): creates the headers/tabs and asks for permission. */
function setup() {
  const a = actSheet_();
  if (String(a.getRange(1, 1).getValue()) !== ACT_HEADERS[0]) {
    throw new Error('The first tab (gid=0) already has other data in it. Use an empty first tab for the activity log (or move your data to another tab) and run setup again.');
  }
  paySheet_();
  salt_();
}

/* ---------- sheets ---------- */
function ss_() { return SpreadsheetApp.openById(SHEET_ID); }
function actSheet_() {
  const ss = ss_(), all = ss.getSheets();
  let sh = null;
  for (let i = 0; i < all.length; i++) if (all[i].getSheetId() === 0) sh = all[i];
  if (!sh) sh = all[0];
  if (sh.getLastRow() === 0) initHeaders_(sh, ACT_HEADERS);
  return sh;
}
function paySheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(PAY_NAME);
  if (!sh) { sh = ss.insertSheet(PAY_NAME); initHeaders_(sh, PAY_HEADERS); }
  return sh;
}
function initHeaders_(sh, headers) {
  sh.getRange(1, 1, 1, headers.length).setNumberFormat('@').setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
}
function clean_(v, max) { return String(v == null ? '' : v).slice(0, max || 1000); }
function s_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm:ss').replace(' 00:00:00', '');
  return String(v == null ? '' : v);
}
function append_(sh, values) {   // stored as TEXT, so a "=formula" typed by a user can never run
  const r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, values.length).setNumberFormat('@').setValues([values]);
}
function lastRows_(sh, width, max) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const start = Math.max(2, last - max + 1);
  return sh.getRange(start, 1, last - start + 1, width).getValues();
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- writes (dashboard POSTs) ---------- */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.type === 'pay') {
      append_(paySheet_(), [
        clean_(d.at, 40), clean_(d.key, 300), clean_(d.name, 200), clean_(d.account, 100), clean_(d.agent, 200),
        clean_(d.action, 40), clean_(d.label, 200), clean_(d.date, 40), clean_(d.remarks, 500),
        clean_(d.by, 200), clean_(d.code, 40), clean_(d.byName, 200)
      ]);
    } else {
      append_(actSheet_(), [
        clean_(d.time, 40), clean_(d.email, 200), clean_(d.code, 40), clean_(d.name, 200),
        clean_(d.action, 100), clean_(d.where, 300), clean_(d.search, 600), clean_(d.device, 200), clean_(d.visitor, 60)
      ]);
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/* ---------- reads (fallback if the CSV link is not used) + accounts ---------- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.acct) return json_(account_(p));

    if (p.read === '1') {
      return json_({ rows: lastRows_(actSheet_(), ACT_HEADERS.length, MAX_READ).map(function (r) {
        return { time: s_(r[0]), email: s_(r[1]), code: s_(r[2]), name: s_(r[3]), action: s_(r[4]),
                 where: s_(r[5]), search: s_(r[6]), device: s_(r[7]), visitor: s_(r[8]) };
      }) });
    }
    if (p.read === 'pay' || p.read === 'payhist') {
      const rows = lastRows_(paySheet_(), PAY_HEADERS.length, 20000).map(function (r) {
        return { at: s_(r[0]), key: s_(r[1]), name: s_(r[2]), account: s_(r[3]), agent: s_(r[4]), action: s_(r[5]),
                 label: s_(r[6]), date: s_(r[7]), remarks: s_(r[8]), by: s_(r[9]), code: s_(r[10]), byName: s_(r[11]) };
      });
      if (p.read === 'payhist') {
        rows.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
        return json_({ rows: rows.slice(0, 1000) });
      }
      const latest = {};
      rows.forEach(function (x) { if (x.key && (!latest[x.key] || x.at >= latest[x.key].at)) latest[x.key] = x; });
      return json_({ rows: Object.keys(latest).map(function (k) { return latest[k]; }) });
    }
    return json_({ ok: true, status: 'Dashboard backend is running' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ---------- accounts (private, salted SHA-256; the hash never leaves the server) ---------- */
function sha_(str) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function salt_() {
  const pr = PropertiesService.getScriptProperties();
  let s = pr.getProperty('SALT');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); pr.setProperty('SALT', s); }
  return s;
}
function account_(p) {
  const op = String(p.acct), email = String(p.email || '').trim().toLowerCase(), h = String(p.h || '');
  if (!email || email.indexOf('@') < 0) return { ok: false, reason: 'email' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const pr = PropertiesService.getScriptProperties(), salt = salt_();
    const key = 'u:' + sha_(salt + 'k:' + email).slice(0, 40);
    const stored = pr.getProperty(key);
    const mine = sha_(salt + email + ':' + h);
    if (op === 'create') {
      if (stored !== null) return { ok: false, exists: true };
      if (!h) return { ok: false, reason: 'hash' };
      pr.setProperty(key, mine);
      return { ok: true };
    }
    if (op === 'login') {
      if (stored === null) return { ok: false, reason: 'none' };
      return stored === mine ? { ok: true } : { ok: false, reason: 'bad' };
    }
    return { ok: false, reason: 'op' };
  } finally {
    lock.releaseLock();
  }
}
