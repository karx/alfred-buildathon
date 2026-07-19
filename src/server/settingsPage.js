function createSettingsPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Alfred — Settings</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:       #0a0a0a;
      --surface:  #141414;
      --surface2: #1e1e1e;
      --surface3: #252525;
      --border:   #2a2a2a;
      --text:     #e0e0e0;
      --muted:    #666;
      --muted2:   #444;
      --green:    #22c55e;
      --yellow:   #eab308;
      --red:      #ef4444;
      --blue:     #3b82f6;
      --purple:   #a855f7;
      --indigo:   #6366f1;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      min-height: 100vh;
    }

    /* ── Nav ────────────────────────────────────────────── */
    nav {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 20px;
      height: 48px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .nav-logo { font-weight: 800; font-size: 15px; letter-spacing: -0.3px; color: var(--text); }
    .nav-sep { color: var(--muted2); }
    .nav-page { color: var(--muted); font-size: 12px; }
    .nav-links { margin-left: auto; display: flex; gap: 6px; }
    .nav-link {
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      border: 1px solid var(--border);
      color: var(--muted);
    }
    .nav-link:hover { border-color: var(--indigo); color: var(--indigo); }
    .nav-link.active { background: var(--indigo); border-color: var(--indigo); color: #fff; }
    #sse-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--muted2); margin-left: 8px; flex-shrink: 0;
    }
    #sse-dot.live { background: var(--green); box-shadow: 0 0 5px var(--green); }
    #sse-dot.err  { background: var(--red); }

    /* ── Layout ─────────────────────────────────────────── */
    .layout {
      display: grid;
      grid-template-columns: 1fr 360px;
      gap: 0;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      gap: 16px;
      align-items: start;
    }
    @media (max-width: 860px) { .layout { grid-template-columns: 1fr; } }

    /* ── Section headings ───────────────────────────────── */
    .section-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: var(--muted);
      margin-bottom: 10px;
    }

    /* ── Adapter card ───────────────────────────────────── */
    .adapter {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      margin-bottom: 10px;
      overflow: hidden;
    }
    .adapter-head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      cursor: pointer;
      user-select: none;
    }
    .adapter-head:hover { background: var(--surface2); }
    .adapter-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .adapter-dot.connected  { background: var(--green); box-shadow: 0 0 5px var(--green); }
    .adapter-dot.pending    { background: var(--yellow); box-shadow: 0 0 5px var(--yellow); }
    .adapter-dot.idle       { background: var(--muted2); }
    .adapter-name { font-weight: 700; font-size: 13px; flex: 1; }
    .adapter-desc { font-size: 11px; color: var(--muted); }
    .adapter-badges { display: flex; gap: 5px; align-items: center; margin-left: auto; }
    .badge {
      font-size: 10px; font-weight: 700; padding: 2px 7px;
      border-radius: 4px; border: 1px solid;
    }
    .badge-green  { background: rgba(34,197,94,.1);  border-color: rgba(34,197,94,.3);  color: var(--green); }
    .badge-yellow { background: rgba(234,179,8,.1);  border-color: rgba(234,179,8,.3);  color: var(--yellow); }
    .badge-red    { background: rgba(239,68,68,.1);  border-color: rgba(239,68,68,.3);  color: var(--red); }
    .badge-muted  { background: var(--surface2); border-color: var(--border); color: var(--muted); }
    .badge-blue   { background: rgba(59,130,246,.1); border-color: rgba(59,130,246,.3); color: var(--blue); }
    .badge-purple { background: rgba(168,85,247,.1); border-color: rgba(168,85,247,.3); color: var(--purple); }

    .chevron { color: var(--muted); font-size: 11px; transition: transform .2s; }
    .adapter.open .chevron { transform: rotate(90deg); }

    .adapter-body { display: none; padding: 0 14px 14px; border-top: 1px solid var(--border); }
    .adapter.open .adapter-body { display: block; }

    /* ── Form elements ──────────────────────────────────── */
    label { display: block; font-size: 11px; font-weight: 600; color: var(--muted); margin-bottom: 4px; margin-top: 10px; }
    input[type=text], textarea {
      width: 100%;
      background: var(--surface3);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 10px;
      color: var(--text);
      font: inherit;
      font-size: 12px;
      outline: none;
    }
    input[type=text]:focus, textarea:focus { border-color: var(--indigo); }
    textarea { min-height: 100px; font-family: "SF Mono","Fira Code",monospace; resize: vertical; }

    /* ── Buttons ────────────────────────────────────────── */
    .btn-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    button {
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--border);
      background: var(--surface2);
      color: var(--muted);
      transition: all .15s;
    }
    button:hover { border-color: var(--indigo); color: var(--indigo); }
    button:disabled { opacity: .4; cursor: not-allowed; }
    button.btn-primary { background: var(--indigo); border-color: var(--indigo); color: #fff; }
    button.btn-primary:hover { background: #4f46e5; border-color: #4f46e5; }
    button.btn-danger  { border-color: rgba(239,68,68,.4); color: var(--red); }
    button.btn-danger:hover { background: rgba(239,68,68,.1); }
    button.btn-success { border-color: rgba(34,197,94,.4); color: var(--green); }
    button.btn-success:hover { background: rgba(34,197,94,.1); }

    /* ── Status box ─────────────────────────────────────── */
    .status-box {
      margin-top: 10px;
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 12px;
      background: var(--surface3);
      border: 1px solid var(--border);
      color: var(--muted);
      white-space: pre-wrap;
      font-family: "SF Mono","Fira Code",monospace;
      min-height: 32px;
      display: none;
    }
    .status-box.show { display: block; }
    .status-box.ok  { border-color: rgba(34,197,94,.3); color: var(--green); }
    .status-box.err { border-color: rgba(239,68,68,.3); color: var(--red); }
    .status-box.info { border-color: rgba(234,179,8,.3); color: var(--yellow); }

    /* ── Template chips ─────────────────────────────────── */
    .chip-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .chip {
      padding: 4px 10px;
      border-radius: 5px;
      font-size: 11px;
      font-weight: 600;
      border: 1px solid var(--border);
      background: var(--surface3);
      color: var(--muted);
      cursor: pointer;
    }
    .chip:hover { border-color: var(--indigo); color: var(--indigo); }
    .chip.send { border-color: rgba(34,197,94,.3); color: var(--green); }
    .chip.send:hover { background: rgba(34,197,94,.1); }

    /* ── Right panel ────────────────────────────────────── */
    .right-col { display: grid; gap: 12px; }
    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
    }

    /* Alfred state summary */
    .state-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
    .state-cell {
      background: var(--surface2);
      border-radius: 6px;
      padding: 8px 10px;
      text-align: center;
    }
    .state-num { font-size: 22px; font-weight: 800; }
    .state-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .8px; margin-top: 2px; }
    .state-num.green  { color: var(--green); }
    .state-num.yellow { color: var(--yellow); }
    .state-num.red    { color: var(--red); }

    #proc-status-line { margin-top: 8px; font-size: 12px; color: var(--muted); }
    #proc-log-line { font-size: 11px; color: var(--muted2); font-family: monospace; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* Events feed */
    .event-feed { max-height: 400px; overflow-y: auto; margin-top: 8px; }
    .event-row {
      padding: 6px 8px;
      border-radius: 6px;
      margin-bottom: 4px;
      background: var(--surface2);
      border-left: 3px solid var(--border);
    }
    .event-row.vault     { border-left-color: var(--green); }
    .event-row.granola   { border-left-color: var(--purple); }
    .event-row.arduino-in{ border-left-color: var(--yellow); }
    .event-row.discord   { border-left-color: var(--blue); }
    .event-row.alfred    { border-left-color: var(--indigo); }
    .event-type { font-size: 11px; font-weight: 700; }
    .event-meta { font-size: 10px; color: var(--muted); margin-top: 1px; }
    .event-payload { font-size: 10px; font-family: monospace; color: var(--muted2); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .no-events { color: var(--muted2); font-size: 12px; text-align: center; padding: 20px 0; }

    /* Granola OAuth notice */
    .oauth-notice {
      margin-top: 10px;
      padding: 10px 12px;
      background: rgba(234,179,8,.07);
      border: 1px solid rgba(234,179,8,.25);
      border-radius: 6px;
      font-size: 12px;
      color: var(--yellow);
      line-height: 1.6;
    }
    .oauth-notice strong { display: block; margin-bottom: 3px; }

    /* Divider */
    hr { border: none; border-top: 1px solid var(--border); margin: 10px 0; }
  </style>
</head>
<body>

<nav>
  <span class="nav-logo">Alfred</span>
  <span class="nav-sep">/</span>
  <span class="nav-page">Settings</span>
  <div id="sse-dot" title="SSE connection"></div>
  <div class="nav-links">
    <a href="/settings" class="nav-link active">Settings</a>
    <a href="/demo" class="nav-link">Demo</a>
    <a href="/live" class="nav-link">Live Dashboard</a>
  </div>
</nav>

<div class="layout">
  <!-- Left: Adapters + Skills -->
  <div>
    <div class="section-title">Input Adapters</div>
    <div id="adapters-list">Loading...</div>

    <div class="section-title" style="margin-top:24px">Skills</div>
    <div id="skills-list">Loading...</div>
  </div>

  <!-- Right: Status + Events -->
  <div class="right-col">

    <!-- Alfred State -->
    <div class="panel">
      <div class="section-title">Alfred State</div>
      <div class="state-grid">
        <div class="state-cell">
          <div class="state-num green" id="st-todos">0</div>
          <div class="state-label">TODOs</div>
        </div>
        <div class="state-cell">
          <div class="state-num red" id="st-nudges">0</div>
          <div class="state-label">Nudges</div>
        </div>
        <div class="state-cell">
          <div class="state-num yellow" id="st-inbox">0</div>
          <div class="state-label">Inbox</div>
        </div>
        <div class="state-cell">
          <div class="state-num" id="st-meetings">0</div>
          <div class="state-label">Seen Meetings</div>
        </div>
      </div>
      <div id="proc-status-line">Processing: idle</div>
      <div id="proc-log-line"></div>
      <div class="btn-row">
        <button onclick="pollGranola()">Poll Granola Now</button>
        <a href="/demo" style="text-decoration:none"><button>Demo Backstage</button></a>
        <a href="/live" style="text-decoration:none"><button>Open Live Dashboard</button></a>
      </div>
    </div>

    <!-- Demo nudge fabricator (full controls on /demo) -->
    <div class="panel">
      <div class="section-title">Demo Nudges</div>
      <p style="color:var(--muted);font-size:11px;margin-bottom:10px;">
        Quick fabricate for hardware. Full stage packs (todos + brief + modes) live on
        <a href="/demo" style="color:var(--indigo);">/demo</a> backstage.
      </p>
      <div class="btn-row" style="flex-wrap:wrap;gap:6px;">
        <button onclick="loadFullDemo()">Full Working Demo</button>
        <button onclick="fabricateNudge('buzzer', true)">Buzz Demo</button>
        <button onclick="fabricateNudge('critical', true)">Critical</button>
        <button onclick="fabricateNudge('buildathon', true)">Buildathon Pack</button>
        <button onclick="clearDemoNudges()" style="border-color:var(--red);color:var(--red);">Clear Demo</button>
      </div>
      <div class="btn-row" style="margin-top:8px;gap:6px;align-items:center;">
        <input id="custom-nudge-text" type="text" maxlength="40" placeholder="Custom nudge (max 40 chars)"
          style="flex:1;min-width:0;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:12px;" />
        <button onclick="fabricateCustomNudge()">Create</button>
      </div>
      <div id="demo-nudge-status" class="status-box" style="margin-top:8px;"></div>
    </div>

    <!-- Events Feed -->
    <div class="panel">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div class="section-title" style="margin:0">Live Events</div>
        <button onclick="clearEvents()" style="padding:3px 8px;font-size:10px;">Clear</button>
      </div>
      <div class="event-feed" id="event-feed">
        <div class="no-events">No events yet</div>
      </div>
    </div>

  </div>
</div>

<script>
'use strict';

// ── State ──────────────────────────────────────────────────────────
var adapters = [];
var events = [];
var alfredState = {};

// ── Utilities ──────────────────────────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function fmt(obj) {
  if (typeof obj === 'string') return obj;
  return JSON.stringify(obj, null, 2);
}

