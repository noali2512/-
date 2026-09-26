(function () {
  "use strict";
  var HEAD = '<title>גאנט הקמת אתר PDI</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Hebrew:wght@400;500;600;700&display=swap">';
  var RESET = ':root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.4 system-ui,-apple-system,sans-serif;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}';
  var SRC = document.getElementById("app-src").textContent;
  var CSS = document.getElementById("app-style").textContent;
  var DATA = JSON.parse(document.getElementById("pmo-data").textContent);
  var SAVED = JSON.parse(JSON.stringify(DATA));
  var app = document.getElementById("app");

  var S = {
    tab: "gantt", edit: false, canEdit: false, dl: null, sel: null,
    q: "", owner: "", filter: "all", zoom: 84, collapsed: {}, dirty: false, saving: false
  };
  try { var pref = JSON.parse(localStorage.getItem("pmo-pref") || "{}"); if (pref.zoom) S.zoom = pref.zoom; if (pref.collapsed) S.collapsed = pref.collapsed; if (pref.tab) S.tab = pref.tab; } catch (e) {}
  function savePref() { try { localStorage.setItem("pmo-pref", JSON.stringify({ zoom: S.zoom, collapsed: S.collapsed, tab: S.tab })); } catch (e) {} }

  /* ---------- dates ---------- */
  function dn(s) { if (!s) return null; var p = s.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5; }
  function ds(n) { return new Date(n * 864e5).toISOString().slice(0, 10); }
  function fm(n) { if (n == null) return "—"; var d = new Date(n * 864e5); return pad(d.getUTCDate()) + "." + pad(d.getUTCMonth() + 1); }
  function fmy(n) { if (n == null) return "—"; var d = new Date(n * 864e5); return fm(n) + "." + String(d.getUTCFullYear()).slice(2); }
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
    if (c.late) return ["p-late", "באיחור " + (TODAY - c.fe) + " ימ׳"];
    if (c.slip > 0) return ["p-slip", "חריגה +" + c.slip];
    if (t.status === "doing") return ["p-doing", "בביצוע"];
    if (c.missing) return ["p-miss", "חסר תאריך"];
    return ["p-todo", "טרם החל"];
  }
  function barCls(t) { var c = C[t.id]; return c.done ? "done" : c.late ? "late" : c.slip > 0 ? "slip" : t.status === "doing" ? "doing" : ""; }

  /* ---------- rows / filters ---------- */
  function filtering() { return !!(S.q || S.owner || S.filter !== "all"); }
  function matches(t) {
    var c = C[t.id], q = S.q.trim();
    if (q && t.name.indexOf(q) < 0 && t.id.indexOf(q) !== 0 && (t.owner || "").indexOf(q) < 0) return false;
    if (S.owner && t.owner !== S.owner) return false;
    switch (S.filter) {
      case "late": return c.late;
      case "soon": return c.soon;
      case "slip": return c.slip > 0 && !c.done;
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
  function owners() { var m = {}; DATA.tasks.forEach(function (t) { if (t.owner) m[t.owner] = 1; }); return Object.keys(m).sort(); }

  /* ---------- render ---------- */
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
      '<div class="sub">נכון ל-' + fmy(TODAY) + ' · עדכון אחרון של התוכנית: ' + esc(fmtStamp(DATA.savedAt)) + '</div></div><div class="actions">';
    if (S.dl) h += '<button class="btn" data-a="export">ייצוא ל-CSV</button>';
    if (S.canEdit) h += '<button class="btn ' + (S.edit ? "on" : "") + '" data-a="toggle-edit" aria-pressed="' + S.edit + '">' + (S.edit ? "סיום עריכה" : "מצב עריכה") + '</button>';
    h += '</div></header>';
    if (S.edit) {
      h += '<div class="editbar"><span class="msg">' + (S.dirty ? "יש שינויים שטרם פורסמו. הלקוח יראה אותם רק אחרי פרסום." : "מצב עריכה פעיל. לחיצה על משימה פותחת את טופס העדכון.") + '</span>' +
        '<button class="btn sm" data-a="add-root">+ משימת על</button>' +
        (S.dirty ? '<button class="btn sm" data-a="discard">ביטול שינויים</button>' : '') +
        '<button class="btn primary sm" data-a="save" ' + (!S.dirty || S.saving ? "disabled" : "") + '>' + (S.saving ? "מפרסם…" : "פרסום השינויים") + '</button></div>';
    }
    h += '<section class="kpis" aria-label="תמונת מצב">' +
      kpi("התקדמות כוללת", pct + '<small>%</small>', '<div class="meter"><i style="width:' + pct + '%"></i></div>', "") +
      kpi("משימות שהושלמו", done + ' <small>מתוך ' + L.length + '</small>', "", "ok") +
      kpi("באיחור", late, "", late ? "bad" : "") +
      kpi("יעד ב-7 הימים הקרובים", soon, "", soon ? "warn" : "") +
      kpi("צפי חריגה מהתוכנית", slip, "", slip ? "warn" : "") +
      kpi("Go-Live צפוי", glDate != null ? fmy(glDate) : "—", '<span class="note">' + (gl ? (glDelta > 0 ? "דחייה של " + glDelta + " ימים" : "לפי התוכנית") : "") + '</span>', glDelta > 0 ? "bad" : "") +
      '</section>';
    h += '<div class="bar-row"><div class="tabs" role="tablist">' +
      tab("gantt", "גאנט") + tab("overview", "תמונת מצב") + tab("attn", "לטיפול" + (late ? " (" + late + ")" : "")) + '</div>';
    if (S.tab === "gantt") {
      h += '<div class="tools"><input type="search" id="q" placeholder="חיפוש משימה, WBS או אחראי" value="' + esc(S.q) + '" aria-label="חיפוש">' +
        '<select id="own" aria-label="סינון לפי אחראי"><option value="">כל האחראים</option>' + owners().map(function (o) { return '<option' + (o === S.owner ? " selected" : "") + '>' + esc(o) + '</option>'; }).join("") + '</select>' +
        '<select id="zoom" aria-label="רוחב שבוע">' + [[56, "תצוגה צפופה"], [84, "תצוגה רגילה"], [128, "תצוגה מורחבת"]].map(function (z) { return '<option value="' + z[0] + '"' + (S.zoom === z[0] ? " selected" : "") + '>' + z[1] + '</option>'; }).join("") + '</select>' +
        '<button class="btn sm" data-a="expand">פתיחת הכול</button><button class="btn sm" data-a="collapse">כיווץ לפרקים</button></div>';
    }
    h += '</div>';
    if (S.tab === "gantt") {
      h += '<div class="chips" role="group" aria-label="סינון לפי מצב">' + [["all", "הכול"], ["open", "פתוחות"], ["late", "באיחור"], ["soon", "יעד בשבוע הקרוב"], ["slip", "צפי חריגה"], ["done", "הושלמו"]].map(function (x) {
        return '<button class="chipbtn" data-f="' + x[0] + '" aria-pressed="' + (S.filter === x[0]) + '">' + x[1] + '</button>';
      }).join("") + '</div>';
      h += gantt();
      h += '<div class="legend"><span><i class="sw" style="background:var(--ok)"></i>הושלם</span><span><i class="sw" style="background:var(--bad)"></i>באיחור (עבר תאריך היעד)</span><span><i class="sw" style="background:var(--warn)"></i>צפי חריגה מהתוכנית</span><span><i class="sw" style="background:var(--accent)"></i>בביצוע</span><span><i class="sw" style="background:var(--bar)"></i>מתוכנן</span><span><i class="sw" style="background:var(--bar-base);height:3px"></i>תוכנית הבסיס (כשיש סטייה)</span><span><i class="sw" style="background:var(--today);width:2px;height:12px"></i>היום</span><span><i class="sw" style="background:var(--pink);transform:rotate(45deg);width:8px;height:8px"></i>אבן דרך</span></div>';
    } else if (S.tab === "overview") h += overview();
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
    var h = '<div class="gantt" id="gantt" style="--wk:' + wk + 'px;--tlW:' + tlW + 'px"><div class="gin">';
    h += '<div class="row hdr"><div class="info"><span></span><span>WBS</span><span>משימה</span><span class="c-own">אחראי</span><span>יעד / צפי</span><span class="c-st">מצב</span></div><div class="tl">';
    for (var w = 0; w < R.weeks; w++) {
      var a = R.lo + w * 7, cur = TODAY >= a && TODAY <= a + 6;
      h += '<div class="wk' + (cur ? " now" : "") + '" style="right:' + (w * wk) + 'px;width:' + wk + 'px">' + (wk >= 80 ? fm(a) + "–" + fm(a + 6) : fm(a)) + '</div>';
    }
    (DATA.project.milestones || []).forEach(function (m) {
      var v = dn(m.date); if (v == null) return;
      h += '<div class="ms" style="right:' + (x(v) + day / 2) + 'px" title="' + esc(m.label + " · " + fmy(v)) + '"><i></i>' + (wk >= 80 ? esc(shortLabel(m.label)) : "") + '</div>';
    });
    h += '</div></div>';
    if (!list.length) h += '<div class="empty">אין משימות שתואמות לסינון שנבחר.</div>';
    list.forEach(function (r) {
      var t = r.t, c = C[t.id], st = statusOf(t), ch = (kids[t.id] || []).length;
      var cls = "row l" + Math.min(r.lvl, 3) + (ch ? " par" : "") + (c.done ? " done" : c.late ? " late" : "") + (S.sel === t.id ? " sel" : "");
      h += '<div class="' + cls + '" data-id="' + esc(t.id) + '"><div class="info">';
      if (ch) h += '<button class="tw' + (S.collapsed[t.id] && !filtering() ? "" : " col") + '" data-tw="' + esc(t.id) + '" aria-label="פתיחה או כיווץ">' + ICON_CHEV + '</button>';
      else if (S.edit) h += '<button class="check' + (c.done ? " on" : "") + '" data-done="' + esc(t.id) + '" aria-label="סימון כהושלם" aria-pressed="' + c.done + '">' + (c.done ? '<svg width="12" height="12" viewBox="0 0 12 12"><path d="m2.5 6.2 2.4 2.3 4.6-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' : "") + '</button>';
      else h += '<span></span>';
      h += '<span class="wbs">' + esc(t.id) + '</span>';
      h += '<span class="nm" style="padding-inline-start:' + (6 + (r.lvl - 1) * 14) + 'px" title="' + esc(t.name) + '">' + esc(t.name) + '</span>';
      h += '<span class="own c-own" title="' + esc(t.owner) + '">' + (t.owner ? esc(t.owner) : (S.edit && !ch ? '<span class="pill p-miss">חסר אחראי</span>' : "")) + '</span>';
      h += '<span class="dt">' + fm(c.fe) + (c.slip && c.be != null && !c.par ? '<span class="was">' + fm(c.be) + '</span>' : "") + '</span>';
      h += '<span class="st c-st"><span class="pill ' + st[0] + '">' + st[1] + '</span></span>';
      h += '</div><div class="tl">';
      if (c.fs != null && c.fe != null) {
        var right = x(c.fs), width = Math.max((c.fe - c.fs + 1) * day, 6), tip = esc(t.id + " " + t.name + " · " + fm(c.fs) + "–" + fm(c.fe) + (c.slip ? " (תוכנית: " + fm(c.bs) + "–" + fm(c.be) + ")" : ""));
        if (ch) {
          h += '<div class="b sum' + (c.late ? " late" : "") + '" style="right:' + right + 'px;width:' + width + 'px" title="' + tip + '"><i style="width:' + Math.round(c.pct * 100) + '%"></i></div>';
          h += '<span class="pct" style="right:' + (right + width + 6) + 'px">' + Math.round(c.pct * 100) + '%</span>';
        } else {
          h += '<div class="b ' + barCls(t) + '" style="right:' + right + 'px;width:' + width + 'px" title="' + tip + '"></div>';
          if (c.late) h += '<div class="b over" style="right:' + (right + width) + 'px;width:' + ((TODAY - c.fe) * day) + 'px" title="איחור של ' + (TODAY - c.fe) + ' ימים"></div>';
          if (c.slip && c.bs != null && c.be != null) h += '<div class="b base" style="right:' + x(c.bs) + 'px;width:' + Math.max((c.be - c.bs + 1) * day, 4) + 'px" title="תוכנית הבסיס: ' + fm(c.bs) + '–' + fm(c.be) + '"></div>';
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
    var h = '<div class="grid2"><div class="card"><h2>התקדמות לפי פרק</h2>';
    roots.forEach(function (t) {
      var c = C[t.id], st = statusOf(t), pc = Math.round(c.pct * 100);
      h += '<div class="sec" data-open="' + esc(t.id) + '"><span class="wbs">' + esc(t.id) + '</span><span class="t" title="' + esc(t.name) + '">' + esc(t.name) + '</span>' +
        '<span class="m"><span class="meter"><i style="width:' + pc + '%;' + (c.late ? "background:var(--bad)" : "") + '"></i></span><b>' + pc + '%</b></span>' +
        '<span class="c4"><span class="pill ' + st[0] + '">' + (c.leaves ? c.doneN + "/" + c.leaves + (c.lateN ? " · " + c.lateN + " באיחור" : "") : "טרם פורט") + '</span></span></div>';
    });
    h += '</div><div style="display:flex;flex-direction:column;gap:16px"><div class="card"><h2>אבני דרך</h2><div class="mslist">';
    (DATA.project.milestones || []).forEach(function (m) { var v = dn(m.date); h += '<div><span class="dt">' + fm(v) + '</span><span>' + esc(m.label) + '</span>' + (v < TODAY ? '<span class="note">(עבר)</span>' : '') + '</div>'; });
    h += '</div></div><div class="card"><h2>עדכונים אחרונים</h2><div class="log">';
    (DATA.log || []).slice(0, 12).forEach(function (e) {
      var items = e.items || (e.text ? [e.text] : []);
      h += '<div><div class="d">' + esc(fmtStamp(e.at)) + '</div><ul>' + items.slice(0, 8).map(function (i) { return '<li>' + esc(i) + '</li>'; }).join("") + (items.length > 8 ? '<li>ועוד ' + (items.length - 8) + ' שינויים</li>' : '') + '</ul></div>';
    });
    if (!(DATA.log || []).length) h += '<div class="note">עדיין אין עדכונים.</div>';
    h += '</div></div></div></div>';
    return h;
  }
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
    var t = S.sel && byId[S.sel]; if (!t) return;
    var c = C[t.id], ch = (kids[t.id] || []).length, st = statusOf(t);
    var dependents = DATA.tasks.filter(function (x) { return (x.deps || []).indexOf(t.id) >= 0; }).map(function (x) { return x.id; });
    var h = '<header><div><div class="wbs">' + esc(t.id) + '</div><h2>' + esc(t.name) + '</h2></div><button class="x" data-a="close" aria-label="סגירה">×</button></header><div class="body">';
    if (!S.edit) {
      h += '<div><span class="pill ' + st[0] + '">' + st[1] + '</span></div><dl class="kv">' +
        '<dt>אחראי ביצוע</dt><dd>' + esc(t.owner || "—") + '</dd>' +
        '<dt>תוכנית</dt><dd class="dt">' + fmy(c.bs) + ' – ' + fmy(c.be) + '</dd>' +
        '<dt>צפי / בפועל</dt><dd class="dt">' + fmy(c.fs) + ' – ' + fmy(c.fe) + (c.slip ? ' (' + (c.slip > 0 ? "+" : "") + c.slip + ' ימים)' : "") + '</dd>' +
        (ch ? '<dt>התקדמות</dt><dd>' + Math.round(c.pct * 100) + '% (' + c.doneN + ' מתוך ' + c.leaves + ' משימות)</dd>' : '') +
        ((t.deps || []).length ? '<dt>תלויה ב-</dt><dd>' + t.deps.map(linkId).join(", ") + '</dd>' : '') +
        (dependents.length ? '<dt>משימות תלויות</dt><dd>' + dependents.map(linkId).join(", ") + '</dd>' : '') +
        (t.notes ? '<dt>הערות</dt><dd>' + esc(t.notes) + '</dd>' : '') + '</dl>';
    } else {
      h += fld("name", "שם המשימה", '<input id="e-name" value="' + esc(t.name) + '">');
      h += fld("owner", "אחראי ביצוע", '<input id="e-owner" list="owners" value="' + esc(t.owner) + '"><datalist id="owners">' + owners().map(function (o) { return '<option value="' + esc(o) + '">'; }).join("") + '</datalist>');
      if (!ch) {
        h += '<div class="f2">' + fld("start", "התחלה (תוכנית)", '<input type="date" id="e-start" value="' + esc(t.start) + '">') + fld("end", "יעד (תוכנית)", '<input type="date" id="e-end" value="' + esc(t.end) + '">') + '</div>';
        h += fld("status", "סטטוס", '<select id="e-status">' + [["todo", "טרם החל"], ["doing", "בביצוע"], ["done", "הושלם"]].map(function (o) { return '<option value="' + o[0] + '"' + (t.status === o[0] ? " selected" : "") + '>' + o[1] + '</option>'; }).join("") + '</select>');
        if (t.status === "done") h += fld("actualEnd", "תאריך סיום בפועל", '<input type="date" id="e-actualEnd" value="' + esc(t.actualEnd) + '">');
        else h += fld("forecastEnd", "צפי סיום מעודכן (רק כשיש חריגה)", '<input type="date" id="e-forecastEnd" value="' + esc(t.forecastEnd) + '"><span class="hint">משימות שתלויות בה יידחו אוטומטית לפי הצפי.</span>');
        h += fld("deps", "תלויה במשימות (WBS, מופרד בפסיקים)", '<input id="e-deps" dir="ltr" value="' + esc((t.deps || []).join(", ")) + '">' + depWarn(t));
        if (c.shift > 0) h += '<div class="warnbox">המשימה נדחתה ב-' + c.shift + ' ימים בגלל עיכוב במשימה שהיא תלויה בה.</div>';
      } else {
        h += '<dl class="kv"><dt>טווח (מחושב)</dt><dd class="dt">' + fmy(c.fs) + ' – ' + fmy(c.fe) + '</dd><dt>התקדמות</dt><dd>' + Math.round(c.pct * 100) + '% (' + c.doneN + '/' + c.leaves + ')</dd></dl><div class="hint">התאריכים והאחוז של משימת על מחושבים מתתי-המשימות.</div>';
      }
      h += fld("notes", "הערות (גלויות ללקוח)", '<textarea id="e-notes">' + esc(t.notes) + '</textarea>');
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-a="add-child">+ תת-משימה</button><button class="btn sm danger" data-a="delete">מחיקת משימה</button></div>';
    }
    h += '</div>';
    drawerEl = document.createElement("aside");
    drawerEl.className = "drawer"; drawerEl.setAttribute("aria-label", "פרטי משימה");
    drawerEl.innerHTML = h;
    document.body.appendChild(drawerEl);
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
  function touch() { S.dirty = JSON.stringify(DATA.tasks) !== JSON.stringify(SAVED.tasks); stashDraft(); }
  var rt = null;
  function rerenderSoon() { clearTimeout(rt); rt = setTimeout(function () { var sc = keepScroll(); var focus = document.activeElement && document.activeElement.id; render(); restoreScroll(sc); if (focus && document.getElementById(focus)) { var el = document.getElementById(focus); el.focus(); } }, 250); }
  function keepScroll() { var g = document.getElementById("gantt"); return g ? [g.scrollTop, g.scrollLeft, window.scrollY] : [0, 0, window.scrollY]; }
  function restoreScroll(s) { var g = document.getElementById("gantt"); if (g) { g.scrollTop = s[0]; g.scrollLeft = s[1]; } window.scrollTo(0, s[2]); }
  function rerender() { var sc = keepScroll(); render(); restoreScroll(sc); }
  function nextChildId(pid) {
    var n = 0; DATA.tasks.forEach(function (t) { if (parentOf(t.id) === pid) { var k = +t.id.split(".").pop(); if (k > n) n = k; } });
    return (pid ? pid + "." : "") + (n + 1);
  }
  function newTask(pid) {
    var p = pid && byId[pid], pc = p && C[pid];
    var s = pc && pc.bs != null ? ds(Math.max(pc.bs, TODAY)) : TODAY_S;
    var t = { id: nextChildId(pid), name: "משימה חדשה", notes: "", start: s, end: ds(dn(s) + 6), deps: [], owner: "", status: "todo", forecastEnd: "", actualEnd: "" };
    DATA.tasks.push(t);
    if (pid) delete S.collapsed[pid];
    S.sel = t.id; touch(); rerender();
    var el = document.getElementById("e-name"); if (el) { el.focus(); el.select(); }
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
      S.sel = null; touch(); rerender();
    });
  }
  function confirmBox(title, text, okLabel, fn) {
    var m = document.createElement("div"); m.className = "modal";
    m.innerHTML = '<div class="card" role="dialog" aria-modal="true"><h2>' + esc(title) + '</h2><div>' + esc(text) + '</div><div class="row-btns"><button class="btn primary" data-ok>' + esc(okLabel) + '</button><button class="btn" data-no>ביטול</button></div></div>';
    document.body.appendChild(m);
    m.addEventListener("click", function (e) { if (e.target.closest("[data-ok]")) { m.remove(); fn(); } else if (e.target.closest("[data-no]") || e.target === m) m.remove(); });
    m.querySelector("[data-ok]").focus();
  }
  function toast(msg) { var t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3600); }

  function diff() {
    var a = {}, b = {}, out = [];
    SAVED.tasks.forEach(function (t) { a[t.id] = t; }); DATA.tasks.forEach(function (t) { b[t.id] = t; });
    DATA.tasks.forEach(function (t) {
      var o = a[t.id], n = t.id + " " + t.name;
      if (!o) { out.push("נוספה משימה: " + n); return; }
      if (o.status !== t.status) out.push(t.status === "done" ? "הושלמה: " + n : t.status === "doing" ? "בביצוע: " + n : "סטטוס עודכן: " + n);
      if (o.end !== t.end || o.start !== t.start) out.push("עודכנו תאריכי התוכנית של " + n + ": " + fm(dn(t.start)) + "–" + fm(dn(t.end)));
      if (o.forecastEnd !== t.forecastEnd && t.forecastEnd) out.push("צפי סיום מעודכן ל-" + n + ": " + fm(dn(t.forecastEnd)));
      if (o.owner !== t.owner) out.push("אחראי ביצוע ל-" + n + ": " + (t.owner || "—"));
      if (o.name !== t.name) out.push("שם משימה " + t.id + " עודכן");
      if ((o.deps || []).join() !== (t.deps || []).join()) out.push("עודכנו תלויות של " + n);
      if (o.notes !== t.notes) out.push("עודכנו הערות ב-" + n);
    });
    SAVED.tasks.forEach(function (t) { if (!b[t.id]) out.push("הוסרה משימה: " + t.id + " " + t.name); });
    return out;
  }
  function regenerate() {
    var json = JSON.stringify(DATA).replace(/</g, "\\u003c");
    return "<!doctype html><html><head><meta charset=utf8><meta name=viewport content=\"width=device-width,initial-scale=1,viewport-fit=cover\"><style>" + RESET + "</style></head><body>" +
      HEAD + '<style id="app-style">' + CSS + '</style><div id="app"></div><script id="pmo-data" type="application/json">' + json + "<\/script><script id=\"app-src\">" + SRC + "<\/script></body></html>";
  }
  function stashDraft() { try { if (S.dirty) sessionStorage.setItem("pmo-draft", JSON.stringify({ base: SAVED.savedAt, tasks: DATA.tasks })); else sessionStorage.removeItem("pmo-draft"); } catch (e) {} }
  async function save() {
    if (!S.dirty || S.saving) return;
    var items = diff(), prevLog = DATA.log;
    DATA.log = [{ at: new Date().toISOString(), items: items }].concat(DATA.log || []).slice(0, 80);
    var prevSaved = DATA.savedAt; DATA.savedAt = new Date().toISOString();
    try { sessionStorage.setItem("pmo-draft", JSON.stringify({ base: SAVED.savedAt, tasks: DATA.tasks, pending: DATA.savedAt })); } catch (e) {}
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
    function fail(msg) { DATA.log = prevLog; DATA.savedAt = prevSaved; S.saving = false; toast(msg); rerender(); }
  }
  function restoreDraft() {
    try {
      var d = JSON.parse(sessionStorage.getItem("pmo-draft") || "null"); if (!d) return;
      if (d.pending && d.pending === DATA.savedAt) { sessionStorage.removeItem("pmo-draft"); return; }
      if (JSON.stringify(d.tasks) === JSON.stringify(DATA.tasks)) { sessionStorage.removeItem("pmo-draft"); return; }
      confirmBox("נמצאו שינויים שלא פורסמו", d.base === DATA.savedAt ? "יש שינויים מהעריכה הקודמת שלא פורסמו. לשחזר אותם?" : "יש שינויים שלא פורסמו, ובינתיים פורסמה גרסה חדשה. שחזור יחליף את רשימת המשימות בגרסת הטיוטה. לשחזר?", "שחזור", function () {
        DATA.tasks = d.tasks; S.edit = true; touch(); rerender();
      });
    } catch (e) {}
  }
  function exportCsv() {
    var head = ["WBS", "משימה", "אחראי", "התחלה (תוכנית)", "יעד (תוכנית)", "התחלה (צפי)", "סיום (צפי/בפועל)", "סטייה (ימים)", "מצב", "תלויות", "הערות"];
    var lines = [head].concat(DATA.tasks.map(function (t) { var c = C[t.id]; return [t.id, t.name, t.owner, fmy(c.bs), fmy(c.be), fmy(c.fs), fmy(c.fe), c.slip || 0, statusOf(t)[1], (t.deps || []).join(" "), t.notes]; }));
    var csv = "﻿" + lines.map(function (r) { return r.map(function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n");
    S.dl.save({ filename: "gantt-pdi-" + TODAY_S + ".csv", data: csv }).catch(function (e) { if (e && e.code !== "declined") toast("הייצוא לא הושלם."); });
  }

  /* ---------- events ---------- */
  document.addEventListener("click", function (e) {
    if (e.target.closest(".modal")) return;
    var el;
    if ((el = e.target.closest("[data-tw]"))) { var id = el.getAttribute("data-tw"); if (S.collapsed[id]) delete S.collapsed[id]; else S.collapsed[id] = 1; savePref(); rerender(); return; }
    if ((el = e.target.closest("[data-done]"))) { toggleDone(el.getAttribute("data-done")); return; }
    if ((el = e.target.closest("[data-tab]"))) { S.tab = el.getAttribute("data-tab"); savePref(); render(); return; }
    if ((el = e.target.closest("[data-f]"))) { S.filter = el.getAttribute("data-f"); rerender(); return; }
    if ((el = e.target.closest("[data-open]"))) { e.preventDefault(); S.sel = el.getAttribute("data-open"); if (!e.target.closest(".drawer")) { S.tab = "gantt"; var p = parentOf(S.sel); while (p) { delete S.collapsed[p]; p = parentOf(p); } S.filter = "all"; S.q = ""; S.owner = ""; render(); scrollToSel(); } else { rerender(); } return; }
    if ((el = e.target.closest("[data-a]"))) {
      switch (el.getAttribute("data-a")) {
        case "toggle-edit": S.edit = !S.edit; rerender(); break;
        case "close": S.sel = null; rerender(); break;
        case "save": save(); break;
        case "discard": confirmBox("ביטול שינויים", "לבטל את כל השינויים שטרם פורסמו?", "ביטול השינויים", function () { DATA = JSON.parse(JSON.stringify(SAVED)); S.dirty = false; stashDraft(); rerender(); }); break;
        case "add-root": newTask(null); break;
        case "add-child": newTask(S.sel); break;
        case "delete": askDelete(); break;
        case "expand": S.collapsed = {}; savePref(); rerender(); break;
        case "collapse": S.collapsed = {}; roots.forEach(function (t) { if ((kids[t.id] || []).length) S.collapsed[t.id] = 1; }); savePref(); rerender(); break;
        case "export": exportCsv(); break;
      }
      return;
    }
    if ((el = e.target.closest(".row[data-id]")) && !el.classList.contains("hdr")) { S.sel = el.getAttribute("data-id"); rerender(); }
  });
  function scrollToSel() { var r = document.querySelector('.row[data-id="' + CSS_esc(S.sel) + '"]'); if (r) r.scrollIntoView({ block: "center" }); }
  function CSS_esc(s) { return window.CSS && window.CSS.escape ? window.CSS.escape(s) : s; }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.sel && !document.querySelector(".modal")) { S.sel = null; rerender(); } });
  document.addEventListener("input", function (e) {
    var id = e.target.id;
    if (id === "q") { S.q = e.target.value; rerenderSoon(); return; }
    var t = S.sel && byId[S.sel]; if (!t || id.indexOf("e-") !== 0) return;
    var k = id.slice(2);
    if (k === "name" || k === "owner" || k === "notes") { t[k] = e.target.value.trim() === "" && k === "name" ? t[k] : e.target.value; touch(); rerenderGanttOnly(); }
  });
  document.addEventListener("change", function (e) {
    var id = e.target.id;
    if (id === "own") { S.owner = e.target.value; rerender(); return; }
    if (id === "zoom") { S.zoom = +e.target.value; savePref(); rerender(); return; }
    var t = S.sel && byId[S.sel]; if (!t || id.indexOf("e-") !== 0) return;
    var k = id.slice(2), v = e.target.value;
    if (k === "deps") t.deps = v.split(/[,\s;]+/).map(function (x) { return x.trim(); }).filter(function (x) { return x && x !== t.id; });
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
    var cl = window.claude; if (!cl || !cl.use) return;
    try { var u = await cl.use("user"); S.canEdit = u ? !!(await u.canEdit()) : false; } catch (e) { S.canEdit = false; }
    try { S.dl = await cl.use("downloads"); } catch (e) { S.dl = null; }
    rerender();
    if (S.canEdit) restoreDraft();
  })();
})();
