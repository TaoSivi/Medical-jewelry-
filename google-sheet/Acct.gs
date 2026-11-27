/*****************************************************************
 * ST Jewelry → ST ERP : ສະຫຼຸບບັນຊີລາຍມື້ (ອ່ານຢ່າງດຽວ)
 * ເພີ່ມໃສ່ Apps Script ຂອງ ST POS (Code.gs) ເພື່ອໃຫ້ ERP ດຶງໄປລົງບັນຊີອັດຕະໂນມັດ.
 *   GET ?callback=fn&hq=acct&from=YYYY-MM-DD&to=YYYY-MM-DD&token=...
 * token = ACCT_TOKEN (ອ່ານໄດ້ແຕ່ສະຫຼຸບບັນຊີ — ໃຊ້ອັນນີ້ໃສ່ ERP) ຫຼື API_TOKEN ຫຼັກ.
 * ສ້າງ ACCT_TOKEN: Run setAcctToken ເທື່ອດຽວ → ເບິ່ງ token ໃນ Execution log.
 * ຮູບແບບຂໍ້ມູນຄືກັບ server stpos.store (ACCT_V = 1) — ເບິ່ງ ST POS/server/app.js hqAcct.
 * ໝາຍເຫດ: ບິນທີ່ຍ້າຍເຂົ້າຄັງ (?arch=) ບໍ່ມີລາຍລະອຽດພໍ — ໃຫ້ ERP ດຶງກ່ອນຍ້າຍ.
 *****************************************************************/