function show(el, msg, cls) {
  el.textContent = typeof msg === 'string' ? msg : fmt(msg);
  el.className = 'status-box show' + (cls ? ' ' + cls : '');
}

function adapterById(id) {
  return adapters.find(function(a) { return a.id === id; });
}

async function post(url, body) {
  var res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  var j = await res.json();
  if (!res.ok && !j.pending) throw new Error(j.message || 'Request failed');
  return j;
}

// ── Alfred state panel ─────────────────────────────────────────────
async function loadAlfredState() {
  try {
    var r = await fetch('/api/alfred/state');
    var j = await r.json();
    alfredState = j.state || {};
    var todos   = (alfredState.todos || []).filter(function(t){ return t.status !== 'done'; });
    var nudges  = (alfredState.nudges || []).filter(function(n){ return !n.acked; });
    var inbox   = (alfredState.inbox || []).length;
    var seen    = (alfredState.seenMeetingIds || []).length;
    document.getElementById('st-todos').textContent   = todos.length;
    document.getElementById('st-nudges').textContent  = nudges.length;
    document.getElementById('st-inbox').textContent   = inbox;
    document.getElementById('st-meetings').textContent = seen;
    var isProc = alfredState.processingStatus === 'processing';
    document.getElementById('proc-status-line').textContent = 'Processing: ' + (isProc ? 'running...' : 'idle');
    document.getElementById('proc-log-line').textContent = alfredState.processingLog || '';
  } catch(e) {}
}

