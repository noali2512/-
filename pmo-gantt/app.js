(function () {
  "use strict";
  var HEAD = '<title>גאנט הקמת אתר PDI</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Hebrew:wght@400;500;600;700&display=swap">';
  var RESET = ':root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.4 system-ui,-apple-system,sans-serif;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}';
  var SRC = document.getElementById("app-src").textContent;
  var CSS = document.getElementById("app-style").textContent;
  var DATA = JSON.parse(document.getElementById("pmo-data").textContent);
  var UIDN = 0;
  function newUid() { return "u" + Date.now().toString(36) + (UIDN++).toString(36) + Math.random().toString(36).slice(2, 6); }
  DATA.tasks.forEach(function (t) { if (!t.uid) t.uid = newUid(); });
  var SAVED = JSON.parse(JSON.stringify(DATA));
  var app = document.getElementById("app");

  /* the client file and phones open on the summary view; each remembers its own last tab */
  var MOB = !!(window.matchMedia && window.matchMedia("(max-width: 760px)").matches), SNAP = !!DATA.snapshot;
  var TABK = SNAP ? "tabS" : MOB ? "tabM" : "tab";
  var S = {
    tab: SNAP || MOB ? "exec" : "gantt", edit: false, canEdit: false, dl: null, sel: null,
    q: "", owners: [], ownOpen: false, ownQ: "", filter: "all", zoom: 84, collapsed: {}, dirty: false, saving: false, rp: "daily", rpDate: ""
  };
  try { var pref = JSON.parse(localStorage.getItem("pmo-pref") || "{}"); if (pref.zoom) S.zoom = pref.zoom; if (pref.collapsed) S.collapsed = pref.collapsed; if (pref[TABK] && !SNAP) S.tab = pref[TABK]; } catch (e) {}
  function savePref() { try { var pr = JSON.parse(localStorage.getItem("pmo-pref") || "{}"); pr.zoom = S.zoom; pr.collapsed = S.collapsed; pr[TABK] = S.tab; localStorage.setItem("pmo-pref", JSON.stringify(pr)); } catch (e) {} }

  /* ---------- dates ---------- */
  function dn(s) { if (!s) return null; var p = s.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5; }
  function ds(n) { return new Date(n * 864e5).toISOString().slice(0, 10); }
  function fm(n) { if (n == null) return "—"; var d = new Date(n * 864e5); return pad(d.getUTCDate()) + "." + pad(d.getUTCMonth() + 1); }
  function fmy(n) { if (n == null) return "—"; var d = new Date(n * 864e5); return fm(n) + "." + String(d.getUTCFullYear()).slice(2); }
  /* Hebrew-friendly date range: RLM keeps the start date on the right in RTL text */
  function rg(a, b, f) { f = f || fm; return f(a) + "\u200F–\u200F" + f(b); }
  function heDate(iso) { var n = dn(iso); return n == null ? "" : fmy(n); }
  function heParse(s, fallbackYear) {
    s = String(s || "").trim(); if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var p = s.split(/[.\/\-\s]+/).filter(Boolean);
    if (p.length < 2 || p.length > 3) return null;
    var d = +p[0], m = +p[1], y = p[2] ? +p[2] : (fallbackYear || NOW.getFullYear());
    if (y < 100) y += 2000;
    if (!d || !m || !y) return null;
    var t = new Date(Date.UTC(y, m - 1, d));
    if (t.getUTCDate() !== d || t.getUTCMonth() !== m - 1) return null;
    return t.toISOString().slice(0, 10);
  }
  var ICON_CAL = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  function dateIn(attrs, iso) {
    return '<span class="dpick"><input type="text" inputmode="numeric" autocomplete="off" data-date="1" data-iso="' + esc(iso || "") + '" placeholder="יום.חודש.שנה" value="' + esc(heDate(iso)) + '" ' + attrs + '>' +
      '<button type="button" class="dbtn" data-cal="1" aria-label="בחירה מלוח שנה" title="בחירה מלוח שנה">' + ICON_CAL + '</button></span>';
  }
  function pad(x) { return (x < 10 ? "0" : "") + x; }
  var NOW = new Date(); var TODAY = Date.UTC(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()) / 864e5;
  var TODAY_S = ds(TODAY);
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ---------- model ---------- */
  var byId, kids, roots, C;
  function cmpW(a, b) { var x = a.split("."), y = b.split("."); for (var i = 0; i < Math.max(x.length, y.length); i++) { var d = (+x[i] || 0) - (+y[i] || 0); if (x[i] == null) return -1; if (y[i] == null) return 1; if (d) return d; } return 0; }
  function parentOf(id) { var i = id.lastIndexOf("."); return i < 0 ? null : id.slice(0, i); }
  function build() {
    DATA.tasks.sort(function (a, b) { return cmpW(a.id, b.id); });
    byId = {}; kids = {}; roots = [];
    DATA.tasks.forEach(function (t) { byId[t.id] = t; });
    DATA.tasks.forEach(function (t) {
      var p = parentOf(t.id);
      while (p && !byId[p]) p = parentOf(p);
      if (p) (kids[p] = kids[p] || []).push(t); else roots.push(t);
    });
    compute();
  }
  function compute() {
    C = {}; var busy = {};
    function calc(id) {
      if (C[id]) return C[id];
      if (busy[id] || !byId[id]) return null;
      busy[id] = 1;
      var t = byId[id], ch = kids[id] || [], r;
      if (ch.length) {
        var rs = ch.map(function (c) { return calc(c.id); }).filter(Boolean);
        r = { par: true, leaves: 0, doneN: 0, lateN: 0, soonN: 0, bs: null, be: null, fs: null, fe: null };
        rs.forEach(function (x) {
          r.leaves += x.leaves; r.doneN += x.doneN; r.lateN += x.lateN; r.soonN += x.soonN;
          ["bs", "fs"].forEach(function (k) { if (x[k] != null && (r[k] == null || x[k] < r[k])) r[k] = x[k]; });
          ["be", "fe"].forEach(function (k) { if (x[k] != null && (r[k] == null || x[k] > r[k])) r[k] = x[k]; });
        });
        r.pct = r.leaves ? r.doneN / r.leaves : 0;
        r.done = r.leaves > 0 && r.doneN === r.leaves;
        r.late = r.lateN > 0;
        r.slip = r.fe != null && r.be != null ? r.fe - r.be : 0;
      } else {
        var bs = dn(t.start), be = dn(t.end), shift = 0;
        (t.deps || []).forEach(function (d) {
          var p = calc(d);
          if (!p || p.fe == null || p.be == null || bs == null) return;
          shift = Math.max(shift, p.fe - Math.max(p.be, bs - 1));
        });
        var fs = bs == null ? null : bs + shift, fe = be == null ? null : be + shift;
        var done = t.status === "done";
        if (done && t.actualEnd) fe = dn(t.actualEnd);
        else if (!done && t.forecastEnd) fe = Math.max(dn(t.forecastEnd), fs == null ? -1e9 : fs);
        if (fs != null && fe != null && fe < fs) fs = fe;
        r = { par: false, bs: bs, be: be, fs: fs, fe: fe, shift: shift, done: done, leaves: 1, doneN: done ? 1 : 0 };
        r.late = !done && fe != null && TODAY > fe;
        r.soon = !done && fe != null && fe >= TODAY && fe - TODAY <= 7;
        r.slip = fe != null && be != null ? fe - be : 0;
        r.lateN = r.late ? 1 : 0; r.soonN = r.soon ? 1 : 0; r.pct = done ? 1 : 0;
        r.missing = !t.start || !t.end;
      }
      delete busy[id]; C[id] = r; return r;
    }
    DATA.tasks.forEach(function (t) { calc(t.id); });
  }
  function leaves() { return DATA.tasks.filter(function (t) { return !(kids[t.id] || []).length; }); }
  function statusOf(t) {
    var c = C[t.id];
    if (c.par) return c.done ? ["p-done", "הושלם"] : c.late ? ["p-late", c.lateN + " באיחור"] : c.doneN ? ["p-doing", Math.round(c.pct * 100) + "%"] : ["p-todo", "0%"];
    if (c.done) return ["p-done", "הושלם"];
    if (t.status === "supplier") return c.late ? ["p-sup late", "ממתין לספק +" + (TODAY - c.fe)] : ["p-sup", "ממתין לספק"];
    if (t.status === "noref") return c.late ? ["p-ref late", "ממתין לרפרנט +" + (TODAY - c.fe)] : ["p-ref", "ממתין לרפרנט"];
    if (c.late) return ["p-late", "באיחור " + (TODAY - c.fe) + " ימ׳"];
    if (c.slip > 0) return ["p-slip", "חריגה +" + c.slip];
    if (t.status === "doing") return ["p-doing", "בביצוע"];
    if (c.missing) return ["p-miss", "חסר תאריך"];
    return ["p-todo", "טרם החל"];
  }
  function barCls(t) { var c = C[t.id]; return c.done ? "done" : t.status === "supplier" ? "sup" : t.status === "noref" ? "ref" : c.late ? "late" : c.slip > 0 ? "slip" : t.status === "doing" ? "doing" : ""; }

  /* ---------- rows / filters ---------- */
  function filtering() { return !!(S.q || S.owners.length || S.filter !== "all"); }
  function matches(t) {
    var c = C[t.id], q = S.q.trim();
    if (q && t.name.indexOf(q) < 0 && t.id.indexOf(q) !== 0 && (t.owner || "").indexOf(q) < 0) return false;
    if (S.owners.length) {
      var ns = splitOwners(t.owner);
      var hit = ns.length ? ns.some(function (n) { return S.owners.indexOf(n) >= 0; }) : S.owners.indexOf("__none") >= 0;
      if (!hit) return false;
    }
    switch (S.filter) {
      case "late": return c.late;
      case "soon": return c.soon;
      case "slip": return c.slip > 0 && !c.done;
      case "sup": return !c.done && t.status === "supplier";
      case "crit": return !!t.critical;
      case "ref": return !c.done && t.status === "noref";
      case "open": return !c.done;
      case "done": return c.done;
    }
    return true;
  }
  function rows() {
    var f = filtering(), out = [];
    function walk(t, lvl) {
      var ch = kids[t.id] || [];
      if (!ch.length) return !f || matches(t) ? [{ t: t, lvl: lvl }] : [];
      var sub = []; ch.forEach(function (c) { sub = sub.concat(walk(c, lvl + 1)); });
      if (f && !sub.length) return [];
      var r = [{ t: t, lvl: lvl }];
      return (f || !S.collapsed[t.id]) ? r.concat(sub) : r;
    }
    roots.forEach(function (t) { out = out.concat(walk(t, 1)); });
    return out;
  }
  /* "דני, יניב" / "בוחן/משאבי אנוש" -> separate people; "מנהל/ת" stays one word */
  function splitOwners(s) { return String(s || "").split(/\s*[,;+]\s*|\s*\/(?![תה](?:\s|$|[,)]))\s*|\s+&\s+/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function people() {
    var m = {}, none = 0;
    leaves().forEach(function (t) { var ns = splitOwners(t.owner); if (!ns.length) none++; ns.forEach(function (n) { m[n] = (m[n] || 0) + 1; }); });
    return { list: Object.keys(m).sort(function (a, b) { return a.localeCompare(b, "he"); }).map(function (n) { return [n, m[n]]; }), none: none };
  }
  function ownerFilter() {
    var P = people(), sel = S.owners, q = S.ownQ.trim();
    var label = !sel.length ? "כל האחראים" : sel.length <= 2 ? sel.map(function (n) { return n === "__none" ? "ללא אחראי" : n; }).join(", ") : sel.length + " אחראים נבחרו";
    var h = '<div class="msel"><button class="msel-btn' + (sel.length ? " on" : "") + '" data-a="own-toggle" aria-expanded="' + S.ownOpen + '" aria-haspopup="true">' + esc(label) + ' <span aria-hidden="true">▾</span></button>';
    if (S.ownOpen) {
      h += '<div class="msel-pop" role="dialog" aria-label="סינון לפי אחראים"><input type="search" id="own-q" placeholder="חיפוש אחראי" value="' + esc(S.ownQ) + '" aria-label="חיפוש אחראי"><div class="msel-list">';
      var rows = P.list.filter(function (r) { return !q || r[0].indexOf(q) >= 0; });
      rows.forEach(function (r) { h += '<label><input type="checkbox" data-own="' + esc(r[0]) + '"' + (sel.indexOf(r[0]) >= 0 ? " checked" : "") + '><span>' + esc(r[0]) + '</span><span class="cnt">' + r[1] + '</span></label>'; });
      if (!q && P.none) h += '<label><input type="checkbox" data-own="__none"' + (sel.indexOf("__none") >= 0 ? " checked" : "") + '><span>ללא אחראי</span><span class="cnt">' + P.none + '</span></label>';
      if (!rows.length && q) h += '<div class="note" style="padding:8px">לא נמצא אחראי בשם הזה.</div>';
      h += '</div><div class="msel-foot"><span class="note">מוצגות משימות של כל אחד מהנבחרים</span><button class="btn sm" data-a="own-clear">ניקוי</button></div></div>';
    }
    return h + '</div>';
  }
  function owners() { var m = {}; DATA.tasks.forEach(function (t) { if (t.owner) m[t.owner] = 1; }); return Object.keys(m).sort(); }

  /* ---------- render ---------- */
  var ICON_CHECK = '<svg width="12" height="12" viewBox="0 0 12 12"><path d="m2.5 6.2 2.4 2.3 4.6-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_FLAG = '<svg width="11" height="12" viewBox="0 0 11 12" aria-hidden="true"><path d="M2 11.2V1.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M2.6 1.4h6.6L7.6 4l1.6 2.6H2.6z" fill="currentColor"/></svg>';
  var ICON_GRIP = '<svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.2"/><circle cx="7" cy="3" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="11" r="1.2"/><circle cx="7" cy="11" r="1.2"/></g></svg>';
  var ICON_CHEV = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M8 2 4 6l4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function render() {
    build();
    var p = DATA.project, L = leaves(), done = 0, late = 0, soon = 0, slip = 0;
    L.forEach(function (t) { var c = C[t.id]; if (c.done) done++; if (c.late) late++; if (c.soon) soon++; if (c.slip > 0 && !c.done) slip++; });
    var gl = byId[p.goLiveTask] && C[p.goLiveTask], glDelta = gl && gl.fs != null && gl.bs != null ? Math.max(0, gl.fs - gl.bs) : 0;
    var glDate = p.goLiveDate ? dn(p.goLiveDate) + glDelta : gl ? gl.fs : null;
    var pct = L.length ? Math.round(done / L.length * 100) : 0;
    var h = '';
    h += '<header class="top"><div><div class="eyebrow">' + esc(p.client) + ' · ' + esc(p.subtitle) + '</div><h1>' + esc(p.title) + '</h1>' +
      '<div class="sub">' + (DATA.snapshot ? 'גרסת צפייה · הופקה ב-' + esc(fmtStamp(DATA.snapshot.at)) + ' · עדכון אחרון של התוכנית: ' + esc(fmtStamp(DATA.savedAt)) : 'נכון ל-' + fmy(TODAY) + ' · עדכון אחרון של התוכנית: ' + esc(fmtStamp(DATA.savedAt))) + '</div></div><div class="actions">';
    if (S.dl && S.canEdit && !DATA.snapshot) h += '<button class="btn" data-a="client-copy">הורדת גרסת לקוח</button>';
    if (S.dl && !DATA.snapshot) h += '<button class="btn" data-a="export-xlsx">ייצוא לאקסל</button>';
    if (S.canEdit) h += '<button class="btn ' + (S.edit ? "on" : "") + '" data-a="toggle-edit" aria-pressed="' + S.edit + '">' + (S.edit ? "סיום עריכה" : "מצב עריכה") + '</button>';
    h += '</div></header>';
    if (S.edit) {
      h += '<div class="editbar"><span class="msg">' + (S.dirty ? "יש שינויים שטרם פורסמו. הם נשמרים אוטומטית בדפדפן שלך" + (S.localAt ? " (נשמר " + pad(S.localAt.getHours()) + ":" + pad(S.localAt.getMinutes()) + ")" : "") + ", והצוות והלקוח יראו אותם אחרי פרסום." : "מצב עריכה: עדכון ישיר בטבלה. גרירה של ⋮⋮ משנה את מיקום השורה (שחרור באמצע שורת פרק מכניס לתוכו). לחיצה על השורה פותחת את כל השדות.") + '</span>' +
        (DATA.tasks.some(function (t) { return t.status === "supplier"; }) ? '<button class="btn sm" data-a="release-sup">שחרור המשימות שממתינות לספק</button>' : '') +
        '<button class="btn sm" data-a="import">ייבוא מאקסל</button><input type="file" id="imp-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>' +
        '<button class="btn sm" data-a="project">פרטי פרויקט ואבני דרך</button><button class="btn sm" data-a="add-root">+ משימת על</button>' +
        (S.dirty ? '<button class="btn sm" data-a="discard">ביטול שינויים</button>' : '') +
        '<button class="btn primary sm" data-a="save" ' + (!S.dirty || S.saving ? "disabled" : "") + '>' + (S.saving ? "מפרסם…" : "פרסום השינויים") + '</button></div>';
    }
    if (S.tab !== "exec") h += '<section class="kpis" aria-label="תמונת מצב">' +
      kpi("התקדמות כוללת", pct + '<small>%</small>', '<div class="meter"><i style="width:' + pct + '%"></i></div>', "") +
      kpi("משימות שהושלמו", done + ' <small>מתוך ' + L.length + '</small>', "", "ok") +
      kpi("באיחור", late, "", late ? "bad" : "") +
      kpi("יעד ב-7 הימים הקרובים", soon, "", soon ? "warn" : "") +
      kpi("צפי חריגה מהתוכנית", slip, "", slip ? "warn" : "") +
      kpi("Go-Live צפוי", glDate != null ? fmy(glDate) : "—", '<span class="note">' + (gl ? (glDelta > 0 ? "דחייה של " + glDelta + " ימים" : "לפי התוכנית") : "") + '</span>', glDelta > 0 ? "bad" : "") +
      '</section>';
    h += '<div class="bar-row"><div class="tabs" role="tablist">' +
      tab("exec", "מבט הנהלה") + tab("overview", "תמונת מצב") + tab("gantt", "גאנט") + tab("attn", "לטיפול" + (late ? " (" + late + ")" : "")) + tab("report", "דוח יומי / שבועי") + '</div>';
    if (S.tab === "gantt") {
      h += '<div class="tools"><input type="search" id="q" placeholder="חיפוש משימה, WBS או אחראי" value="' + esc(S.q) + '" aria-label="חיפוש">' +
        ownerFilter() +
        '<select id="zoom" aria-label="רוחב שבוע">' + [[56, "תצוגה צפופה"], [84, "תצוגה רגילה"], [128, "תצוגה מורחבת"]].map(function (z) { return '<option value="' + z[0] + '"' + (S.zoom === z[0] ? " selected" : "") + '>' + z[1] + '</option>'; }).join("") + '</select>' +
        '<button class="btn sm" data-a="expand">פתיחת הכול</button><button class="btn sm" data-a="collapse">כיווץ לפרקים</button></div>';
    }
    h += '</div>';
    if (S.tab === "gantt") {
      h += '<div class="chips" role="group" aria-label="סינון לפי מצב">' + [["all", "הכול"], ["open", "פתוחות"], ["late", "באיחור"], ["soon", "יעד בשבוע הקרוב"], ["slip", "צפי חריגה"], ["sup", "תלוי בבחירת ספק"], ["ref", "ממתין לרפרנט"], ["crit", "נתיב קריטי"], ["done", "הושלמו"]].map(function (x) {
        return '<button class="chipbtn" data-f="' + x[0] + '" aria-pressed="' + (S.filter === x[0]) + '">' + x[1] + '</button>';
      }).join("") + '</div>';
      h += gantt();
      h += '<div class="legend"><span><i class="sw" style="background:var(--ok)"></i>הושלם</span><span><i class="sw" style="background:var(--bad)"></i>באיחור (עבר תאריך היעד)</span><span><i class="sw" style="background:var(--warn)"></i>צפי חריגה מהתוכנית</span><span><i class="sw" style="background:var(--accent)"></i>בביצוע</span><span><i class="sw sw-sup"></i>תלוי בבחירת ספק</span><span><i class="sw sw-ref"></i>טרם התקבל עדכון מרפרנט</span><span><i class="sw sw-crit"></i>נתיב קריטי לעלייה לאוויר</span><span><i class="sw" style="background:var(--bar)"></i>מתוכנן</span><span><i class="sw" style="background:var(--bar-base);height:3px"></i>תוכנית הבסיס (כשיש סטייה)</span><span><i class="sw" style="background:var(--today);width:2px;height:12px"></i>היום</span><span><i class="sw" style="background:var(--pink);transform:rotate(45deg);width:8px;height:8px"></i>אבן דרך</span></div>';
    } else if (S.tab === "exec") h += execView(glDate, glDelta);
    else if (S.tab === "overview") h += overview();
    else if (S.tab === "report") h += report();
    else h += attention();
    app.innerHTML = h;
    renderDrawer();
  }
  function kpi(l, v, extra, cls) { return '<div class="kpi ' + cls + '"><span class="l">' + l + '</span><span class="v">' + v + '</span>' + extra + '</div>'; }
  function tab(k, l) { return '<button class="tab" role="tab" data-tab="' + k + '" aria-selected="' + (S.tab === k) + '">' + l + '</button>'; }
  function fmtStamp(s) { if (!s) return "—"; var d = new Date(s); if (isNaN(d)) return s; return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + String(d.getFullYear()).slice(2) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }

  function range() {
    var lo = null, hi = null;
    DATA.tasks.forEach(function (t) { var c = C[t.id];[c.bs, c.fs].forEach(function (v) { if (v != null && (lo == null || v < lo)) lo = v; });[c.be, c.fe].forEach(function (v) { if (v != null && (hi == null || v > hi)) hi = v; }); });
    (DATA.project.milestones || []).forEach(function (m) { var v = dn(m.date); if (v == null) return; if (lo == null || v < lo) lo = v; if (hi == null || v > hi) hi = v; });
    if (lo == null) { lo = TODAY; hi = TODAY + 60; }
    if (TODAY > hi) hi = TODAY;
    var dow = new Date(lo * 864e5).getUTCDay(); lo -= dow;            /* Sunday */
    var dow2 = new Date(hi * 864e5).getUTCDay(); hi += 6 - dow2 + 7;  /* Saturday + a week */
    return { lo: lo, hi: hi, weeks: Math.round((hi - lo + 1) / 7) };
  }
  function gantt() {
    var R = range(), wk = S.zoom, day = wk / 7, tlW = R.weeks * wk;
    var list = rows();
    function x(n) { return (n - R.lo) * day; }
    var h = '<div class="gantt' + (S.edit ? ' editing' : '') + '" id="gantt" style="--wk:' + wk + 'px;--tlW:' + tlW + 'px"><div class="gin">';
    if (S.edit) h += '<datalist id="owners-all">' + owners().map(function (o) { return '<option value="' + esc(o) + '">'; }).join("") + '</datalist>';
    h += S.edit ? '<div class="row hdr"><div class="info"><span></span><span title="נתיב קריטי לעלייה לאוויר">קריטי</span><span></span><span>WBS</span><span>משימה</span><span>אחראי ביצוע</span><span>התחלה</span><span>יעד</span><span>סטטוס</span></div><div class="tl">'
      : '<div class="row hdr"><div class="info"><span></span><span>WBS</span><span>משימה</span><span class="c-own">אחראי</span><span class="c-sd">התחלה</span><span>יעד</span><span class="c-st">מצב</span></div><div class="tl">';
    for (var w = 0; w < R.weeks; w++) {
      var a = R.lo + w * 7, cur = TODAY >= a && TODAY <= a + 6;
      h += '<div class="wk' + (cur ? " now" : "") + '" style="right:' + (w * wk) + 'px;width:' + wk + 'px">' + (wk >= 80 ? rg(a, a + 6) : fm(a)) + '</div>';
    }
    (DATA.project.milestones || []).forEach(function (m) {
      var v = dn(m.date); if (v == null) return;
      h += '<div class="ms" style="right:' + (x(v) + day / 2) + 'px" title="' + esc(m.label + " · " + fmy(v)) + '"><i></i>' + (wk >= 80 ? esc(shortLabel(m.label)) : "") + '</div>';
    });
    h += '</div></div>';
    if (!list.length) h += '<div class="empty">אין משימות שתואמות לסינון שנבחר.</div>';
    list.forEach(function (r) {
      var t = r.t, c = C[t.id], st = statusOf(t), ch = (kids[t.id] || []).length;
      var cls = "row l" + Math.min(r.lvl, 3) + (ch ? " par" : "") + (c.done ? " done" : c.late ? " late" : "") + (t.critical ? " crit" : "") + (S.sel === t.id ? " sel" : "");
      h += '<div class="' + cls + '" data-id="' + esc(t.id) + '"><div class="info">';
      if (S.edit) h += '<span class="drag" draggable="true" data-drag="' + esc(t.id) + '" title="גרירה לשינוי מיקום" aria-label="גרירה לשינוי מיקום">' + ICON_GRIP + '</span>' +
        '<button class="ck-crit' + (t.critical ? " on" : "") + '" data-crit="' + esc(t.id) + '" title="' + (t.critical ? "משימה קריטית לעלייה לאוויר (לחיצה לביטול)" : "סימון כמשימה קריטית לעלייה לאוויר") + '" aria-label="נתיב קריטי ' + esc(t.id) + '" aria-pressed="' + !!t.critical + '">' + ICON_FLAG + '</button>';
      if (ch) h += '<button class="tw' + (S.collapsed[t.id] && !filtering() ? "" : " col") + '" data-tw="' + esc(t.id) + '" aria-label="פתיחה או כיווץ">' + ICON_CHEV + '</button>';
      else if (S.edit) h += '<button class="check' + (c.done ? " on" : "") + '" data-done="' + esc(t.id) + '" aria-label="סימון כהושלם" aria-pressed="' + c.done + '">' + (c.done ? ICON_CHECK : "") + '</button>';
      else h += '<span></span>';
      h += '<span class="wbs">' + esc(t.id) + '</span>';
      if (S.edit) {
        var tid = esc(t.id);
        h += '<span class="nm" style="padding-inline-start:' + (2 + (r.lvl - 1) * 12) + 'px"><input class="ie" data-t="' + tid + '" data-k="name" value="' + esc(t.name) + '" aria-label="שם משימה ' + tid + '"></span>';
        h += '<span><input class="ie' + (!t.owner && !ch ? ' miss' : '') + '" list="owners-all" data-t="' + tid + '" data-k="owner" value="' + esc(t.owner) + '" placeholder="' + (ch ? '' : 'חסר אחראי') + '" aria-label="אחראי ' + tid + '"></span>';
        if (ch) h += '<span class="dt">' + fm(c.bs) + '</span><span class="dt">' + fm(c.be) + '</span><span>' + bulkSel(t, 'class="ie bulk ' + st[0] + '" data-bulk="' + tid + '" aria-label="סטטוס לכל תתי-המשימות של ' + tid + '"', st[1]) + '</span>';
        else {
          h += '<span>' + dateIn('class="ie" data-t="' + tid + '" data-k="start" aria-label="התחלה ' + tid + '"', t.start) + '</span>';
          h += '<span>' + dateIn('class="ie" data-t="' + tid + '" data-k="end" aria-label="יעד ' + tid + '"', t.end) + '</span>';
          h += '<span><select class="ie st-' + (c.late ? 'late' : t.status) + '" data-t="' + tid + '" data-k="status" aria-label="סטטוס ' + tid + '">' + [["todo", "טרם החל"], ["doing", "בביצוע"], ["supplier", "תלוי בבחירת ספק"], ["noref", "ממתין לעדכון רפרנט"], ["done", "הושלם"]].map(function (o) { return '<option value="' + o[0] + '"' + (t.status === o[0] ? " selected" : "") + '>' + o[1] + '</option>'; }).join("") + '</select></span>';
        }
      } else {
      h += '<span class="nm" style="padding-inline-start:' + (6 + (r.lvl - 1) * 14) + 'px" title="' + esc(t.name) + '">' + esc(t.name) + '</span>';
      h += '<span class="own c-own" title="' + esc(t.owner) + '">' + esc(t.owner) + '</span>';
      h += '<span class="dt c-sd">' + fm(c.fs) + '</span><span class="dt">' + fm(c.fe) + '</span>';
      h += '<span class="st c-st"><span class="pill ' + st[0] + '">' + st[1] + '</span></span>';
      }
      h += '</div><div class="tl">';
      if (c.fs != null && c.fe != null) {
        var right = x(c.fs), width = Math.max((c.fe - c.fs + 1) * day, 6), tip = esc(t.id + " " + t.name + " · " + rg(c.fs, c.fe) + (c.slip ? " (תוכנית: " + rg(c.bs, c.be) + ")" : ""));
        if (ch) {
          h += '<div class="b sum' + (c.late ? " late" : "") + '" style="right:' + right + 'px;width:' + width + 'px" title="' + tip + '"><i style="width:' + Math.round(c.pct * 100) + '%"></i></div>';
          h += '<span class="pct" style="right:' + (right + width + 6) + 'px">' + Math.round(c.pct * 100) + '%</span>';
        } else {
          h += '<div class="b ' + barCls(t) + '" style="right:' + right + 'px;width:' + width + 'px" title="' + tip + '"></div>';
          if (c.late) h += '<div class="b over" style="right:' + (right + width) + 'px;width:' + ((TODAY - c.fe) * day) + 'px" title="איחור של ' + (TODAY - c.fe) + ' ימים"></div>';
          if (c.slip && c.bs != null && c.be != null) h += '<div class="b base" style="right:' + x(c.bs) + 'px;width:' + Math.max((c.be - c.bs + 1) * day, 4) + 'px" title="תוכנית הבסיס: ' + rg(c.bs, c.be) + '"></div>';
        }
      }
      h += '</div></div>';
    });
    var info = "var(--infoW)";
    h += '<div class="vline" style="right:calc(' + info + ' + ' + (x(TODAY) + day / 2) + 'px)" title="היום"></div>';
    (DATA.project.milestones || []).forEach(function (m) { var v = dn(m.date); if (v != null) h += '<div class="vline m" style="right:calc(' + info + ' + ' + (x(v) + day / 2) + 'px)"></div>'; });
    h += '</div></div>';
    return h;
  }
  function shortLabel(s) { return s.length > 22 ? s.slice(0, 21) + "…" : s; }

  function overview() {
    var L = leaves();
    function byFe(a, b) { return (C[a.id].fe || 0) - (C[b.id].fe || 0); }
    function mini(title, arr, emptyTxt, f) {
      var h = '<h3>' + title + ' <span class="note">(' + arr.length + ')</span></h3><div class="list">';
      if (!arr.length) h += '<div class="note">' + emptyTxt + '</div>';
      arr.slice(0, 6).forEach(function (t) { var st = statusOf(t); h += '<div class="li" data-open="' + esc(t.id) + '"><span class="wbs">' + esc(t.id) + '</span><span><div>' + esc(t.name) + '</div><div class="o">' + (f === "late" ? "יעד " + fm(C[t.id].fe) + " · " + (TODAY - C[t.id].fe === 1 ? "יום איחור אחד" : (TODAY - C[t.id].fe) + " ימי איחור") : "יעד " + fm(C[t.id].fe)) + '</div></span><span class="pill ' + st[0] + '">' + st[1] + '</span></div>'; });
      if (arr.length > 6) h += '<button class="btn sm more" data-tab="attn">' + (arr.length - 6 === 1 ? "ועוד משימה אחת" : "ועוד " + (arr.length - 6) + " משימות") + '</button>';
      return h + '</div>';
    }
    var nextMs = (DATA.project.milestones || []).map(function (m) { return { v: dn(m.date), l: m.label }; }).filter(function (m) { return m.v != null && m.v >= TODAY; }).sort(function (a, b) { return a.v - b.v; })[0];
    var h = '<div class="grid2 ov">';
    h += '<div class="card ov-now"><h2>מה קורה עכשיו</h2>' + (nextMs ? '<div class="nextms"><i></i><span>אבן הדרך הבאה: <b>' + esc(nextMs.l) + '</b> · ' + fmy(nextMs.v) + (nextMs.v - TODAY > 0 ? ' (בעוד ' + (nextMs.v - TODAY === 1 ? "יום" : (nextMs.v - TODAY) + " ימים") + ')' : ' (היום)') + '</span></div>' : '') +
      mini("באיחור", L.filter(function (t) { return C[t.id].late; }).sort(byFe), "אין משימות באיחור.", "late") +
      mini("יעד ב-7 הימים הקרובים", L.filter(function (t) { return C[t.id].soon; }).sort(byFe), "אין משימות שמסתיימות בשבוע הקרוב.") + '</div>';
    h += '<div class="card ov-sec"><h2>התקדמות לפי פרק</h2>';
    roots.forEach(function (t) {
      var c = C[t.id], st = statusOf(t), pc = Math.round(c.pct * 100);
      h += '<div class="sec" data-open="' + esc(t.id) + '"><span class="wbs">' + esc(t.id) + '</span><span class="t" title="' + esc(t.name) + '">' + esc(t.name) + '</span>' +
        '<span class="m"><span class="meter"><i style="width:' + pc + '%;' + (c.late ? "background:var(--bad)" : "") + '"></i></span><b>' + pc + '%</b></span>' +
        '<span class="c4"><span class="pill ' + st[0] + '">' + (c.leaves ? c.doneN + "/" + c.leaves + (c.lateN ? " · " + c.lateN + " באיחור" : "") : "טרם פורט") + '</span></span></div>';
    });
    h += '</div><div class="card ov-ms"><h2>אבני דרך</h2><div class="mslist">';
    (DATA.project.milestones || []).forEach(function (m) { var v = dn(m.date); h += '<div><span class="dt">' + fm(v) + '</span><span>' + esc(m.label) + '</span>' + (v < TODAY ? '<span class="note">(עבר)</span>' : '') + '</div>'; });
    h += '</div></div>';
    if (DATA.snapshot && !(DATA.log || []).length) return h + '</div>';
    h += '<div class="card ov-log"><h2>עדכונים אחרונים</h2><div class="log">';
    (DATA.log || []).slice(0, 12).forEach(function (e) {
      var items = e.items || (e.text ? [e.text] : []);
      h += '<div><div class="d">' + esc(fmtStamp(e.at)) + '</div><ul>' + items.slice(0, 8).map(function (i) { return '<li>' + esc(i) + '</li>'; }).join("") + (items.length > 8 ? '<li>ועוד ' + (items.length - 8) + ' שינויים</li>' : '') + '</ul></div>';
    });
    if (!(DATA.log || []).length) h += '<div class="note">עדיין אין עדכונים.</div>';
    h += '</div></div></div>';
    return h;
  }
  /* one-page management view: where we stand, this week, next week, critical path, delays, decisions */
  function execView(glDate, glDelta) {
    var L = leaves(), dow = new Date(TODAY * 864e5).getUTCDay(), w0 = TODAY - dow, w1 = w0 + 6, n0 = w0 + 7, n1 = w0 + 13;
    var done = L.filter(function (t) { return C[t.id].done; }).length, pct = L.length ? Math.round(done / L.length * 100) : 0;
    var late = L.filter(function (t) { return C[t.id].late; }).sort(function (a, b) { return C[a.id].fe - C[b.id].fe; });
    var crit = L.filter(function (t) { return t.critical; }), critOpen = crit.filter(function (t) { return !C[t.id].done; });
    var critRisk = critOpen.filter(function (t) { var c = C[t.id]; return c.late || c.slip > 0 || t.status === "supplier" || t.status === "noref"; });
    var toGl = glDate != null ? glDate - TODAY : null;
    /* red only when Go-Live itself moves; delays that Go-Live still absorbs are amber */
    var health = glDelta > 0 ? ["bad", "Go-Live בסיכון"] : late.length || critRisk.length ? ["warn", "דורש תשומת לב"] : ["ok", "בתוכנית"];
    function chap(t) { return t.id.split(".")[0]; }
    /* the parent task under the chapter, so subtasks read in context */
    function owner_(t) { var p = parentOf(t.id); return p && p.indexOf(".") > 0 && byId[p] ? byId[p] : null; }
    function item(t) { var pt = owner_(t); return '<li data-open="' + esc(t.id) + '"' + (t.critical ? ' class="xc"' : '') + '>' + esc(t.name) + (pt ? '<span class="xp">' + esc(pt.id + " " + pt.name) + '</span>' : '') + '</li>'; }
    function itemText(t) { var pt = owner_(t); return "- " + t.name + (pt ? " (" + pt.name + ")" : ""); }
    function autoText(arr) {
      var g = {}, order = [];
      arr.forEach(function (t) { var k = chap(t); if (!g[k]) { g[k] = []; order.push(k); } g[k].push(t); });
      order.sort(function (a, b) { return +a - +b; });
      return order.map(function (k) { return (byId[k] ? byId[k].name : k) + ":\n" + g[k].map(itemText).join("\n"); }).join("\n\n");
    }
    function manual(txt) {
      var h = '<div class="xm">', ul = false;
      String(txt).split("\n").forEach(function (ln) {
        var m = ln.match(/^\s*[-•*]\s*(.*)$/);
        if (m) { if (!ul) { h += '<ul>'; ul = true; } h += '<li>' + esc(m[1]) + '</li>'; return; }
        if (ul) { h += '</ul>'; ul = false; }
        if (ln.trim()) h += '<div class="xm-h">' + esc(ln.trim()) + '</div>';
      });
      return h + (ul ? '</ul>' : '') + '</div>';
    }
    var wk = fmISO(w0), XT = (DATA.project.exec || {})[wk] || {};
    function section(key, title, sub, arr, extra) {
      var editing = S.edit && S.execEdit === key, has = XT[key] != null && XT[key] !== "";
      var h = '<section class="card"><div class="x-ttl"><h2>' + title + ' <span class="note">' + sub + '</span></h2>' +
        (S.edit && !editing ? '<button class="btn sm" data-a="x-edit" data-k="' + key + '">' + (has ? "עריכת הטקסט" : "עריכה ידנית") + '</button>' : '') + '</div>';
      if (editing) {
        h += '<textarea class="x-ta" id="x-ta" dir="rtl">' + esc(has ? XT[key] : autoText(arr)) + '</textarea>' +
          '<div class="hint">כל שורה שמתחילה במקף (-) מוצגת כסעיף. שורה בלי מקף מוצגת ככותרת. הטקסט נשמר לשבוע הנוכחי בלבד.</div>' +
          '<div class="x-btns"><button class="btn primary sm" data-a="x-save" data-k="' + key + '">שמירה</button><button class="btn sm" data-a="x-cancel">ביטול</button>' +
          (has ? '<button class="btn sm" data-a="x-auto" data-k="' + key + '">חזרה לרשימה האוטומטית</button>' : '') + '</div>';
      } else h += (has ? manual(XT[key]) : grouped(arr)) + (extra || "");
      return h + '</section>';
    }
    function grouped(arr) {
      var g = {}, order = [];
      arr.forEach(function (t) { var k = chap(t); if (!g[k]) { g[k] = []; order.push(k); } g[k].push(t); });
      order.sort(function (a, b) { return +a - +b; });
      if (!order.length) return '<div class="note">אין פריטים לתקופה זו.</div>';
      var rest = order.slice(6); order = order.slice(0, 6);
      return '<div class="xg">' + order.map(function (k) {
        var items = g[k], r = byId[k];
        return '<div class="xg-r"><div class="xg-h"><span class="wbs">' + esc(k) + '</span><b>' + esc(r ? r.name : "") + '</b><span class="xg-n">' + items.length + '</span></div><ul>' +
          items.slice(0, 2).map(item).join("") +
          (items.length > 2 ? '<li class="more">' + (items.length - 2 === 1 ? "ועוד משימה אחת" : "ועוד " + (items.length - 2) + " משימות") + '</li>' : '') + '</ul></div>';
      }).join("") + (rest.length ? '<div class="note">ועוד: ' + rest.map(function (k) { return esc(byId[k] ? byId[k].name : k) + " (" + g[k].length + ")"; }).join(" · ") + '</div>' : '') + '</div>';
    }
    var doneW = L.filter(function (t) { var v = dn(t.actualEnd); return C[t.id].done && v != null && v >= w0 && v <= TODAY; });
    var nextW = L.filter(function (t) { var c = C[t.id]; return !c.done && ((c.fe != null && c.fe >= n0 && c.fe <= n1) || (c.fs != null && c.fs >= n0 && c.fs <= n1)); });
    var restW = L.filter(function (t) { var c = C[t.id]; return !c.done && c.fe != null && c.fe >= TODAY && c.fe <= w1; });
    var dec = L.filter(function (t) { var c = C[t.id]; return !c.done && c.fe != null && c.fe <= TODAY + 14 && /החלט|ועדת היגוי|בחירת|אישור|חתימ/.test(t.name); }).sort(function (a, b) { return C[a.id].fe - C[b.id].fe; });
    function line(t, note) { var st = statusOf(t); return '<div class="li" data-open="' + esc(t.id) + '"><span class="wbs">' + esc(t.id) + '</span><span><div>' + esc(t.name) + '</div><div class="o">' + note + '</div></span><span class="pill ' + st[0] + '">' + st[1] + '</span></div>'; }
    var h = '<div class="exec">';
    // headline
    h += '<section class="x-head"><div class="x-light ' + health[0] + '"><i></i><div><div class="l">מצב התוכנית</div><b>' + health[1] + '</b></div></div>' +
      '<div class="x-k"><div class="l">Go-Live צפוי</div><b>' + fmy(glDate) + '</b><span class="note">' + (glDelta > 0 ? "דחייה של " + glDelta + " ימים" : "לפי התוכנית") + (toGl != null && toGl >= 0 ? " · בעוד " + toGl + " ימים" : "") + '</span></div>' +
      '<div class="x-k"><div class="l">התקדמות כוללת</div><b>' + pct + '%</b><div class="meter"><i style="width:' + pct + '%"></i></div><span class="note">' + done + ' מתוך ' + L.length + ' משימות</span></div>' +
      '<div class="x-k' + (late.length ? " bad" : "") + '"><div class="l">משימות בעיכוב</div><b>' + late.length + '</b><span class="note">' + (late.length ? "עבר תאריך היעד" : "אין עיכובים") + '</span></div>' +
      '<div class="x-k' + (critRisk.length ? " warn" : "") + '"><div class="l">נתיב קריטי</div><b>' + (crit.length ? Math.round((crit.length - critOpen.length) / crit.length * 100) + "%" : "—") + '</b><span class="note">' + (crit.length ? (crit.length - critOpen.length) + " מתוך " + crit.length + " הושלמו" + (critRisk.length ? " · " + critRisk.length + " בסיכון" : "") : "טרם סומנו משימות קריטיות") + '</span></div></section>';
    // road to go-live
    var ms = (DATA.project.milestones || []).map(function (m) { return { v: dn(m.date), l: m.label }; }).filter(function (m) { return m.v != null; }).sort(function (a, b) { return a.v - b.v; });
    if (ms.length) {
      var a = Math.min(ms[0].v, TODAY), b = Math.max(ms[ms.length - 1].v, glDate || 0, TODAY), span = Math.max(b - a, 1), pos = function (v) { return ((v - a) / span * 100).toFixed(2); };
      h += '<section class="card x-road"><h2>הדרך ל-Go-Live</h2><div class="road"><div class="road-line"></div><div class="road-done" style="width:' + pos(TODAY) + '%"></div>' +
        ms.map(function (m, i) { return '<div class="road-m' + (m.v < TODAY ? " past" : "") + (i % 2 ? " dn" : "") + '" style="right:' + pos(m.v) + '%"><i></i><span><b>' + fm(m.v) + '</b>' + esc(m.l) + '</span></div>'; }).join("") +
        '<div class="road-today" style="right:' + pos(TODAY) + '%"><span>היום ' + fm(TODAY) + '</span></div></div></section>';
    }
    // this week / next week
    h += '<div class="x-2">' + section("done", "מה בוצע השבוע", rg(w0, TODAY) + ' · ' + doneW.length + ' משימות', doneW) +
      section("next", "מה מתוכנן לשבוע הבא", rg(n0, n1) + ' · ' + nextW.length + ' משימות', nextW,
        restW.length ? '<div class="note" style="margin-top:8px">ועוד ' + restW.length + ' משימות פתוחות עם יעד עד סוף השבוע הנוכחי.</div>' : '') + '</div>';
    // critical path
    h += '<section class="card x-crit"><h2>הנתיב הקריטי לעלייה לאוויר</h2>';
    if (!crit.length) h += '<div class="note">עדיין לא סומנו משימות בנתיב הקריטי. מסמנים במצב עריכה, בעמודת "קריטי" (עיגול הדגל).</div>';
    else {
      var cs = critOpen.slice().sort(function (x, y) { return (C[x.id].fe || 0) - (C[y.id].fe || 0); });
      var cnt = { d: 0, o: 0, w: 0, l: 0 };
      crit.forEach(function (t) { var c = C[t.id]; cnt[c.done ? "d" : c.late ? "l" : (c.slip > 0 || t.status === "supplier" || t.status === "noref") ? "w" : "o"]++; });
      var seg = [["d", "הושלמו"], ["o", "במסלול"], ["w", "בסיכון או ממתינות"], ["l", "בעיכוב"]];
      h += '<div class="crit-stack">' + seg.filter(function (x) { return cnt[x[0]]; }).map(function (x) { return '<i class="' + x[0] + '" style="flex:' + cnt[x[0]] + '" title="' + x[1] + ': ' + cnt[x[0]] + '">' + (cnt[x[0]] / crit.length > .06 ? cnt[x[0]] : "") + '</i>'; }).join("") + '</div>' +
        '<div class="crit-leg">' + seg.map(function (x) { return '<span><i class="' + x[0] + '"></i>' + x[1] + ' <b>' + cnt[x[0]] + '</b></span>'; }).join("") + '<span class="note">סך הכול ' + crit.length + ' משימות בנתיב הקריטי</span></div>';
      h += '<h3>הצעדים הקריטיים הבאים</h3><div class="list">' + (cs.length ? cs.slice(0, 6).map(function (t) { return line(t, "יעד " + fmy(C[t.id].fe) + (t.owner ? " · " + esc(t.owner) : "")); }).join("") : '<div class="note">כל המשימות בנתיב הקריטי הושלמו.</div>') + '</div>';
    }
    h += '</section>';
    // delays + decisions
    h += '<div class="x-2"><section class="card"><h2>משימות בעיכוב <span class="note">(' + late.length + ')</span></h2><div class="list">' +
      (late.length ? late.slice(0, 6).map(function (t) { var d = TODAY - C[t.id].fe; return line(t, "יעד " + fmy(C[t.id].fe) + " · " + (d === 1 ? "יום איחור אחד" : d + " ימי איחור") + (t.owner ? " · " + esc(t.owner) : "")); }).join("") + (late.length > 6 ? '<button class="btn sm more" data-tab="attn">לכל המשימות בעיכוב</button>' : '') : '<div class="note">אין משימות בעיכוב.</div>') + '</div></section>' +
      '<section class="card"><h2>החלטות ואישורים בשבועיים הקרובים <span class="note">(' + dec.length + ')</span></h2><div class="list">' +
      (dec.length ? dec.slice(0, 6).map(function (t) { return line(t, "יעד " + fmy(C[t.id].fe) + (t.owner ? " · " + esc(t.owner) : "")); }).join("") : '<div class="note">אין החלטות פתוחות בשבועיים הקרובים.</div>') + '</div></section></div>';
    // chapters
    h += '<section class="card"><h2>התקדמות לפי תחום</h2><div class="x-sec">' + roots.filter(function (t) { return C[t.id].leaves; }).map(function (t) {
      var c = C[t.id], pc = Math.round(c.pct * 100);
      return '<div class="xs" data-open="' + esc(t.id) + '"><span class="t" title="' + esc(t.name) + '">' + esc(t.name) + '</span><span class="meter"><i style="width:' + pc + '%;' + (c.lateN ? "background:var(--bad)" : "") + '"></i></span><b>' + pc + '%</b></div>';
    }).join("") + '</div></section>';
    return h + '</div>';
  }
  function execWeek() { return fmISO(TODAY - new Date(TODAY * 864e5).getUTCDay()); }
  function fmISO(n) { return new Date(n * 864e5).toISOString().slice(0, 10); }
  function attention() {
    var L = leaves();
    function block(title, arr, emptyTxt, dateFn) {
      var h = '<div class="card"><h2>' + title + ' <span class="note">(' + arr.length + ')</span></h2><div class="list">';
      if (!arr.length) h += '<div class="note">' + emptyTxt + '</div>';
      arr.forEach(function (t) { var st = statusOf(t); h += '<div class="li" data-open="' + esc(t.id) + '"><span class="wbs">' + esc(t.id) + '</span><span><div>' + esc(t.name) + '</div><div class="o">' + esc(t.owner || "ללא אחראי") + ' · ' + dateFn(t) + '</div></span><span class="pill ' + st[0] + '">' + st[1] + '</span></div>'; });
      return h + '</div></div>';
    }
    function byFe(a, b) { return (C[a.id].fe || 0) - (C[b.id].fe || 0); }
    var h = '<div class="grid2"><div style="display:flex;flex-direction:column;gap:16px">';
    h += block("משימות באיחור", L.filter(function (t) { return C[t.id].late; }).sort(byFe), "אין משימות באיחור.", function (t) { return "יעד " + fmy(C[t.id].fe); });
    h += block("יעד ב-7 הימים הקרובים", L.filter(function (t) { return C[t.id].soon; }).sort(byFe), "אין משימות שמסתיימות בשבוע הקרוב.", function (t) { return "יעד " + fmy(C[t.id].fe); });
    h += '</div><div style="display:flex;flex-direction:column;gap:16px">';
    h += block("ממתינות לבחירת ספק", L.filter(function (t) { return t.status === "supplier" && !C[t.id].done; }).sort(byFe), "אין משימות שממתינות לבחירת ספק.", function (t) { return "יעד " + fmy(C[t.id].fe); });
    h += block("טרם התקבל עדכון מרפרנט", L.filter(function (t) { return t.status === "noref" && !C[t.id].done; }).sort(byFe), "אין משימות שממתינות לעדכון מרפרנט.", function (t) { return "יעד " + fmy(C[t.id].fe); });
    h += block("צפי חריגה מהתוכנית", L.filter(function (t) { var c = C[t.id]; return c.slip > 0 && !c.done && !c.late; }).sort(byFe), "כל המשימות הפתוחות בתוכנית.", function (t) { var c = C[t.id]; return "תוכנית " + fm(c.be) + " · צפי " + fm(c.fe); });
    if (S.edit) {
      h += block("חסר אחראי ביצוע", L.filter(function (t) { return !t.owner && !C[t.id].done; }), "לכל המשימות הפתוחות מוגדר אחראי.", function (t) { return "יעד " + fmy(C[t.id].fe); });
      h += block("חסרים תאריכים", L.filter(function (t) { return !t.start || !t.end; }), "לכל המשימות יש תאריכים.", function () { return "יש להשלים תאריך התחלה ויעד"; });
    }
    return h + '</div></div>';
  }

  /* ---------- drawer ---------- */
  var drawerEl = null;
  function renderDrawer() {
    if (drawerEl) { drawerEl.remove(); drawerEl = null; }
    if (S.sel === "__project" && S.edit) { mountDrawer(projectDrawer()); return; }
    var t = S.sel && byId[S.sel]; if (!t) return;
    var c = C[t.id], ch = (kids[t.id] || []).length, st = statusOf(t);
    var dependents = DATA.tasks.filter(function (x) { return (x.deps || []).indexOf(t.id) >= 0; }).map(function (x) { return x.id; });
    var h = '<header><div><div class="wbs">' + esc(t.id) + '</div><h2>' + esc(t.name) + '</h2></div><button class="x" data-a="close" aria-label="סגירה">×</button></header><div class="body">';
    if (!S.edit) {
      h += '<div><span class="pill ' + st[0] + '">' + st[1] + '</span></div><dl class="kv">' +
        '<dt>אחראי ביצוע</dt><dd>' + esc(t.owner || "—") + '</dd>' +
        '<dt>תוכנית</dt><dd class="dt">' + rg(c.bs, c.be, fmy) + '</dd>' +
        '<dt>צפי / בפועל</dt><dd class="dt">' + rg(c.fs, c.fe, fmy) + (c.slip ? ' (' + (c.slip > 0 ? "+" : "") + c.slip + ' ימים)' : "") + '</dd>' +
        (ch ? '<dt>התקדמות</dt><dd>' + Math.round(c.pct * 100) + '% (' + c.doneN + ' מתוך ' + c.leaves + ' משימות)</dd>' : '') +
        ((t.deps || []).length ? '<dt>תלויה ב-</dt><dd>' + t.deps.map(linkId).join(", ") + '</dd>' : '') +
        (dependents.length ? '<dt>משימות תלויות</dt><dd>' + dependents.map(linkId).join(", ") + '</dd>' : '') +
        (t.critical ? '<dt>נתיב קריטי</dt><dd>כן, משימה קריטית לעלייה לאוויר</dd>' : '') +
        (t.notes ? '<dt>הערות</dt><dd>' + esc(t.notes) + '</dd>' : '') + '</dl>';
    } else {
      h += fld("name", "שם המשימה", '<input id="e-name" value="' + esc(t.name) + '">');
      h += '<label class="critf"><input type="checkbox" id="e-critical"' + (t.critical ? " checked" : "") + '> משימה בנתיב הקריטי לעלייה לאוויר' + (ch ? ' (כולל כל תתי-המשימות)' : '') + '</label>';
      h += fld("owner", "אחראי ביצוע", '<input id="e-owner" list="owners" value="' + esc(t.owner) + '"><datalist id="owners">' + owners().map(function (o) { return '<option value="' + esc(o) + '">'; }).join("") + '</datalist>');
      if (!ch) {
        h += '<div class="f2">' + fld("start", "התחלה (תוכנית)", dateIn('id="e-start"', t.start)) + fld("end", "יעד (תוכנית)", dateIn('id="e-end"', t.end)) + '</div>';
        h += fld("status", "סטטוס", '<select id="e-status">' + [["todo", "טרם החל"], ["doing", "בביצוע"], ["supplier", "תלוי בבחירת ספק"], ["noref", "טרם התקבל עדכון מרפרנט"], ["done", "הושלם"]].map(function (o) { return '<option value="' + o[0] + '"' + (t.status === o[0] ? " selected" : "") + '>' + o[1] + '</option>'; }).join("") + '</select>');
        if (t.status === "done") h += fld("actualEnd", "תאריך סיום בפועל", dateIn('id="e-actualEnd"', t.actualEnd));
        else h += fld("forecastEnd", "צפי סיום מעודכן (רק כשיש חריגה)", dateIn('id="e-forecastEnd"', t.forecastEnd) + '<span class="hint">משימות שתלויות בה יידחו אוטומטית לפי הצפי.</span>');
        h += fld("deps", "תלויה במשימות (WBS, מופרד בפסיקים)", '<input id="e-deps" dir="ltr" value="' + esc((t.deps || []).join(", ")) + '">' + depWarn(t));
        if (c.shift > 0) h += '<div class="warnbox">המשימה נדחתה ב-' + c.shift + ' ימים בגלל עיכוב במשימה שהיא תלויה בה.</div>';
      } else {
        h += '<dl class="kv"><dt>טווח (מחושב)</dt><dd class="dt">' + rg(c.fs, c.fe, fmy) + '</dd><dt>התקדמות</dt><dd>' + Math.round(c.pct * 100) + '% (' + c.doneN + '/' + c.leaves + ')</dd></dl><div class="hint">התאריכים והאחוז של משימת על מחושבים מתתי-המשימות.</div>';
        h += '<div class="f"><label>סטטוס לכל תתי-המשימות (' + c.leaves + ')</label>' + bulkSel(t, 'data-bulk="' + esc(t.id) + '"', "בחירת סטטוס לעדכון גורף") + '<span class="hint">הסטטוס שייבחר יוחל על כל תתי-המשימות. אחר כך אפשר לשנות כל אחת בנפרד.</span></div>';
      }
      h += fld("notes", "הערות (גלויות ללקוח)", '<textarea id="e-notes">' + esc(t.notes) + '</textarea>');
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-a="move-up">הזזה למעלה</button><button class="btn sm" data-a="move-down">הזזה למטה</button><button class="btn sm" data-a="add-after">+ משימה מתחת לזו</button><button class="btn sm" data-a="add-child">+ תת-משימה</button><button class="btn sm danger" data-a="delete">מחיקת משימה</button></div>';
    }
    h += '</div>';
    mountDrawer(h);
  }
  function mountDrawer(h) {
    drawerEl = document.createElement("aside");
    drawerEl.className = "drawer"; drawerEl.setAttribute("aria-label", "פרטים לעריכה");
    drawerEl.innerHTML = h;
    document.body.appendChild(drawerEl);
  }
  function projectDrawer() {
    var p = DATA.project;
    function pf(k, l, type) { return '<div class="f"><label for="p-' + k + '">' + l + '</label>' + (type === "date" ? dateIn('id="p-' + k + '" data-pk="' + k + '"', p[k]) : '<input id="p-' + k + '" data-pk="' + k + '" type="text" value="' + esc(p[k] || "") + '"' + (k === "goLiveTask" ? ' dir="ltr"' : '') + '>') + '</div>'; }
    var h = '<header><div><div class="wbs">הגדרות</div><h2>פרטי פרויקט ואבני דרך</h2></div><button class="x" data-a="close" aria-label="סגירה">×</button></header><div class="body">';
    h += pf("title", "שם הפרויקט") + pf("client", "לקוח") + pf("subtitle", "תת-כותרת");
    h += '<div class="f2">' + pf("goLiveDate", "מועד Go-Live מתוכנן", "date") + pf("goLiveTask", "משימת Go-Live (WBS)") + '</div>';
    h += '<div class="hint">מועד ה-Go-Live הצפוי זז אוטומטית אם משימת ה-Go-Live נדחית.</div>';
    h += '<h3 style="margin:8px 0 0;font-size:14px;color:var(--head)">אבני דרך</h3>';
    (p.milestones || []).forEach(function (m, i) {
      h += '<div class="msrow">' + dateIn('data-mi="' + i + '" data-mk="date" aria-label="תאריך אבן דרך"', m.date) + '<input data-mi="' + i + '" data-mk="label" value="' + esc(m.label) + '" aria-label="שם אבן דרך"><button class="btn sm danger" data-a="ms-del" data-i="' + i + '" aria-label="הסרת אבן דרך">הסרה</button></div>';
    });
    h += '<div><button class="btn sm" data-a="ms-add">+ אבן דרך</button></div></div>';
    return h;
  }

  /* ---------- reports ---------- */
  function period() {
    var ref = dn(S.rpDate || TODAY_S);
    if (S.rp === "weekly") { var a = ref - new Date(ref * 864e5).getUTCDay(); return { a: a, b: a + 6, n0: a + 7, n1: a + 13, label: "שבוע " + fm(a) + "\u200F–\u200F" + fmy(a + 6), next: "מתוכנן לשבוע הבא (" + rg(a + 7, a + 13) + ")" }; }
    return { a: ref, b: ref, n0: ref + 1, n1: ref + 7, label: "יום " + fmy(ref), next: "יעד ב-7 הימים הבאים (" + rg(ref + 1, ref + 7) + ")" };
  }
  function reportData() {
    var P = period(), L = leaves();
    function byFe(a, b) { return (C[a.id].fe || 0) - (C[b.id].fe || 0); }
    return {
      P: P, total: L.length, doneAll: L.filter(function (t) { return C[t.id].done; }).length,
      done: L.filter(function (t) { var v = dn(t.actualEnd); return C[t.id].done && v != null && v >= P.a && v <= P.b; }).sort(function (a, b) { return a.actualEnd < b.actualEnd ? -1 : 1; }),
      late: L.filter(function (t) { return C[t.id].late; }).sort(byFe),
      slip: L.filter(function (t) { var c = C[t.id]; return c.slip > 0 && !c.done && !c.late; }).sort(byFe),
      sup: L.filter(function (t) { return t.status === "supplier" && !C[t.id].done; }).sort(byFe),
      ref: L.filter(function (t) { return t.status === "noref" && !C[t.id].done; }).sort(byFe),
      next: L.filter(function (t) { var c = C[t.id]; return !c.done && c.fe != null && c.fe >= P.n0 && c.fe <= P.n1; }).sort(byFe)
    };
  }
  function doneNote(t) { var c = C[t.id], d = c.fe - c.be; return "הושלם " + fm(c.fe) + (c.be == null ? "" : d > 0 ? " · באיחור של " + d + " ימים" : d < 0 ? " · מוקדם ב-" + (-d) + " ימים" : " · בזמן"); }
  function lateNote(t) { var c = C[t.id]; return "יעד " + fm(c.fe) + " · " + (TODAY - c.fe) + " ימי איחור"; }
  function slipNote(t) { var c = C[t.id]; return "תוכנית " + fm(c.be) + " · צפי " + fm(c.fe) + " (+" + c.slip + ")"; }
  function dueNote(t) { return "יעד " + fm(C[t.id].fe); }
  function listBlock(title, arr, emptyTxt, fn) {
    var h = '<div class="card"><h2>' + title + ' <span class="note">(' + arr.length + ')</span></h2><div class="list">';
    if (!arr.length) h += '<div class="note">' + emptyTxt + '</div>';
    arr.forEach(function (t) { var st = statusOf(t); h += '<div class="li" data-open="' + esc(t.id) + '"><span class="wbs">' + esc(t.id) + '</span><span><div>' + esc(t.name) + '</div><div class="o">' + esc(t.owner || "ללא אחראי") + ' · ' + fn(t) + '</div></span><span class="pill ' + st[0] + '">' + st[1] + '</span></div>'; });
    return h + '</div></div>';
  }
  function report() {
    var R = reportData(), pc = R.total ? Math.round(R.doneAll / R.total * 100) : 0;
    var h = '<div class="card rp-head"><div><h2 style="margin:0">' + (S.rp === "weekly" ? "סיכום שבועי" : "עדכון יומי") + ' · ' + R.P.label + '</h2><div class="note">התקדמות כוללת ' + pc + '% · ' + R.doneAll + ' מתוך ' + R.total + ' משימות הושלמו · ' + R.late.length + ' באיחור</div></div>' +
      '<div class="tools"><div class="tabs" role="group" aria-label="סוג הדוח"><button class="tab" data-a="rp-daily" aria-selected="' + (S.rp !== "weekly") + '">יומי</button><button class="tab" data-a="rp-weekly" aria-selected="' + (S.rp === "weekly") + '">שבועי</button></div>' +
      dateIn('id="rp-date" aria-label="תאריך הדוח"', S.rpDate || TODAY_S) + '<button class="btn primary sm" data-a="rp-copy">העתקת הדוח</button></div></div>';
    h += '<div class="grid2"><div style="display:flex;flex-direction:column;gap:16px">' +
      listBlock("משימות שהושלמו", R.done, S.rp === "weekly" ? "לא הושלמו משימות בשבוע זה." : "לא הושלמו משימות ביום זה.", doneNote) +
      listBlock("משימות מתעכבות (עבר תאריך היעד)", R.late, "אין משימות באיחור.", lateNote) +
      '</div><div style="display:flex;flex-direction:column;gap:16px">' +
      listBlock("צפי חריגה מהתוכנית", R.slip, "אין משימות עם צפי חריגה.", slipNote) +
      listBlock("ממתינות לבחירת ספק", R.sup, "אין משימות שממתינות לבחירת ספק.", dueNote) +
      listBlock("טרם התקבל עדכון מרפרנט", R.ref, "אין משימות שממתינות לעדכון מרפרנט.", dueNote) +
      listBlock(R.P.next, R.next, "אין משימות בטווח זה.", dueNote) + '</div></div>';
    return h;
  }
  function reportText() {
    var R = reportData(), p = DATA.project, pc = R.total ? Math.round(R.doneAll / R.total * 100) : 0, L = [];
    L.push((S.rp === "weekly" ? "סיכום שבועי" : "עדכון יומי") + " – " + p.title);
    L.push(R.P.label);
    L.push("התקדמות כוללת: " + pc + "% (" + R.doneAll + " מתוך " + R.total + " משימות)");
    function sec(title, arr, fn) { L.push(""); L.push(title + " (" + arr.length + "):"); if (!arr.length) L.push("אין"); arr.forEach(function (t) { L.push("• " + t.id + " " + t.name + " – " + (t.owner || "ללא אחראי") + " – " + fn(t)); }); }
    sec("הושלמו", R.done, doneNote); sec("מתעכבות", R.late, lateNote); sec("צפי חריגה מהתוכנית", R.slip, slipNote); sec("ממתינות לבחירת ספק", R.sup, dueNote); sec("טרם התקבל עדכון מרפרנט", R.ref, dueNote); sec(R.P.next, R.next, dueNote);
    return L.join("\n");
  }
  function copyReport() {
    var txt = reportText();
    function fallback() {
      var m = document.createElement("div"); m.className = "modal";
      m.innerHTML = '<div class="card" role="dialog" aria-modal="true"><h2>העתקת הדוח</h2><textarea id="rp-text" style="width:100%;min-height:260px;border:1px solid var(--line);border-radius:7px;padding:8px;background:var(--bg)"></textarea><div class="row-btns"><button class="btn" data-no>סגירה</button></div></div>';
      document.body.appendChild(m); var ta = m.querySelector("textarea"); ta.value = txt; ta.focus(); ta.select();
      m.addEventListener("click", function (e) { if (e.target.closest("[data-no]") || e.target === m) m.remove(); });
    }
    try { navigator.clipboard.writeText(txt).then(function () { toast("הדוח הועתק. אפשר להדביק במייל או בהודעה."); }, fallback); } catch (e) { fallback(); }
  }
  function linkId(id) { return byId[id] ? '<a href="#" data-open="' + esc(id) + '">' + esc(id) + '</a>' : '<span style="color:var(--bad)">' + esc(id) + ' (לא קיימת)</span>'; }
  function fld(k, l, input) { return '<div class="f"><label for="e-' + k + '">' + l + '</label>' + input + '</div>'; }
  function depWarn(t) {
    var bad = (t.deps || []).filter(function (d) { return !byId[d]; });
    var cyc = (t.deps || []).filter(function (d) { return reaches(d, t.id); });
    var s = "";
    if (bad.length) s += '<span class="warnbox">לא קיימות משימות: ' + esc(bad.join(", ")) + '</span>';
    if (cyc.length) s += '<span class="warnbox">תלות מעגלית עם: ' + esc(cyc.join(", ")) + '. התלות לא תחושב.</span>';
    return s;
  }
  function reaches(from, target) {
    var seen = {}, st = [from];
    while (st.length) { var x = st.pop(); if (x === target || (x.indexOf(target + ".") === 0)) return true; if (seen[x] || !byId[x]) continue; seen[x] = 1; (byId[x].deps || []).forEach(function (d) { st.push(d); }); (kids[x] || []).forEach(function (k) { st.push(k.id); }); }
    return false;
  }

  /* ---------- editing ---------- */
  function touch() { S.dirty = JSON.stringify(DATA.tasks) !== JSON.stringify(SAVED.tasks) || JSON.stringify(DATA.project) !== JSON.stringify(SAVED.project); stashDraft(); }
  var rt = null;
  function rerenderSoon() { clearTimeout(rt); rt = setTimeout(function () { var sc = keepScroll(); var focus = document.activeElement && document.activeElement.id; render(); restoreScroll(sc); if (focus && document.getElementById(focus)) { var el = document.getElementById(focus); el.focus(); } }, 250); }
  function keepScroll() { var g = document.getElementById("gantt"); return g ? [g.scrollTop, g.scrollLeft, window.scrollY] : [0, 0, window.scrollY]; }
  function restoreScroll(s) { var g = document.getElementById("gantt"); if (g) { g.scrollTop = s[0]; g.scrollLeft = s[1]; } window.scrollTo(0, s[2]); }
  function rerender() { var sc = keepScroll(); render(); restoreScroll(sc); }
  function nextChildId(pid) {
    var n = 0; DATA.tasks.forEach(function (t) { if (parentOf(t.id) === pid) { var k = +t.id.split(".").pop(); if (k > n) n = k; } });
    return (pid ? pid + "." : "") + (n + 1);
  }
  function newTask(pid, afterId) {
    var p = pid && byId[pid], pc = p && C[pid];
    var s = pc && pc.bs != null ? ds(Math.max(pc.bs, TODAY)) : TODAY_S;
    var t = { uid: newUid(), id: nextChildId(pid), name: "משימה חדשה", notes: "", start: s, end: ds(dn(s) + 6), deps: [], owner: "", status: "todo", forecastEnd: "", actualEnd: "" };
    DATA.tasks.push(t);
    if (pid) delete S.collapsed[pid];
    if (afterId) { build(); moveTask(t.id, afterId, "after", true); } else applyTree(orderedTree());
    var nt = DATA.tasks.filter(function (x) { return x.uid === t.uid; })[0];
    S.sel = nt ? nt.id : null; touch(); rerender();
    if (nt && afterId) toast("נוספה משימה " + nt.id + ". המשימות שאחריה קיבלו מספור חדש.");
    var el = document.getElementById("e-name"); if (el) { el.focus(); el.select(); }
  }
  /* critical-path flag; marking a chapter marks everything under it */
  function setCrit(t, on) {
    DATA.tasks.forEach(function (x) { if (x.id === t.id || x.id.indexOf(t.id + ".") === 0) { if (on) x.critical = true; else delete x.critical; } });
  }
  /* one status for every subtask under a parent */
  var ST_OPTS = [["todo", "טרם החל"], ["doing", "בביצוע"], ["supplier", "תלוי בבחירת ספק"], ["noref", "טרם התקבל עדכון מרפרנט"], ["done", "הושלם"]];
  function bulkSel(t, attrs, ph) { return '<select ' + attrs + '><option value="" selected>' + esc(ph) + '</option><optgroup label="עדכון לכל תתי-המשימות">' + ST_OPTS.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join("") + '</optgroup></select>'; }
  function bulkStatus(pid, v) {
    var subs = DATA.tasks.filter(function (x) { return x.id.indexOf(pid + ".") === 0 && !(kids[x.id] || []).length; }), lbl = (ST_OPTS.filter(function (o) { return o[0] === v; })[0] || [])[1];
    var chg = subs.filter(function (x) { return x.status !== v; });
    if (!chg.length) { toast("כל תתי-המשימות כבר בסטטוס " + lbl + "."); rerender(); return; }
    confirmBox("עדכון סטטוס גורף", "לעדכן ל\"" + lbl + "\" את " + (chg.length === 1 ? "תת-המשימה שאינה בסטטוס הזה" : chg.length + " תתי-המשימות שאינן בסטטוס הזה") + " תחת " + pid + " " + byId[pid].name + "?", "עדכון", function () {
      chg.forEach(function (x) { x.status = v; if (v === "done") { x.actualEnd = x.actualEnd || TODAY_S; x.forecastEnd = ""; } else x.actualEnd = ""; });
      touch(); rerender(); toast((chg.length === 1 ? "עודכנה משימה אחת" : "עודכנו " + chg.length + " משימות") + " לסטטוס " + lbl + ".");
    });
    setTimeout(function () { var m = document.querySelector(".modal [data-no]"); if (m) m.addEventListener("click", rerender); }, 0);
  }
  function toggleDone(id) {
    var t = byId[id]; if (!t) return;
    if (t.status === "done") { t.status = "todo"; t.actualEnd = ""; } else { t.status = "done"; t.actualEnd = TODAY_S; t.forecastEnd = ""; }
    touch(); rerender();
  }
  function askDelete() {
    var t = byId[S.sel]; if (!t) return;
    var sub = DATA.tasks.filter(function (x) { return x.id.indexOf(t.id + ".") === 0; }).length;
    confirmBox("מחיקת משימה", "למחוק את " + t.id + " " + t.name + (sub ? " ואת " + sub + " תתי-המשימות שלה" : "") + "? המחיקה תיכנס לתוקף רק אחרי פרסום, וגרסאות קודמות נשמרות בהיסטוריית הדף.", "מחיקה", function () {
      var id = t.id;
      DATA.tasks = DATA.tasks.filter(function (x) { return x.id !== id && x.id.indexOf(id + ".") !== 0; });
      DATA.tasks.forEach(function (x) { x.deps = (x.deps || []).filter(function (d) { return d !== id && d.indexOf(id + ".") !== 0; }); });
      S.sel = null; applyTree(orderedTree()); touch(); rerender();
      toast("המשימה נמחקה ומספור ה-WBS עודכן בכל התוכנית.");
    });
  }
  function confirmBox(title, text, okLabel, fn) {
    var m = document.createElement("div"); m.className = "modal";
    m.innerHTML = '<div class="card" role="dialog" aria-modal="true"><h2>' + esc(title) + '</h2><div>' + esc(text) + '</div><div class="row-btns"><button class="btn primary" data-ok>' + esc(okLabel) + '</button><button class="btn" data-no>ביטול</button></div></div>';
    document.body.appendChild(m);
    m.addEventListener("click", function (e) { if (e.target.closest("[data-ok]")) { m.remove(); fn(); } else if (e.target.closest("[data-no]") || e.target === m) m.remove(); });
    m.querySelector("[data-ok]").focus();
  }
  function toast(msg, ms) { var t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, ms || 3600); }

  function diff() {
    var a = {}, b = {}, out = [], ren = 0, o2n = {};
    SAVED.tasks.forEach(function (t) { a[t.uid || t.id] = t; }); DATA.tasks.forEach(function (t) { b[t.uid || t.id] = t; });
    DATA.tasks.forEach(function (t) { var o = a[t.uid || t.id]; if (o) o2n[o.id] = t.id; });
    DATA.tasks.forEach(function (t) {
      var o = a[t.uid || t.id], n = t.id + " " + t.name;
      if (!o) { out.push("נוספה משימה: " + n); return; }
      if (o.id !== t.id) ren++;
      if (o.status !== t.status) out.push(t.status === "done" ? "הושלמה: " + n : t.status === "doing" ? "בביצוע: " + n : t.status === "supplier" ? "ממתינה לבחירת ספק: " + n : t.status === "noref" ? "טרם התקבל עדכון מרפרנט: " + n : "סטטוס עודכן: " + n);
      if (o.end !== t.end || o.start !== t.start) out.push("עודכנו תאריכי התוכנית של " + n + ": " + rg(dn(t.start), dn(t.end)));
      if (o.forecastEnd !== t.forecastEnd && t.forecastEnd) out.push("צפי סיום מעודכן ל-" + n + ": " + fm(dn(t.forecastEnd)));
      if (o.owner !== t.owner) out.push("אחראי ביצוע ל-" + n + ": " + (t.owner || "—"));
      if (o.name !== t.name) out.push("שם משימה " + t.id + " עודכן");
      if ((o.deps || []).map(function (d) { return o2n[d] || d; }).join() !== (t.deps || []).join()) out.push("עודכנו תלויות של " + n);
      if (o.notes !== t.notes) out.push("עודכנו הערות ב-" + n);
      if (!!o.critical !== !!t.critical) out.push((t.critical ? "סומנה בנתיב הקריטי: " : "הוסרה מהנתיב הקריטי: ") + n);
    });
    SAVED.tasks.forEach(function (t) { if (!b[t.uid || t.id]) out.push("הוסרה משימה: " + t.id + " " + t.name); });
    if (ren) out.unshift("עודכן סדר המשימות (" + ren + " משימות קיבלו מספר WBS חדש)");
    if (JSON.stringify(SAVED.project.milestones) !== JSON.stringify(DATA.project.milestones)) out.push("עודכנו אבני הדרך של הפרויקט");
    if (JSON.stringify(SAVED.project.exec || {}) !== JSON.stringify(DATA.project.exec || {})) out.push("עודכן הטקסט במבט הנהלה");
    ["title", "client", "subtitle", "goLiveDate"].forEach(function (k) { if (SAVED.project[k] !== DATA.project[k]) out.push(k === "goLiveDate" ? "מועד Go-Live עודכן ל-" + fmy(dn(DATA.project.goLiveDate)) : "עודכנו פרטי הפרויקט"); });
    return out;
  }

  /* ---------- reorder ---------- */
  function orderedTree() {
    build();
    function node(t) { return { t: t, ch: (kids[t.id] || []).map(node) }; }
    return roots.map(node);
  }
  function applyTree(tree) {
    var map = {}, list = [];
    (function walk(nodes, prefix) { nodes.forEach(function (n, i) { var nid = (prefix ? prefix + "." : "") + (i + 1); map[n.t.id] = nid; list.push(n.t); walk(n.ch, nid); }); })(tree, "");
    list.forEach(function (t) { t.deps = (t.deps || []).map(function (d) { return map[d] || d; }); });
    list.forEach(function (t) { t.id = map[t.id]; });
    if (DATA.project.goLiveTask && map[DATA.project.goLiveTask]) DATA.project.goLiveTask = map[DATA.project.goLiveTask];
    var nc = {}; Object.keys(S.collapsed).forEach(function (k) { if (map[k]) nc[map[k]] = 1; }); S.collapsed = nc; savePref();
    if (S.sel && map[S.sel]) S.sel = map[S.sel];
    DATA.tasks = list;
  }
  function moveTask(src, tgt, pos, quiet) {
    if (!src || !tgt || src === tgt || tgt.indexOf(src + ".") === 0) return false;
    var tree = orderedTree(), node = null;
    (function detach(nodes) { for (var i = 0; i < nodes.length; i++) { if (nodes[i].t.id === src) { node = nodes.splice(i, 1)[0]; return true; } if (detach(nodes[i].ch)) return true; } return false; })(tree);
    if (!node) return false;
    var ok = (function insert(nodes) { for (var i = 0; i < nodes.length; i++) { if (nodes[i].t.id === tgt) { if (pos === "inside") nodes[i].ch.push(node); else nodes.splice(pos === "before" ? i : i + 1, 0, node); return true; } if (insert(nodes[i].ch)) return true; } return false; })(tree);
    if (!ok) return false;
    var uid = node.t.uid;
    if (pos === "inside") delete S.collapsed[tgt];
    applyTree(tree);
    if (quiet) return true;
    touch();
    var moved = DATA.tasks.filter(function (t) { return t.uid === uid; })[0];
    rerender();
    if (moved) toast("המשימה הועברה למיקום " + moved.id + ". המספור והתלויות עודכנו.");
    return true;
  }
  function moveSibling(id, dir) {
    var p = parentOf(id), sibs = p && byId[p] ? (kids[p] || []) : roots;
    var i = sibs.map(function (t) { return t.id; }).indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= sibs.length) { toast(dir < 0 ? "המשימה כבר ראשונה ברמה שלה." : "המשימה כבר אחרונה ברמה שלה."); return; }
    moveTask(id, sibs[j].id, dir < 0 ? "before" : "after");
  }
  var DRAG = null, DROP = null, dropRow = null;
  function clearDrop() { if (dropRow) dropRow.classList.remove("drop-before", "drop-after", "drop-inside"); dropRow = null; DROP = null; }
  document.addEventListener("dragstart", function (e) {
    var h = e.target.closest && e.target.closest("[data-drag]"); if (!h || !S.edit) return;
    DRAG = h.getAttribute("data-drag");
    try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", DRAG); } catch (x) {}
    var row = h.closest(".row"); if (row) { row.classList.add("dragging"); try { e.dataTransfer.setDragImage(row, 30, 17); } catch (x) {} }
  });
  document.addEventListener("dragover", function (e) {
    if (!DRAG) return;
    var g = document.getElementById("gantt");
    if (g) { var gr = g.getBoundingClientRect(); if (e.clientY < gr.top + 60) g.scrollTop -= 14; else if (e.clientY > gr.bottom - 40) g.scrollTop += 14; }
    var row = e.target.closest && e.target.closest(".row[data-id]");
    if (!row || row.classList.contains("hdr")) { clearDrop(); return; }
    var id = row.getAttribute("data-id");
    if (id === DRAG || id.indexOf(DRAG + ".") === 0) { clearDrop(); return; }
    e.preventDefault();
    try { e.dataTransfer.dropEffect = "move"; } catch (x) {}
    var r = row.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
    var canIn = row.classList.contains("par") || row.classList.contains("l1");
    var pos = y < 0.3 ? "before" : y > 0.7 ? "after" : canIn ? "inside" : (y < 0.5 ? "before" : "after");
    if (dropRow !== row || !DROP || DROP.pos !== pos) { clearDrop(); dropRow = row; row.classList.add("drop-" + pos); DROP = { id: id, pos: pos }; }
  });
  document.addEventListener("drop", function (e) {
    if (!DRAG) return; e.preventDefault();
    var d = DROP, s = DRAG; clearDrop(); DRAG = null;
    if (d) moveTask(s, d.id, d.pos);
  });
  document.addEventListener("dragend", function () { clearDrop(); DRAG = null; var r = document.querySelector(".row.dragging"); if (r) r.classList.remove("dragging"); });
  function regenerate() {
    var json = JSON.stringify(DATA).replace(/</g, "\\u003c");
    return "<!doctype html><html><head><meta charset=utf8><meta name=viewport content=\"width=device-width,initial-scale=1,viewport-fit=cover\"><style>" + RESET + "</style></head><body>" +
      HEAD + '<style id="app-style">' + CSS + '</style><div id="app"></div><script id="pmo-data" type="application/json">' + json + "<\/script><script id=\"app-src\">" + SRC + "<\/script></body></html>";
  }
  /* ---------- local autosave of unpublished edits ---------- */
  var DKEY = "pmo-draft-v2";
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function dGet() { var s = null; try { s = localStorage.getItem(DKEY); } catch (e) {} if (!s) { try { s = sessionStorage.getItem(DKEY); } catch (e) {} } try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function dSet(o) { var s = JSON.stringify(o), ok = false; try { localStorage.setItem(DKEY, s); ok = true; } catch (e) {} try { sessionStorage.setItem(DKEY, s); ok = true; } catch (e) {} return ok; }
  function dDel() { try { localStorage.removeItem(DKEY); } catch (e) {} try { sessionStorage.removeItem(DKEY); } catch (e) {} }
  function draftObj(extra) { var o = { v: 2, at: new Date().toISOString(), base: { savedAt: SAVED.savedAt, tasks: SAVED.tasks, project: SAVED.project }, tasks: DATA.tasks, project: DATA.project }; if (extra) for (var k in extra) o[k] = extra[k]; return o; }
  function stashDraft() { if (DATA.snapshot) return; if (S.dirty) { if (dSet(draftObj())) S.localAt = new Date(); } else { dDel(); S.localAt = null; } }
  var TF = ["name", "notes", "start", "end", "owner", "status", "forecastEnd", "actualEnd", "critical"], PF = ["title", "client", "subtitle", "goLiveDate", "goLiveTask", "milestones", "exec"];
  function countChanges(d) {
    var b = {}, m = {}, n = 0;
    d.base.tasks.forEach(function (t) { b[t.uid] = t; }); d.tasks.forEach(function (t) { m[t.uid] = t; });
    d.tasks.forEach(function (t) { if (!b[t.uid] || !same(t, b[t.uid])) n++; });
    d.base.tasks.forEach(function (t) { if (!m[t.uid]) n++; });
    PF.forEach(function (f) { if (!same(d.project[f], d.base.project[f])) n++; });
    return n;
  }
  /* Apply only what this viewer changed (relative to the version they started from) on top of the newer published data. */
  function mergeDraft(d) {
    var base = {}, mine = {}, live = {}, mineId2uid = {}, structLost = false;
    d.base.tasks.forEach(function (t) { base[t.uid] = t; });
    d.tasks.forEach(function (t) { mine[t.uid] = t; mineId2uid[t.id] = t.uid; });
    DATA.tasks.forEach(function (t) { live[t.uid] = t; });
    var liveSameStruct = d.base.tasks.length === DATA.tasks.length && d.base.tasks.every(function (t) { return live[t.uid] && live[t.uid].id === t.id; });
    if (liveSameStruct) {
      DATA.tasks = d.tasks.map(function (t) {
        var r = clone(t), b = base[t.uid], l = live[t.uid];
        if (b && l) TF.concat(["deps"]).forEach(function (f) { if (!same(l[f], b[f]) && same(r[f], b[f])) r[f] = clone(l[f]); });
        return r;
      });
    } else {
      var liveUid2id = {}; DATA.tasks.forEach(function (t) { liveUid2id[t.uid] = t.id; });
      var mapDeps = function (deps) { return (deps || []).map(function (x) { var u = mineId2uid[x]; return (u && liveUid2id[u]) || x; }); };
      d.tasks.forEach(function (t) {
        var b = base[t.uid], l = live[t.uid];
        if (b && l) {
          TF.forEach(function (f) { if (t[f] !== b[f]) l[f] = t[f]; });
          if (!same(t.deps, b.deps)) l.deps = mapDeps(t.deps);
          if (t.id !== b.id) structLost = true;
        } else if (!b) {
          var pid = parentOf(t.id), pu = pid && mineId2uid[pid], lp = pu ? liveUid2id[pu] : null;
          var c = clone(t); c.id = nextChildId(lp || null); c.deps = mapDeps(t.deps);
          DATA.tasks.push(c); liveUid2id[c.uid] = c.id;
        }
      });
      var del = {}; d.base.tasks.forEach(function (t) { if (!mine[t.uid]) del[t.uid] = 1; });
      DATA.tasks = DATA.tasks.filter(function (t) { return !del[t.uid]; });
    }
    PF.forEach(function (f) { if (!same(d.project[f], d.base.project[f])) DATA.project[f] = clone(d.project[f]); });
    return structLost;
  }
  async function save() {
    if (!S.dirty || S.saving) return;
    var items = diff(), prevLog = DATA.log;
    DATA.log = [{ at: new Date().toISOString(), items: items }].concat(DATA.log || []).slice(0, 80);
    var prevSaved = DATA.savedAt; DATA.savedAt = new Date().toISOString();
    dSet(draftObj({ pending: DATA.savedAt }));
    S.saving = true; rerender();
    var art = null;
    try { art = window.claude && window.claude.use ? await window.claude.use("artifact") : null; } catch (e) {}
    if (!art) { fail("שמירה אינה זמינה בתצוגה זו."); return; }
    try { await art.publish(regenerate()); toast("השינויים פורסמו"); }
    catch (e) {
      var code = e && e.code;
      if (code === "conflict") { toast("גרסה אחרת פורסמה במקביל. הדף נטען מחדש, והשינויים שלך נשמרו כטיוטה לשחזור."); return; }
      if (code === "not_writer" || code === "not_granted" || code === "consent_required" || code === "capability_disabled") { S.canEdit = false; S.edit = false; fail("לתצוגה הזו אין הרשאת עריכה."); return; }
      if (code === "rate_limited") { fail("פורסמו שינויים רבים בזמן קצר. נסי שוב בעוד דקה."); return; }
      fail("הפרסום נכשל (" + (code || "שגיאה") + "). השינויים נשמרו בדף, אפשר לנסות שוב.");
    }
    function fail(msg) { DATA.log = prevLog; DATA.savedAt = prevSaved; S.saving = false; stashDraft(); toast(msg); rerender(); }
  }
  function restoreDraft() {
    var d = dGet(); if (!d) return;
    if (!d.v || !d.base || !d.tasks) { dDel(); return; }
    if (d.pending && d.pending === DATA.savedAt) { dDel(); return; }
    if (same(d.tasks, DATA.tasks) && same(d.project, DATA.project)) { dDel(); return; }
    var n = countChanges(d), msg;
    if (!n) { dDel(); return; }
    var cnt = n === 1 ? "שינוי אחד" : n + " שינויים";
    if (d.base.savedAt === DATA.savedAt) { DATA.tasks = clone(d.tasks); DATA.project = clone(d.project); msg = "שוחזר " + cnt + " שלא פורסם."; }
    else { var lost = mergeDraft(d); msg = "שוחזר " + cnt + " שלא פורסם, ומוזג עם העדכונים שפורסמו בינתיים." + (lost ? " שינויי סדר לא שוחזרו כי מבנה הגאנט עודכן בינתיים." : ""); }
    S.edit = true; touch(); rerender();
    toast(msg + " לחצי על פרסום כדי לשתף אותם.", 7000);
  }
  function clientCopy() {
    var copy = JSON.parse(JSON.stringify(SAVED));
    copy.tasks.forEach(function (t) { t.notes = ""; });   /* internal notes stay inside NGG */
    copy.log = [];
    copy.snapshot = { at: new Date().toISOString() };
    var json = JSON.stringify(copy).replace(/</g, "\\u003c");
    var html = "<!doctype html><html lang=\"he\" dir=\"rtl\"><head><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\"><style>" + RESET + "</style></head><body>" +
      HEAD + '<style id="app-style">' + CSS + '</style><div id="app"></div><script id="pmo-data" type="application/json">' + json + "<\/script><script id=\"app-src\">" + SRC + "<\/script></body></html>";
    S.dl.save({ filename: "גאנט PDI - גרסת לקוח " + fm(TODAY).replace(".", "-") + ".html", data: html })
      .then(function () { toast(S.dirty ? "הקובץ נשמר. הוא כולל רק שינויים שפורסמו, לא את השינויים הפתוחים." : "הקובץ נשמר. אפשר לשלוח אותו ללקוח."); })
      .catch(function (e) { if (e && e.code !== "declined") toast("ההורדה לא הושלמה (" + (e.code || "שגיאה") + ")."); });
  }
  /* ---------- Excel export / import (no external libraries) ---------- */
  var CRC_T = (function () { var t = [], c; for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zipStore(files) {
    var enc = new TextEncoder(), parts = [], cd = [], off = 0;
    files.forEach(function (f) {
      var nm = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = crc32(data), sz = data.length;
      var lh = new Uint8Array(30 + nm.length), dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(12, 0x21, true);
      dv.setUint32(14, crc, true); dv.setUint32(18, sz, true); dv.setUint32(22, sz, true); dv.setUint16(26, nm.length, true); lh.set(nm, 30);
      var ch = new Uint8Array(46 + nm.length), cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(14, 0x21, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, sz, true); cv.setUint32(24, sz, true); cv.setUint16(28, nm.length, true); cv.setUint32(42, off, true); ch.set(nm, 46);
      parts.push(lh, data); cd.push(ch); off += lh.length + sz;
    });
    var cds = cd.reduce(function (a, b) { return a + b.length; }, 0), e = new Uint8Array(22), ev = new DataView(e.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cds, true); ev.setUint32(16, off, true);
    return new Blob(parts.concat(cd, [e]), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  var XCOLS = [["id", "WBS"], ["name", "משימה"], ["notes", "הערות"], ["start", "תאריך התחלה"], ["end", "תאריך יעד"], ["deps", "תלות (WBS)"], ["owner", "גורם אחראי"], ["status", "סטטוס ביצוע"], ["forecastEnd", "צפי סיום"], ["actualEnd", "סיום בפועל"], ["critical", "נתיב קריטי"]];
  var STATUS_HE = { todo: "טרם החל", doing: "בביצוע", supplier: "תלוי בבחירת ספק", noref: "טרם התקבל עדכון מרפרנט", done: "הושלם" };
  function xe(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""); }
  function colL(i) { var s = ""; i++; while (i) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function buildXlsx() {
    build();
    var rows = '<row r="1">' + XCOLS.map(function (c, i) { return '<c r="' + colL(i) + '1" t="inlineStr" s="2"><is><t>' + xe(c[1]) + '</t></is></c>'; }).join("") + "</row>";
    DATA.tasks.forEach(function (t, ri) {
      var r = ri + 2, par = (kids[t.id] || []).length > 0;
      rows += '<row r="' + r + '">' + XCOLS.map(function (c, i) {
        var k = c[0], ref = colL(i) + r, v = t[k];
        if (k === "start" || k === "end" || k === "forecastEnd" || k === "actualEnd") return v ? '<c r="' + ref + '" s="1"><v>' + (dn(v) + 25569) + '</v></c>' : "";
        if (k === "deps") v = (v || []).join(", ");
        if (k === "status") v = STATUS_HE[v] || v;
        if (k === "critical") v = v ? "כן" : "";
        return v ? '<c r="' + ref + '" t="inlineStr" s="' + (par && k === "name" ? 3 : 0) + '"><is><t xml:space="preserve">' + xe(v) + '</t></is></c>' : "";
      }).join("") + "</row>";
    });
    var widths = [9, 60, 34, 13, 13, 14, 22, 16, 13, 13];
    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' +
      widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join("") + '</cols><sheetData>' + rows + '</sheetData><autoFilter ref="A1:' + colL(XCOLS.length - 1) + (DATA.tasks.length + 1) + '"/></worksheet>';
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd.mm.yy"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2B2F33"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    return zipStore([
      { name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: "xl/workbook.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="תוכנית עבודה" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\'תוכנית עבודה\'!$A$1:$' + colL(XCOLS.length - 1) + '$' + (DATA.tasks.length + 1) + '</definedName></definedNames></workbook>' },
      { name: "xl/_rels/workbook.xml.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: "xl/styles.xml", data: styles },
      { name: "xl/worksheets/sheet1.xml", data: sheet }
    ]);
  }
  function exportXlsx() {
    var blob; try { blob = buildXlsx(); } catch (e) { toast("הייצוא נכשל."); return; }
    S.dl.save({ filename: "גאנט PDI " + TODAY_S + ".xlsx", data: blob }).catch(function (e) {
      if (!e || e.code === "declined") return;
      if (e.code === "extension_not_enabled" || e.code === "rejected_extension") { toast("קובצי אקסל חסומים בתצוגה זו. יורד קובץ CSV במקום."); exportCsv(); return; }
      toast("הייצוא לא הושלם (" + (e.code || "שגיאה") + ").");
    });
  }

  async function unzipRead(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(buf), files = {}, e = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error("notzip");
    var n = dv.getUint16(e + 10, true), off = dv.getUint32(e + 16, true), dec = new TextDecoder();
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(off, true) !== 0x02014b50) throw new Error("notzip");
      var method = dv.getUint16(off + 10, true), csz = dv.getUint32(off + 20, true), nl = dv.getUint16(off + 28, true), xl = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
      var name = dec.decode(u8.subarray(off + 46, off + 46 + nl)), st = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      files[name] = { method: method, data: u8.subarray(st, st + csz) };
      off += 46 + nl + xl + cl;
    }
    return {
      text: async function (name) {
        var f = files[name]; if (!f) return null;
        var data = f.data;
        if (f.method === 8) { if (typeof DecompressionStream === "undefined") throw new Error("nodecomp"); data = new Uint8Array(await new Response(new Blob([f.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()); }
        else if (f.method !== 0) throw new Error("method");
        return dec.decode(data);
      }
    };
  }
  function xmlDoc(s) { return new DOMParser().parseFromString(s, "application/xml"); }
  function tags(el, name) { return Array.prototype.slice.call(el.getElementsByTagNameNS("*", name)); }
  async function readXlsxSheets(buf) {
    var z = await unzipRead(buf), wb = await z.text("xl/workbook.xml");
    if (!wb) throw new Error("notxlsx");
    var rels = xmlDoc(await z.text("xl/_rels/workbook.xml.rels") || "<r/>"), relMap = {};
    tags(rels, "Relationship").forEach(function (r) { relMap[r.getAttribute("Id")] = r.getAttribute("Target"); });
    var ssx = await z.text("xl/sharedStrings.xml"), strings = [];
    if (ssx) tags(xmlDoc(ssx), "si").forEach(function (si) { strings.push(tags(si, "t").filter(function (t) { return t.parentNode.localName !== "rPh"; }).map(function (t) { return t.textContent; }).join("")); });
    var out = [];
    for (var sh of tags(xmlDoc(wb), "sheet")) {
      var rid = sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || sh.getAttribute("r:id");
      var target = relMap[rid] || ""; target = target.charAt(0) === "/" ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
      var sx = await z.text(target); if (!sx) continue;
      var grid = [];
      tags(xmlDoc(sx), "row").forEach(function (row) {
        var rn = +row.getAttribute("r") - 1, arr = grid[rn] = [], ci = 0;
        tags(row, "c").forEach(function (c) {
          var ref = c.getAttribute("r"); if (ref) { var L = ref.replace(/\d+/g, ""), x = 0; for (var q = 0; q < L.length; q++) x = x * 26 + L.charCodeAt(q) - 64; ci = x - 1; }
          var t = c.getAttribute("t"), v = tags(c, "v")[0], val;
          if (t === "s") val = strings[+(v && v.textContent)];
          else if (t === "inlineStr") val = tags(c, "t").map(function (x) { return x.textContent; }).join("");
          else if (t === "str" || t === "e") val = v ? v.textContent : "";
          else if (t === "b") val = v && v.textContent === "1";
          else val = v ? Number(v.textContent) : "";
          arr[ci++] = val;
        });
      });
      out.push({ name: sh.getAttribute("name"), grid: grid });
    }
    return out;
  }
  var HDR = {
    id: ["wbs", "מס'", "מספר"], name: ["משימה", "שם משימה", "שם המשימה"], notes: ["הערות", "הערה"],
    start: ["תאריך התחלה", "התחלה", "התחלה (תוכנית)"], end: ["תאריך יעד", "יעד", "יעד (תוכנית)"],
    deps: ["תלות (wbs)", "תלות", "תלויות"], owner: ["גורם אחראי", "אחראי", "אחראי ביצוע", "אחראים"],
    status: ["סטטוס ביצוע", "סטטוס", "מצב"], forecastEnd: ["צפי סיום", "צפי סיום מעודכן"], actualEnd: ["סיום בפועל", "תאריך סיום בפועל"],
    critical: ["נתיב קריטי", "קריטי", "נתיב קריטי לעלייה לאוויר"]
  };
  var STATUS_IN = { "טרם החל": "todo", "לא התחיל": "todo", "בביצוע": "doing", "תלוי בבחירת ספק": "supplier", "ממתין לספק": "supplier", "טרם התקבל עדכון מרפרנט": "noref", "ממתין לרפרנט": "noref", "ממתין לעדכון מרפרנט": "noref", "הושלם": "done", "בוצע": "done" };
  function normH(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim().toLowerCase(); }
  function cellDate(v, fy) { if (v === "" || v == null) return ""; if (typeof v === "number") return v > 20000 && v < 80000 ? ds(Math.round(v) - 25569) : null; return heParse(String(v), fy); }
  function planImport(sheets) {
    var sheet = null, hr = -1, map = {};
    sheets.some(function (s) {
      for (var r = 0; r < Math.min(s.grid.length, 30); r++) {
        var row = s.grid[r] || [], m = {};
        row.forEach(function (v, i) { var h = normH(v); Object.keys(HDR).forEach(function (k) { if (m[k] == null && HDR[k].indexOf(h) >= 0) m[k] = i; }); });
        if (m.id != null && (m.name != null || m.owner != null || m.end != null)) { sheet = s; hr = r; map = m; return true; }
      }
      return false;
    });
    if (!sheet) return { error: "לא נמצאה בקובץ שורת כותרות עם עמודות WBS ומשימה." };
    var P = { updates: [], adds: [], errors: [], skipped: 0, seen: {}, cols: Object.keys(map) }, byIdNow = {};
    DATA.tasks.forEach(function (t) { byIdNow[t.id] = t; });
    for (var r = hr + 1; r < sheet.grid.length; r++) {
      var row = sheet.grid[r]; if (!row) continue;
      var raw = row[map.id], id = typeof raw === "number" ? String(raw) : String(raw == null ? "" : raw).trim();
      var line = "שורה " + (r + 1);
      if (!id) { if (row.some(function (v) { return v !== "" && v != null; })) P.skipped++; continue; }
      if (!/^\d+(\.\d+)*$/.test(id)) { P.errors.push(line + ": מספר WBS לא תקין (" + id + ")"); continue; }
      if (P.seen[id]) { P.errors.push(line + ": WBS " + id + " מופיע פעמיים בקובץ, השורה דולגה"); continue; }
      P.seen[id] = 1;
      var cur = byIdNow[id], fy = cur && cur.end ? +cur.end.slice(0, 4) : null, vals = {}, bad = false;
      Object.keys(map).forEach(function (k) {
        if (k === "id") return;
        var v = row[map[k]];
        if (v === "" || v == null) return;
        if (k === "start" || k === "end" || k === "forecastEnd" || k === "actualEnd") { var d = cellDate(v, fy); if (d === null) { P.errors.push(line + " (" + id + "): תאריך לא תקין בעמודה " + XCOLS.filter(function (c) { return c[0] === k; })[0][1]); bad = true; return; } vals[k] = d; }
        else if (k === "status") { var s = STATUS_IN[String(v).trim()]; if (!s) { P.errors.push(line + " (" + id + "): סטטוס לא מוכר \"" + v + "\""); bad = true; return; } vals[k] = s; }
        else if (k === "critical") { var cv = String(v).trim().toLowerCase(); if (/^(כן|v|x|✓|✔|true|1|yes)$/.test(cv)) vals[k] = true; else if (/^(לא|false|0|no|-)$/.test(cv)) vals[k] = undefined; else { P.errors.push(line + " (" + id + "): ערך לא מוכר בעמודת נתיב קריטי \"" + v + "\" (יש לכתוב כן או לא)"); bad = true; } }
        else if (k === "deps") vals[k] = String(v).split(/[,;\s]+/).map(function (x) { return x.trim(); }).filter(function (x) { return x && x !== id; });
        else vals[k] = String(v).trim();
      });
      if (bad) continue;
      if (cur) {
        var ch = {};
        Object.keys(vals).forEach(function (k) { if (!same(vals[k], cur[k])) ch[k] = [cur[k], vals[k]]; });
        if (Object.keys(ch).length) P.updates.push({ id: id, name: cur.name, ch: ch });
      } else P.adds.push({ id: id, vals: vals });
    }
    P.missing = DATA.tasks.filter(function (t) { return !P.seen[t.id]; }).map(function (t) { return t.id; });
    return P;
  }
  var FLD_HE = { name: "שם", notes: "הערות", start: "התחלה", end: "יעד", deps: "תלויות", owner: "אחראי", status: "סטטוס", forecastEnd: "צפי סיום", actualEnd: "סיום בפועל", critical: "נתיב קריטי" };
  function showVal(k, v) { if (v == null || v === "" || (Array.isArray(v) && !v.length)) return "—"; if (k === "status") return STATUS_HE[v] || v; if (k === "critical") return v ? "כן" : "—"; if (Array.isArray(v)) return v.join(", "); if (/start|end|End/.test(k)) return heDate(v); return String(v); }
  function importPreview(P, fileName) {
    var m = document.createElement("div"); m.className = "modal";
    var lines = [];
    P.updates.forEach(function (u) { Object.keys(u.ch).forEach(function (k) { lines.push('<li><span class="wbs">' + esc(u.id) + '</span> ' + esc(FLD_HE[k]) + ': <s>' + esc(showVal(k, u.ch[k][0])) + '</s> ← <b>' + esc(showVal(k, u.ch[k][1])) + '</b></li>'); }); });
    P.adds.forEach(function (a) { lines.push('<li><span class="wbs">' + esc(a.id) + '</span> <b>משימה חדשה:</b> ' + esc(a.vals.name || "ללא שם") + '</li>'); });
    var h = '<div class="card imp" role="dialog" aria-modal="true"><h2>ייבוא מאקסל · ' + esc(fileName) + '</h2>' +
      '<div class="imp-sum"><span><b>' + P.updates.length + '</b> משימות יתעדכנו</span><span><b>' + P.adds.length + '</b> משימות חדשות</span><span><b>' + P.errors.length + '</b> שורות עם שגיאה</span></div>';
    if (lines.length) h += '<ul class="imp-list">' + lines.slice(0, 400).join("") + (lines.length > 400 ? '<li>ועוד ' + (lines.length - 400) + ' שינויים</li>' : '') + '</ul>';
    else h += '<div class="note">לא נמצאו הבדלים בין הקובץ לגאנט.</div>';
    if (P.errors.length) h += '<h3>שורות שלא ייובאו</h3><ul class="imp-list err">' + P.errors.slice(0, 50).map(function (e) { return '<li>' + esc(e) + '</li>'; }).join("") + '</ul>';
    if (P.missing.length) h += '<label class="imp-del"><input type="checkbox" id="imp-del"> מחיקת ' + P.missing.length + ' משימות שקיימות בגאנט ולא מופיעות בקובץ</label>';
    h += '<div class="note">תאים ריקים בקובץ לא משנים את הערך הקיים. השינויים ייכנסו כטיוטה, ויתפרסמו רק אחרי לחיצה על "פרסום השינויים".</div>' +
      '<div class="row-btns"><button class="btn primary" data-ok' + (lines.length || P.missing.length ? "" : " disabled") + '>החלת השינויים</button><button class="btn" data-no>ביטול</button></div></div>';
    m.innerHTML = h; document.body.appendChild(m);
    m.addEventListener("click", function (e) {
      if (e.target.closest("[data-ok]")) { var del = m.querySelector("#imp-del"); applyImport(P, del && del.checked); m.remove(); }
      else if (e.target.closest("[data-no]") || e.target === m) m.remove();
    });
  }
  function applyImport(P, doDelete) {
    var byIdNow = {}; DATA.tasks.forEach(function (t) { byIdNow[t.id] = t; });
    P.updates.forEach(function (u) { var t = byIdNow[u.id]; if (!t) return; Object.keys(u.ch).forEach(function (k) { t[k] = clone(u.ch[k][1]); if (k === "critical" && !t.critical) delete t.critical; }); if (t.status === "done" && !t.actualEnd) t.actualEnd = t.end || TODAY_S; if (t.status !== "done" && u.ch.status) t.actualEnd = u.ch.actualEnd ? t.actualEnd : ""; });
    P.adds.forEach(function (a) {
      var t = { uid: newUid(), id: a.id, name: "משימה חדשה", notes: "", start: "", end: "", deps: [], owner: "", status: "todo", forecastEnd: "", actualEnd: "" };
      Object.keys(a.vals).forEach(function (k) { t[k] = clone(a.vals[k]); });
      if (t.status === "done" && !t.actualEnd) t.actualEnd = t.end || TODAY_S;
      DATA.tasks.push(t);
    });
    var removed = 0;
    if (doDelete && P.missing.length) {
      var del = {}; P.missing.forEach(function (id) { del[id] = 1; });
      DATA.tasks = DATA.tasks.filter(function (t) { if (del[t.id]) { removed++; return false; } return true; });
      DATA.tasks.forEach(function (t) { t.deps = (t.deps || []).filter(function (d) { return !del[d]; }); });
    }
    if (P.adds.length || removed) applyTree(orderedTree());
    S.edit = true; touch(); rerender();
    toast("הייבוא הוחל: " + P.updates.length + " עודכנו, " + P.adds.length + " נוספו" + (removed ? ", " + removed + " נמחקו" : "") + ". לבדיקה ולפרסום.", 6000);
  }
  async function importFile(file) {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { toast("יש לבחור קובץ אקסל בפורמט ‎.xlsx"); return; }
    try {
      var sheets = await readXlsxSheets(await file.arrayBuffer());
      var P = planImport(sheets);
      if (P.error) { toast(P.error, 6000); return; }
      importPreview(P, file.name);
    } catch (e) {
      toast(e && e.message === "nodecomp" ? "הדפדפן הזה לא תומך בקריאת קובצי אקסל. נסי בדפדפן Chrome או Edge מעודכן." : "לא הצלחתי לקרוא את הקובץ. ודאי שזה קובץ אקסל תקין (.xlsx).", 6000);
    }
  }

  function exportCsv() {
    var head = ["WBS", "משימה", "אחראי", "התחלה (תוכנית)", "יעד (תוכנית)", "התחלה (צפי)", "סיום (צפי/בפועל)", "סטייה (ימים)", "מצב", "תלויות", "הערות"];
    var lines = [head].concat(DATA.tasks.map(function (t) { var c = C[t.id]; return [t.id, t.name, t.owner, fmy(c.bs), fmy(c.be), fmy(c.fs), fmy(c.fe), c.slip || 0, statusOf(t)[1], (t.deps || []).join(" "), t.notes]; }));
    var csv = "﻿" + lines.map(function (r) { return r.map(function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n");
    S.dl.save({ filename: "gantt-pdi-" + TODAY_S + ".csv", data: csv }).catch(function (e) { if (e && e.code !== "declined") toast("הייצוא לא הושלם."); });
  }

  function inlineEdit(t, k, v) {
    if (k === "name") { if (!v.trim()) { rerender(); return; } t.name = v.trim(); }
    else if (k === "owner") t.owner = v.trim();
    else if (k === "start" || k === "end") { t[k] = v; if (t.start && t.end && t.end < t.start) { if (k === "start") t.end = t.start; else t.start = t.end; } }
    else if (k === "status") { t.status = v; if (v === "done") { t.actualEnd = t.actualEnd || TODAY_S; t.forecastEnd = ""; } else t.actualEnd = ""; }
    else return;
    touch();
    setTimeout(function () {
      var a = document.activeElement, fk = a && a.dataset && a.dataset.t ? [a.dataset.t, a.dataset.k] : null;
      rerender();
      if (fk) { var n = document.querySelector('.ie[data-t="' + CSS_esc(fk[0]) + '"][data-k="' + fk[1] + '"]'); if (n) n.focus(); }
    }, 0);
  }


  /* ---------- Hebrew date fields ---------- */
  document.addEventListener("change", function (e) {
    var el = e.target;
    if (el.classList && el.classList.contains("dnat")) {
      e.stopImmediatePropagation();
      var txt = el.parentNode.querySelector("[data-date]");
      if (txt) { txt.value = el.value; txt.dispatchEvent(new Event("change", { bubbles: true })); }
      return;
    }
    if (!el.dataset || !el.dataset.date) return;
    var prevIso = el.getAttribute("data-iso") || "";
    var iso = heParse(el.value, prevIso ? +prevIso.slice(0, 4) : null);
    if (iso === null) { e.stopImmediatePropagation(); toast("התאריך לא תקין. כתבי למשל 31.10.26"); el.value = heDate(prevIso); return; }
    el.value = iso;
  }, true);
  /* Own calendar popover: the browser's native picker is blocked inside the artifact frame. */
  var HE_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  var CAL = null;
  function closeCal() { if (CAL) { CAL.el.remove(); CAL = null; } }
  function openCal(input) {
    closeCal();
    var iso = input.getAttribute("data-iso") || heParse(input.value) || "", sel = dn(iso), base = sel != null ? sel : TODAY;
    var d0 = new Date(base * 864e5);
    CAL = { input: input, y: d0.getUTCFullYear(), m: d0.getUTCMonth(), sel: sel, el: document.createElement("div") };
    CAL.el.className = "cal"; CAL.el.setAttribute("role", "dialog"); CAL.el.setAttribute("aria-label", "בחירת תאריך");
    document.body.appendChild(CAL.el); drawCal(); placeCal();
  }
  function placeCal() {
    if (!CAL) return;
    var r = CAL.input.parentNode.getBoundingClientRect(), w = CAL.el.offsetWidth, h = CAL.el.offsetHeight;
    var top = r.bottom + 4; if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    var left = r.right - w; if (left < 8) left = 8; if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    CAL.el.style.top = top + "px"; CAL.el.style.left = left + "px";
  }
  function drawCal() {
    var y = CAL.y, m = CAL.m, first = Date.UTC(y, m, 1) / 864e5, dow = new Date(first * 864e5).getUTCDay(), days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    var h = '<div class="cal-h"><button type="button" class="cal-nav" data-cnav="-1" aria-label="החודש הקודם">›</button><b>' + HE_MONTHS[m] + ' ' + y + '</b><button type="button" class="cal-nav" data-cnav="1" aria-label="החודש הבא">‹</button></div><div class="cal-g">';
    ["א", "ב", "ג", "ד", "ה", "ו", "ש"].forEach(function (w) { h += '<span class="cal-w">' + w + '</span>'; });
    for (var i = 0; i < dow; i++) h += '<span></span>';
    for (var dd = 1; dd <= days; dd++) {
      var n = first + dd - 1;
      h += '<button type="button" class="cal-d' + (n === CAL.sel ? " sel" : "") + (n === TODAY ? " today" : "") + '" data-cday="' + n + '">' + dd + '</button>';
    }
    h += '</div><div class="cal-f"><button type="button" class="btn sm" data-cday="' + TODAY + '">היום</button><button type="button" class="btn sm" data-cclear="1">ניקוי</button></div>';
    CAL.el.innerHTML = h;
  }
  function pickCal(iso) {
    var input = CAL.input; closeCal();
    input.value = iso; input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-cal]");
    if (b) { e.preventDefault(); e.stopPropagation(); var inp = b.parentNode.querySelector("[data-date]"); if (CAL && CAL.input === inp) closeCal(); else openCal(inp); return; }
    if (!CAL) return;
    if (!e.target.closest(".cal")) { closeCal(); return; }
    e.stopPropagation();
    var nv = e.target.closest("[data-cnav]"), dy = e.target.closest("[data-cday]");
    if (nv) { CAL.m += +nv.getAttribute("data-cnav"); if (CAL.m < 0) { CAL.m = 11; CAL.y--; } if (CAL.m > 11) { CAL.m = 0; CAL.y++; } drawCal(); }
    else if (dy) pickCal(ds(+dy.getAttribute("data-cday")));
    else if (e.target.closest("[data-cclear]")) pickCal("");
  }, true);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && CAL) { closeCal(); e.stopPropagation(); } }, true);
  window.addEventListener("resize", closeCal);
  document.addEventListener("scroll", function (e) { if (CAL && !(e.target.closest && e.target.closest(".cal"))) closeCal(); }, true);

  /* ---------- events ---------- */
  document.addEventListener("click", function (e) {
    if (e.target.closest(".modal")) return;
    if (e.target.closest(".row .ie") || e.target.closest(".drag")) return;
    if (S.ownOpen && !e.target.closest(".msel")) { S.ownOpen = false; rerender(); }
    var el;
    if ((el = e.target.closest("[data-tw]"))) { var id = el.getAttribute("data-tw"); if (S.collapsed[id]) delete S.collapsed[id]; else S.collapsed[id] = 1; savePref(); rerender(); return; }
    if ((el = e.target.closest("[data-done]"))) { toggleDone(el.getAttribute("data-done")); return; }
    if ((el = e.target.closest("[data-crit]"))) { var ct = byId[el.getAttribute("data-crit")]; if (ct) { setCrit(ct, !ct.critical); touch(); rerender(); } return; }
    if ((el = e.target.closest("[data-tab]"))) { S.tab = el.getAttribute("data-tab"); savePref(); render(); return; }
    if ((el = e.target.closest("[data-f]"))) { S.filter = el.getAttribute("data-f"); rerender(); return; }
    if ((el = e.target.closest("[data-open]"))) { e.preventDefault(); S.sel = el.getAttribute("data-open"); if (MOB && !e.target.closest(".drawer")) { rerender(); return; }  /* on a phone keep the summary and open the task card over it */
      if (!e.target.closest(".drawer")) { S.tab = "gantt"; var p = parentOf(S.sel); while (p) { delete S.collapsed[p]; p = parentOf(p); } S.filter = "all"; S.q = ""; S.owners = []; render(); scrollToSel(); } else { rerender(); } return; }
    if ((el = e.target.closest("[data-a]"))) {
      switch (el.getAttribute("data-a")) {
        case "toggle-edit": S.edit = !S.edit; rerender(); break;
        case "close": S.sel = null; rerender(); break;
        case "save": save(); break;
        case "discard": confirmBox("ביטול שינויים", "לבטל את כל השינויים שטרם פורסמו?", "ביטול השינויים", function () { DATA = JSON.parse(JSON.stringify(SAVED)); S.dirty = false; stashDraft(); rerender(); }); break;
        case "add-root": newTask(null); break;
        case "project": S.sel = "__project"; rerender(); break;
        case "ms-add": DATA.project.milestones = (DATA.project.milestones || []).concat([{ date: TODAY_S, label: "אבן דרך חדשה" }]); touch(); rerender(); break;
        case "ms-del": DATA.project.milestones.splice(+el.getAttribute("data-i"), 1); touch(); rerender(); break;
        case "rp-daily": S.rp = "daily"; rerender(); break;
        case "rp-weekly": S.rp = "weekly"; rerender(); break;
        case "rp-copy": copyReport(); break;
        case "x-edit": S.execEdit = el.getAttribute("data-k"); rerender(); setTimeout(function () { var ta = document.getElementById("x-ta"); if (ta) ta.focus(); }, 0); break;
        case "x-cancel": S.execEdit = null; rerender(); break;
        case "x-save": case "x-auto": (function () {
          var k = el.getAttribute("data-k"), ta = document.getElementById("x-ta"), w = execWeek();
          DATA.project.exec = DATA.project.exec || {}; DATA.project.exec[w] = DATA.project.exec[w] || {};
          if (el.getAttribute("data-a") === "x-auto" || !ta || !ta.value.trim()) delete DATA.project.exec[w][k]; else DATA.project.exec[w][k] = ta.value.replace(/\s+$/, "");
          if (!Object.keys(DATA.project.exec[w]).length) delete DATA.project.exec[w];
          S.execEdit = null; touch(); rerender();
        })(); break;
        case "add-child": newTask(S.sel); break;
        case "add-after": if (S.sel && byId[S.sel]) newTask(parentOf(S.sel), S.sel); break;
        case "move-up": case "move-down": moveSibling(S.sel, el.getAttribute("data-a") === "move-up" ? -1 : 1); break;
        case "delete": askDelete(); break;
        case "expand": S.collapsed = {}; savePref(); rerender(); break;
        case "collapse": S.collapsed = {}; roots.forEach(function (t) { if ((kids[t.id] || []).length) S.collapsed[t.id] = 1; }); savePref(); rerender(); break;
        case "export": exportCsv(); break;
        case "export-xlsx": exportXlsx(); break;
        case "import": (function () { var f = document.getElementById("imp-file"); if (f) { f.value = ""; f.click(); } })(); break;
        case "client-copy": clientCopy(); break;
        case "own-toggle": S.ownOpen = !S.ownOpen; S.ownQ = ""; rerender(); if (S.ownOpen) { var oq = document.getElementById("own-q"); if (oq) oq.focus(); } break;
        case "own-clear": S.owners = []; rerender(); break;
        case "release-sup": (function () {
          var n = DATA.tasks.filter(function (t) { return t.status === "supplier"; }).length;
          confirmBox("שחרור משימות", "להעביר " + n + " משימות מ\"תלוי בבחירת ספק\" ל\"טרם החל\"? אפשר לבדוק לפני הפרסום.", "שחרור", function () {
            DATA.tasks.forEach(function (t) { if (t.status === "supplier") t.status = "todo"; }); touch(); rerender(); toast(n + " משימות שוחררו. לחצי על פרסום כדי לעדכן את כולם.");
          });
        })(); break;
      }
      return;
    }
    if ((el = e.target.closest(".row[data-id]")) && !el.classList.contains("hdr")) { S.sel = el.getAttribute("data-id"); rerender(); }
  });
  function scrollToSel() { var r = document.querySelector('.row[data-id="' + CSS_esc(S.sel) + '"]'); if (r) r.scrollIntoView({ block: "center" }); }
  function CSS_esc(s) { return window.CSS && window.CSS.escape ? window.CSS.escape(s) : s; }
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || document.querySelector(".modal")) return;
    if (S.ownOpen) { S.ownOpen = false; rerender(); return; }
    if (S.sel) { S.sel = null; rerender(); }
  });
  document.addEventListener("input", function (e) {
    var id = e.target.id;
    if (id === "q") { S.q = e.target.value; rerenderSoon(); return; }
    if (id === "own-q") { S.ownQ = e.target.value; rerenderSoon(); return; }
    var t = S.sel && byId[S.sel]; if (!t || id.indexOf("e-") !== 0) return;
    var k = id.slice(2);
    if (k === "name" || k === "owner" || k === "notes") { t[k] = e.target.value.trim() === "" && k === "name" ? t[k] : e.target.value; touch(); rerenderGanttOnly(); }
  });
  document.addEventListener("change", function (e) {
    var id = e.target.id;
    if (e.target.dataset && e.target.dataset.own != null) {
      var nm = e.target.dataset.own, i = S.owners.indexOf(nm);
      if (e.target.checked && i < 0) S.owners.push(nm); else if (!e.target.checked && i >= 0) S.owners.splice(i, 1);
      rerender(); return;
    }
    if (id === "zoom") { S.zoom = +e.target.value; savePref(); rerender(); return; }
    if (id === "imp-file") { importFile(e.target.files && e.target.files[0]); return; }
    if (id === "rp-date") { S.rpDate = e.target.value || TODAY_S; rerender(); return; }
    var ds_ = e.target.dataset || {};
    if (ds_.bulk && byId[ds_.bulk]) { if (e.target.value) bulkStatus(ds_.bulk, e.target.value); return; }
    if (ds_.t && ds_.k && byId[ds_.t]) { inlineEdit(byId[ds_.t], ds_.k, e.target.value); return; }
    if (ds_.pk) { var pv = e.target.value; if (ds_.pk === "goLiveTask") pv = pv.trim(); DATA.project[ds_.pk] = pv; touch(); rerender(); return; }
    if (ds_.mk != null && ds_.mi != null) { var ms = DATA.project.milestones[+ds_.mi]; if (ms) { ms[ds_.mk] = e.target.value; touch(); rerender(); } return; }
    var t = S.sel && byId[S.sel]; if (!t || id.indexOf("e-") !== 0) return;
    var k = id.slice(2), v = e.target.value;
    if (k === "critical") setCrit(t, e.target.checked);
    else if (k === "deps") t.deps = v.split(/[,\s;]+/).map(function (x) { return x.trim(); }).filter(function (x) { return x && x !== t.id; });
    else if (k === "status") { t.status = v; if (v === "done") { t.actualEnd = t.actualEnd || TODAY_S; t.forecastEnd = ""; } else t.actualEnd = ""; }
    else if (k === "start" || k === "end" || k === "forecastEnd" || k === "actualEnd") t[k] = v;
    else return;
    touch(); rerender();
  });
  function rerenderGanttOnly() {
    clearTimeout(rt);
    rt = setTimeout(function () {
      var sc = keepScroll(), focus = document.activeElement, fid = focus && focus.id, s0 = focus && focus.selectionStart, s1 = focus && focus.selectionEnd;
      var keep = drawerEl; drawerEl = null;
      var saved = S.sel; render();
      if (drawerEl && keep) { drawerEl.remove(); document.body.appendChild(keep); drawerEl = keep; }
      restoreScroll(sc);
      var f = fid && document.getElementById(fid); if (f) { f.focus(); try { f.setSelectionRange(s0, s1); } catch (x) {} }
      S.sel = saved;
    }, 300);
  }

  /* ---------- boot ---------- */
  build();
  render();
  (function () { var g = document.getElementById("gantt"); if (!g) return; var R = range(); var off = (TODAY - R.lo) * S.zoom / 7 - S.zoom * 2; if (off > 0) g.scrollLeft = -off; })();
  (async function () {
    var forced = !DATA.snapshot && /(^|#)edit$/.test(location.hash || "");
    var cl = window.claude;
    if (!cl || !cl.use) { if (forced) { S.canEdit = true; S.edit = true; rerender(); restoreDraft(); } return; }
    try { var u = await cl.use("user"); S.canEdit = u ? !!((await u.canEdit()) || (await u.isOwner())) : false; } catch (e) { S.canEdit = false; }
    if (forced) { S.canEdit = true; S.edit = true; }
    try { S.dl = await cl.use("downloads"); } catch (e) { S.dl = null; }
    rerender();
    if (S.canEdit) restoreDraft();
  })();
})();