var ACCT_V = 1;
function setAcctToken() {
  var t = 'acct-' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  PropertiesService.getScriptProperties().setProperty('ACCT_TOKEN', t);
  Logger.log('ACCT_TOKEN = ' + t);
  return t;
}
function acctAuth_(tok) {
  var t = String(PropertiesService.getScriptProperties().getProperty('ACCT_TOKEN') || '').trim();
  var main = String(PropertiesService.getScriptProperties().getProperty('API_TOKEN') || '').trim();
  tok = String(tok || '');
  return !!tok && ((t && tok === t) || (main && tok === main));
}
function acctDayKey_(ts) { return Utilities.formatDate(new Date(ts), 'GMT+7', 'yyyy-MM-dd'); }
function acctLine_(i) { var d = Math.min(100, (+i.disc || 0) + (+i.promoPct || 0)); return ((+i.price || 0) + (+i.modPrice || 0)) * (1 - d / 100) * Math.max(0, (+i.qty || 0) - (+i.promoFree || 0)); }
function acctDays_(st, from, to) {
  var svcPct = +st.serviceChargePct || 0, vatPct = +st.vatPct || 0, D = {}, cat = {}, flo = {};
  (function walk(c) { Object.keys(c || {}).forEach(function (g) { var sub = c[g]; Object.keys(sub || {}).forEach(function (s2) { (sub[s2] || []).forEach(function (m) { if (m && m.c) cat[m.c] = g; }); }); }); })(st.catalog);
  var day = function (d) { return D[d] || (D[d] = { date: d, bills: 0, sales: 0, svc: 0, vat: 0, tips: 0, fees: 0, refunds: 0, cogs: 0, pay: {}, credit: 0, creditPays: {}, deposits: {}, depUsed: 0, byCat: {}, voids: { n: 0, amt: 0 }, expenses: {}, waste: 0, shortage: 0, cashDiff: 0, svcPct: svcPct, vatPct: vatPct }); };
  var inR = function (d) { return d >= from && d <= to; };
  var partsOf = function (b, amt) { return Array.isArray(b.payParts) && b.payParts.length ? b.payParts.map(function (p) { return [p.type || '-', +p.amt || 0]; }) : [[b.pay || '-', amt]]; };
  (st.bills || []).forEach(function (b) {
    if (!b) return;
    var d = acctDayKey_(b.ts || 0);
    (b.creditPays || []).forEach(function (l) { var dd = acctDayKey_(l.ts || 0); if (inR(dd)) { var o = day(dd), m = l.pay || 'ເງິນສົດ'; o.creditPays[m] = (o.creditPays[m] || 0) + (+l.amt || 0); } });
    if (!inR(d)) return;
    var o = day(d), total = +b.total || 0;
    if (b.voided) { o.voids.n++; o.voids.amt += total; return; }
    if (b.deposit) { partsOf(b, total).forEach(function (p) { o.deposits[p[0]] = (o.deposits[p[0]] || 0) + p[1]; }); return; }
    var ref = +b.refundAmt || 0, tip = +b.tip || 0, fee = +b.cardFee || 0;
    var sp = b.svcPct != null ? +b.svcPct : svcPct, vp = b.vatPct != null ? +b.vatPct : vatPct;
    var aft = Math.round(total / ((1 + sp / 100) * (1 + vp / 100))), svc = Math.round(aft * sp / 100);
    var f = total > 0 ? Math.max(0, Math.min(1, (total - ref) / total)) : 1, totalN = total - ref;
    var aftN = Math.round(aft * f), svcN = Math.round(svc * f), vatN = totalN - aftN - svcN;
    o.bills++; o.sales += aftN; o.svc += svcN; o.vat += vatN; o.tips += tip; o.fees += fee; o.refunds += ref; o.cogs += +b.cogs || 0;
    (b.items || []).forEach(function (i) { if (i.code === 'DEPOSIT-USE') o.depUsed += Math.abs((+i.price || 0) * (+i.qty || 1)); });
    if (b.credit) o.credit += +b.creditOwed || (total + tip + fee);
    else partsOf(b, total + tip + fee).forEach(function (p) { o.pay[p[0]] = (o.pay[p[0]] || 0) + p[1]; });
    var lines = (b.items || []).filter(function (i) { return i.code !== 'DEPOSIT-USE'; }).map(function (i) { return [cat[i.code] || '-', acctLine_(i)]; }), sum = lines.reduce(function (a, l) { return a + l[1]; }, 0);
    flo[d] = flo[d] || {};
    if (sum > 0) lines.forEach(function (l) { flo[d][l[0]] = (flo[d][l[0]] || 0) + l[1] / sum * aftN; }); else flo[d]['-'] = (flo[d]['-'] || 0) + aftN;
  });
  (st.expenses || []).forEach(function (e) { if (!e) return; var d = acctDayKey_(e.ts || 0); if (!inR(d)) return; var o = day(d), c = e.cat || 'ອື່ນໆ'; o.expenses[c] = (o.expenses[c] || 0) + (+e.amount || 0); });
  var ing = st.ingredients || {};
  (st.stockLog || []).forEach(function (l) { if (!l) return; var d = acctDayKey_(l.ts || 0); if (!inR(d)) return; var c = +(ing[l.code] && ing[l.code].cost) || 0, dl = +l.delta || 0;
    if (l.reason === 'ເສຍຫາຍ' && dl < 0) day(d).waste += -dl * c; else if (l.reason === 'ນັບປັບສະຕ໋ອກ' && dl < 0) day(d).shortage += -dl * c; });
  (st.shiftLog || []).forEach(function (sh) { if (!sh) return; var d = acctDayKey_(sh.closeTs || 0); if (!inR(d)) return; day(d).cashDiff += (+sh.countedCash || 0) - (+sh.expectedCash || 0); });
  Object.keys(D).forEach(function (d) {
    var o = D[d], fl = flo[d] || {}, ks = Object.keys(fl);
    ['sales', 'svc', 'vat', 'tips', 'fees', 'refunds', 'cogs', 'credit', 'depUsed', 'waste', 'shortage', 'cashDiff'].forEach(function (k) { o[k] = Math.round(o[k]); });
    ['pay', 'creditPays', 'deposits', 'expenses'].forEach(function (k) { Object.keys(o[k]).forEach(function (m) { o[k][m] = Math.round(o[k][m]); }); });
    o.voids.amt = Math.round(o.voids.amt);
    ks.forEach(function (k) { o.byCat[k] = Math.round(fl[k]); });
    if (ks.length) { var big = ks.sort(function (a, b) { return o.byCat[b] - o.byCat[a]; })[0], res = o.sales - ks.reduce(function (a, k) { return a + o.byCat[k]; }, 0); o.byCat[big] += res; }
  });
  return D;
}
/* ມູນຄ່າສະຕ໋ອກຕອນນີ້ (ຕາມຕົ້ນທຶນ) — ຮອງຮັບທັງ locs (ຫຼາຍບ່ອນເກັບ) ແລະ stock (ບ່ອນດຽວ) */
function acctStock_(st) {
  var v = 0, ing = st.ingredients || {};
  Object.keys(ing).forEach(function (k) { var it = ing[k] || {}, c = +it.cost || 0;
    if (it.locs && Object.keys(it.locs).length) Object.keys(it.locs).forEach(function (l) { v += (+it.locs[l] || 0) * c; });
    else v += Math.max(0, +it.stock || 0) * c; });
  return Math.round(v);
}
function hqAcct_(q, stateJson) {
  var from = String(q.from || ''), to = String(q.to || ''), ok = function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); };
  if (!ok(from) || !ok(to) || from > to) return { ok: false, err: 'date' };
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 93) return { ok: false, err: 'range' };
  var s = stateJson !== undefined ? stateJson : getState_(), st = s ? JSON.parse(s) : {};
  var br = { id: 'b1', name: st.shopName || 'ST Jewelry', type: 'branch', shop: st.shopName || '', svcPct: +st.serviceChargePct || 0, vatPct: +st.vatPct || 0, openShift: !!st.curShift, stockValue: acctStock_(st), days: acctDays_(st, from, to) };
  return { ok: true, v: ACCT_V, from: from, to: to, today: acctDayKey_(Date.now()), at: Date.now(), branches: [br] };
}