async function pollGranola() {
  try {
    await post('/api/adapters/granola/actions/poll-now', {});
    setTimeout(loadAlfredState, 2000);
  } catch(e) {}
}

async function loadFullDemo() {
  var el = document.getElementById('demo-nudge-status');
  try {
    var j = await post('/api/alfred/demo/stage', { pack: 'full' });
    show(el, j.message || 'Full demo loaded', 'ok');
    loadAlfredState();
  } catch(e) {
    show(el, e.message || String(e), 'err');
  }
}

async function fabricateNudge(scenario, replace) {
  var el = document.getElementById('demo-nudge-status');
  try {
    var j = await post('/api/alfred/nudge/fabricate', { scenario: scenario, replace: !!replace });
    show(el, j.message + ' → ' + (j.statePreview && j.statePreview.nudgeText ? j.statePreview.nudgeText : ''), 'ok');
    loadAlfredState();
  } catch(e) {
    show(el, e.message || String(e), 'err');
  }
}

async function fabricateCustomNudge() {
  var el = document.getElementById('demo-nudge-status');
  var text = (document.getElementById('custom-nudge-text').value || '').trim();
  if (!text) { show(el, 'Enter custom nudge text', 'err'); return; }
  try {
    var j = await post('/api/alfred/nudge/fabricate', { text: text, priority: 'high', replace: false });
    show(el, j.message + ' → ' + text, 'ok');
    document.getElementById('custom-nudge-text').value = '';
    loadAlfredState();
  } catch(e) {
    show(el, e.message || String(e), 'err');
  }
}

async function clearDemoNudges() {
  var el = document.getElementById('demo-nudge-status');
  try {
    var j = await post('/api/alfred/nudge/clear-demo', {});
    show(el, j.message || 'Cleared', 'ok');
    loadAlfredState();
  } catch(e) {
    show(el, e.message || String(e), 'err');
  }
}

// ── Events feed ────────────────────────────────────────────────────
function sourceClass(s) {
  if (!s) return '';
  if (s.startsWith('alfred')) return 'alfred';
  return s;
}

function renderEvents() {
  var feed = document.getElementById('event-feed');
  if (!events.length) {
    feed.innerHTML = '<div class="no-events">No events yet</div>';
    return;
  }
  feed.innerHTML = events.slice().reverse().slice(0, 40).map(function(item) {
    var ev = item.event || item;
    var source = ev.source || (item.channel || '').split('.')[0];
    var type = ev.type || item.channel || 'event';
    var ts = new Date(ev.timestamp || item.timestamp || '').toLocaleTimeString();
    var payloadStr = ev.payload ? JSON.stringify(ev.payload).slice(0, 80) : '';
    return '<div class="event-row ' + esc(sourceClass(source)) + '">' +
      '<div class="event-type">' + esc(source) + ' / ' + esc(type) + '</div>' +
      '<div class="event-meta">' + esc(ts) + '</div>' +
      (payloadStr ? '<div class="event-payload">' + esc(payloadStr) + '</div>' : '') +
    '</div>';
  }).join('');
}

function clearEvents() {
  events = [];
  renderEvents();
}

function pushEvent(item) {
  events.push(item);
  if (events.length > 100) events.shift();
  renderEvents();
}

// ── SSE ────────────────────────────────────────────────────────────
function connectSSE() {
  var dot = document.getElementById('sse-dot');
  var es = new EventSource('/events');
  es.onopen = function() { dot.className = 'live'; };
  es.onerror = function() {
    dot.className = 'err';
    es.close();
    setTimeout(connectSSE, 3000);
  };
  es.onmessage = function(e) {
    try {
      var data = JSON.parse(e.data);
      if (data.channel === 'sse.connected') return;
      pushEvent(data);
      if (data.channel === 'alfred.processing.done' || data.channel === 'alfred.state.updated') {
        loadAlfredState();
      }
    } catch(_) {}
  };
}

// ── Adapter rendering ──────────────────────────────────────────────
function dotClass(adapter) {
  if (adapter._pending) return 'pending';
  if (adapter.connected) return 'connected';
  return 'idle';
}

function connBadge(adapter) {
  if (adapter._pending) return '<span class="badge badge-yellow">OAuth pending</span>';
  if (adapter.connected) return '<span class="badge badge-green">connected</span>';
  return '<span class="badge badge-muted">not connected</span>';
}

function runtimeBadge(adapter) {
  if (!adapter.runtime) return '';
  return adapter.runtime.started
    ? '<span class="badge badge-blue">running</span>'
    : '<span class="badge badge-muted">stopped</span>';
}

function renderAdapters() {
  var root = document.getElementById('adapters-list');
  if (!adapters.length) { root.textContent = 'No adapters.'; return; }

  root.innerHTML = adapters.map(function(a) {
    return makeAdapterCard(a);
  }).join('');

  // Attach events after innerHTML
  adapters.forEach(function(a) {
    attachAdapterEvents(a.id);
  });
}

function makeAdapterCard(a) {
  var isOpen = !a.connected || a.id === 'vault';
  return '<div class="adapter' + (isOpen ? ' open' : '') + '" id="card-' + a.id + '">' +
    '<div class="adapter-head" onclick="toggleCard(\\'' + a.id + '\\')">' +
      '<div class="adapter-dot ' + dotClass(a) + '"></div>' +
      '<div>' +
        '<div class="adapter-name">' + esc(a.label) + '</div>' +
        '<div class="adapter-desc">' + esc(a.description) + '</div>' +
      '</div>' +
      '<div class="adapter-badges">' + connBadge(a) + runtimeBadge(a) + '</div>' +
      '<span class="chevron">&#9654;</span>' +
    '</div>' +
    '<div class="adapter-body">' + makeAdapterBody(a) + '</div>' +
  '</div>';
}

function makeAdapterBody(a) {
  var html = '';

  // Granola: special OAuth notice
  if (a.id === 'granola') {
    if (a._pending) {
      html += '<div class="oauth-notice"><strong>Awaiting browser authorization</strong>' +
        'Complete the Granola OAuth flow, then click "Refresh" below to confirm connection.' +
        (a._authUrl
          ? '<div style="margin-top:8px"><a href="' + esc(a._authUrl) + '" target="_blank" rel="noopener" style="color:var(--indigo)">Open Granola authorization →</a></div>'
          : '') +
        '</div>';
    } else if (!a.connected) {
      html += '<div class="oauth-notice"><strong>Browser OAuth required</strong>' +
        'Clicking Connect will open a browser tab for Granola authorization. ' +
        'Return here and click Refresh after approving.</div>';
    }
  }

  // Vault: path input
  if (a.id === 'vault') {
    var vaultPath = (a.config && a.config.vaultPath) || '';
    html += '<label>Vault path</label>' +
      '<input type="text" id="vault-path-' + a.id + '" value="' + esc(vaultPath) + '" ' +
      'placeholder="/Users/you/AlfredVault" ' +
      'onchange="syncVaultPath()">';
  }

  // Config JSON
  html += '<label>Config JSON</label>';
  var configVal = JSON.stringify(a.config || a.configExample || {}, null, 2);
  html += '<textarea id="cfg-' + a.id + '" spellcheck="false">' + esc(configVal) + '</textarea>';

  // Core action buttons
  html += '<div class="btn-row">';
  if (!a.connected || a._pending) {
    html += '<button class="btn-success" onclick="adapterConnect(\\'' + a.id + '\\')">Connect</button>';
    html += '<button onclick="adapterTest(\\'' + a.id + '\\')">Test</button>';
  } else {
    html += '<button class="btn-danger" onclick="adapterDisconnect(\\'' + a.id + '\\')">Disconnect</button>';
    html += '<button onclick="adapterTest(\\'' + a.id + '\\')">Test</button>';
  }
  html += '<button onclick="loadAdapters()">Refresh</button>';
  html += '</div>';

  // Adapter-specific actions (e.g. Initialize PARA, Poll Now)
  if (a.actions && a.actions.length) {
    html += '<hr>';
    html += '<div class="section-title" style="margin-top:0">Actions</div>';
    html += '<div class="btn-row">';
    a.actions.forEach(function(action) {
      html += '<button title="' + esc(action.description) + '" onclick="adapterAction(\\'' + a.id + '\\',\\'' + action.id + '\\')">' + esc(action.label) + '</button>';
    });
    html += '</div>';
  }

  // Arduino: event template send buttons
  if (a.id === 'arduino-in' && a.eventTemplates && a.eventTemplates.length) {
    html += '<hr>';
    html += '<div class="section-title" style="margin-top:0">Send Template Event</div>';
    html += '<div class="chip-row">';
    a.eventTemplates.forEach(function(t) {
      html += '<span class="chip send" onclick="sendTemplate(\\'' + a.id + '\\',\\'' + t.id + '\\')" title="' + esc(t.description) + '">' + esc(t.label) + '</span>';
    });
    html += '</div>';
  }

  // Status output
  html += '<div class="status-box" id="status-' + a.id + '"></div>';

  return html;
}

function attachAdapterEvents(id) {
  var pathEl = document.getElementById('vault-path-' + id);
  if (pathEl) {
    pathEl.addEventListener('input', function() {
      syncVaultPath(id);
    });
  }
}

function syncVaultPath(id) {
  id = id || 'vault';
  var pathEl = document.getElementById('vault-path-' + id);
  var cfgEl  = document.getElementById('cfg-' + id);
  if (!pathEl || !cfgEl) return;
  try {
    var cfg = JSON.parse(cfgEl.value || '{}');
    cfg.vaultPath = pathEl.value;
    if (cfg.createIfMissing === undefined) cfg.createIfMissing = true;
    cfgEl.value = JSON.stringify(cfg, null, 2);
  } catch(_) {}
}

function toggleCard(id) {
  var card = document.getElementById('card-' + id);
  if (card) card.classList.toggle('open');
}

function getConfig(id) {
  var cfgEl = document.getElementById('cfg-' + id);
  if (!cfgEl || !cfgEl.value.trim()) return {};
  try { return JSON.parse(cfgEl.value); }
  catch(e) {
    var st = document.getElementById('status-' + id);
    if (st) show(st, 'Invalid JSON: ' + e.message, 'err');
    throw e;
  }
}

// ── Adapter actions ────────────────────────────────────────────────
async function adapterTest(id) {
  var st = document.getElementById('status-' + id);
  show(st, 'Testing...', null);
  try {
    var cfg = getConfig(id);
    var r = await post('/api/adapters/' + id + '/test', { config: cfg });
    show(st, r, r.ok ? 'ok' : 'err');
  } catch(e) { show(st, e.message, 'err'); }
}

async function adapterConnect(id) {
  var st = document.getElementById('status-' + id);
  if (id === 'granola') {
    show(st, 'Preparing Granola OAuth (this can take a few seconds)...', 'info');
  } else {
    show(st, 'Connecting...', null);
  }
  try {
    var cfg = getConfig(id);
    var r = await post('/api/adapters/' + id + '/connect', { config: cfg });
    if (r.pending) {
      var msg = r.message || 'Authorization pending';
      if (r.authUrl) {
        msg += ' — if no tab opened: ' + r.authUrl;
        // Best-effort client open (may be popup-blocked after await; link is the fallback)
        try { window.open(r.authUrl, '_blank', 'noopener'); } catch (e) {}
      }
      show(st, msg, 'info');
      var a = adapterById(id);
      if (a) {
        a._pending = true;
        a._authUrl = r.authUrl || null;
      }
      refreshCard(id);
    } else {
      show(st, r, r.ok ? 'ok' : 'err');
      await loadAdapters();
    }
  } catch(e) { show(st, e.message, 'err'); }
}

async function adapterDisconnect(id) {
  var st = document.getElementById('status-' + id);
  show(st, 'Disconnecting...', null);
  try {
    var r = await post('/api/adapters/' + id + '/disconnect', {});
    show(st, r, r.ok ? 'ok' : 'err');
    await loadAdapters();
  } catch(e) { show(st, e.message, 'err'); }
}

async function adapterAction(id, actionId) {
  var st = document.getElementById('status-' + id);
  show(st, 'Running ' + actionId + '...', null);
  try {
    var cfg = getConfig(id);
    var r = await post('/api/adapters/' + id + '/actions/' + actionId, { config: cfg });
    show(st, r, r.ok ? 'ok' : 'err');
    if (actionId === 'poll-now') setTimeout(loadAlfredState, 1500);
  } catch(e) { show(st, e.message, 'err'); }
}

async function sendTemplate(id, templateId) {
  var st = document.getElementById('status-' + id);
  var a = adapterById(id);
  var template = a && a.eventTemplates && a.eventTemplates.find(function(t){ return t.id === templateId; });
  if (!template) return;
  show(st, 'Sending ' + template.label + '...', null);
  try {
    var cfg = getConfig(id);
    var payload = Object.assign({ deviceId: cfg.deviceId }, template.payload);
    var headers = { 'Content-Type': 'application/json' };
    if (cfg.sharedSecret) headers['x-alfred-secret'] = cfg.sharedSecret;
    var res = await fetch('/api/adapters/' + id + '/ingest', {
      method: 'POST', headers: headers, body: JSON.stringify(payload)
    });
    var r = await res.json();
    show(st, r, r.ok ? 'ok' : 'err');
  } catch(e) { show(st, e.message, 'err'); }
}

function refreshCard(id) {
  var a = adapterById(id);
  if (!a) return;
  var card = document.getElementById('card-' + id);
  if (!card) return;
  var wasOpen = card.classList.contains('open');
  var statusMsg = document.getElementById('status-' + id) && document.getElementById('status-' + id).textContent;
  card.outerHTML = makeAdapterCard(a);
  var newCard = document.getElementById('card-' + id);
  if (newCard && wasOpen) newCard.classList.add('open');
  attachAdapterEvents(id);
  // Restore status message if there was one
  var st = document.getElementById('status-' + id);
  if (st && statusMsg) { show(st, statusMsg, 'info'); }
}

// ── Load adapters ──────────────────────────────────────────────────
async function loadAdapters() {
  try {
    var r = await fetch('/api/adapters');
    var j = await r.json();
    adapters = j.adapters || [];
    renderAdapters();
  } catch(e) {
    document.getElementById('adapters-list').textContent = 'Failed to load adapters: ' + e.message;
  }
}

// ── Skills (Phase 1 registry) ──────────────────────────────────────
var skills = [];
var openSkillIds = {};

async function loadSkills() {
  try {
    var r = await fetch('/api/skills');
    var j = await r.json();
    skills = j.skills || [];
    renderSkills();
  } catch(e) {
    document.getElementById('skills-list').textContent = 'Failed to load skills: ' + e.message;
  }
}

function triggerBadge(t) {
  var cls = t === 'schedule' ? 'badge-blue' : t === 'event' ? 'badge-yellow' : 'badge-purple';
  return '<span class="badge ' + cls + '">' + esc((t || '').toUpperCase()) + '</span>';
}

function skillLastRanText(s) {
  if (!s.lastRan) return 'Last ran: never';
  try {
    var d = new Date(s.lastRan);
    var mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'Last ran: just now';
    if (mins < 60) return 'Last ran: ' + mins + ' min ago';
    return 'Last ran: ' + d.toLocaleString();
  } catch(e) { return 'Last ran: ' + esc(s.lastRan); }
}

function renderSkills() {
  var root = document.getElementById('skills-list');
  if (!skills.length) { root.textContent = 'No skills registered.'; return; }
  root.innerHTML = skills.map(function(s) { return makeSkillCard(s); }).join('');
}

function makeSkillCard(s) {
  var isOpen = !!openSkillIds[s.id];
  var enabledDot = s.enabled ? 'connected' : 'idle';
  var stubBadge = s.runnable ? '' : '<span class="badge badge-yellow">stub</span>';
  var enBadge = s.enabled
    ? '<span class="badge badge-green">enabled</span>'
    : '<span class="badge">disabled</span>';
  return '<div class="adapter' + (isOpen ? ' open' : '') + '" id="skill-card-' + s.id + '">' +
    '<div class="adapter-head" onclick="toggleSkillCard(\\'' + s.id + '\\')">' +
      '<div class="adapter-dot ' + enabledDot + '"></div>' +
      '<div>' +
        '<div class="adapter-name">' + esc(s.label) + '</div>' +
        '<div class="adapter-desc">' + esc(s.description) + '</div>' +
      '</div>' +
      '<div class="adapter-badges">' + enBadge + triggerBadge(s.trigger) + stubBadge + '</div>' +
      '<span class="chevron">&#9654;</span>' +
    '</div>' +
    '<div class="adapter-body">' +
      '<div class="adapter-desc" style="margin:8px 0">' + skillLastRanText(s) + '</div>' +
      '<div class="btn-row">' +
        '<button onclick="toggleSkill(\\'' + s.id + '\\',' + (!s.enabled) + ')">' +
          (s.enabled ? 'Disable' : 'Enable') + '</button>' +
        (s.runnable
          ? '<button class="btn-success" onclick="runSkillNow(\\'' + s.id + '\\')">Run Now</button>'
          : '<button disabled title="Stub skill">Run Now</button>') +
      '</div>' +
      '<div class="status-box" id="skill-status-' + s.id + '"></div>' +
    '</div>' +
  '</div>';
}

function toggleSkillCard(id) {
  openSkillIds[id] = !openSkillIds[id];
  var card = document.getElementById('skill-card-' + id);
  if (card) card.classList.toggle('open', !!openSkillIds[id]);
}

async function toggleSkill(id, enabled) {
  var st = document.getElementById('skill-status-' + id);
  try {
    var r = await fetch('/api/skills/' + id + '/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: enabled })
    });
    var j = await r.json();
    show(st, j, j.ok ? 'ok' : 'err');
    if (j.ok) await loadSkills();
  } catch(e) { show(st, e.message, 'err'); }
}

async function runSkillNow(id) {
  var st = document.getElementById('skill-status-' + id);
  try {
    var r = await fetch('/api/skills/' + id + '/run-now', { method: 'POST' });
    var j = await r.json();
    show(st, j, j.ok ? 'ok' : 'err');
    if (j.ok) setTimeout(loadSkills, 800);
  } catch(e) { show(st, e.message, 'err'); }
}

async function loadRecentEvents() {
  try {
    var r = await fetch('/api/events/recent');
    var j = await r.json();
    events = j.events || [];
    renderEvents();
  } catch(e) {}
}

// ── Init ───────────────────────────────────────────────────────────
Promise.all([loadAdapters(), loadSkills(), loadAlfredState(), loadRecentEvents()]);
connectSSE();
setInterval(loadAlfredState, 8000);
setInterval(loadRecentEvents, 5000);
setInterval(loadSkills, 15000);
</script>
</body>
</html>`;
}

module.exports = { createSettingsPage };
