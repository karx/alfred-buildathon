function createDemoPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Alfred — Demo Backstage</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0a0a0a; --surface: #141414; --surface2: #1e1e1e; --border: #2a2a2a;
      --text: #e8e8e8; --muted: #777; --muted2: #444;
      --green: #22c55e; --yellow: #eab308; --red: #ef4444; --blue: #3b82f6;
      --indigo: #6366f1; --purple: #a855f7; --orange: #f97316;
    }
    body {
      background: var(--bg); color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-size: 13px; line-height: 1.5; min-height: 100vh;
    }
    nav {
      display: flex; align-items: center; gap: 12px; padding: 0 20px; height: 48px;
      background: var(--surface); border-bottom: 1px solid var(--border);
      position: sticky; top: 0; z-index: 10;
    }
    .nav-logo { font-weight: 800; font-size: 15px; }
    .nav-badge {
      font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
      background: var(--purple); color: #fff; padding: 3px 8px; border-radius: 4px;
    }
    .nav-links { margin-left: auto; display: flex; gap: 6px; align-items: center; }
    .nav-link {
      padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
      text-decoration: none; border: 1px solid var(--border); color: var(--muted);
    }
    .nav-link:hover { border-color: var(--indigo); color: var(--indigo); }
    .nav-link.active { background: var(--purple); border-color: var(--purple); color: #fff; }
    #sse-dot {
      width: 7px; height: 7px; border-radius: 50%; background: var(--muted2); margin-left: 4px;
    }
    #sse-dot.live { background: var(--green); box-shadow: 0 0 5px var(--green); }
    #sse-dot.err { background: var(--red); }

    .wrap { max-width: 1100px; margin: 0 auto; padding: 20px; }
    .hero {
      background: linear-gradient(135deg, #1a1028 0%, #141414 60%);
      border: 1px solid #3b2a55; border-radius: 12px; padding: 20px 22px; margin-bottom: 16px;
    }
    .hero h1 { font-size: 20px; font-weight: 800; letter-spacing: -0.3px; margin-bottom: 6px; }
    .hero p { color: var(--muted); font-size: 13px; max-width: 62ch; }
    .hero-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }

    .grid {
      display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 16px; align-items: start;
    }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }

    .panel {
      background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
      padding: 16px; margin-bottom: 14px;
    }
    .section-title {
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px;
      color: var(--muted); margin-bottom: 12px;
    }

    button, .btn {
      appearance: none; border: 1px solid var(--border); background: var(--surface2);
      color: var(--text); border-radius: 8px; padding: 8px 12px; font-size: 12px;
      font-weight: 600; cursor: pointer; font-family: inherit;
    }
    button:hover, .btn:hover { border-color: var(--indigo); color: #fff; }
    button.primary {
      background: var(--purple); border-color: var(--purple); color: #fff;
    }
    button.primary:hover { filter: brightness(1.08); }
    button.danger { border-color: #5a2020; color: var(--red); }
    button.danger:hover { background: #2a1010; }
    button.green { border-color: #14532d; color: var(--green); }
    button.blue { border-color: #1e3a5f; color: var(--blue); }
    button.orange { border-color: #7c2d12; color: var(--orange); }
    button:disabled { opacity: 0.45; cursor: not-allowed; }

    .pack-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    @media (max-width: 560px) { .pack-grid { grid-template-columns: 1fr; } }
    .pack-card {
      border: 1px solid var(--border); border-radius: 10px; padding: 12px;
      background: var(--surface2); cursor: pointer; text-align: left; width: 100%;
      transition: border-color .15s, transform .1s;
    }
    .pack-card:hover { border-color: var(--purple); transform: translateY(-1px); }
    .pack-card h3 { font-size: 13px; margin-bottom: 4px; }
    .pack-card p { font-size: 11px; color: var(--muted); font-weight: 400; }

    .btn-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .field-row { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
    input[type=text], select {
      flex: 1; min-width: 0; padding: 8px 10px; border-radius: 8px;
      border: 1px solid var(--border); background: var(--surface2); color: var(--text);
      font-size: 12px; font-family: inherit;
    }
    input:focus, select:focus { outline: none; border-color: var(--indigo); }

    .stat-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px;
    }
    @media (max-width: 560px) { .stat-grid { grid-template-columns: 1fr 1fr; } }
    .stat {
      background: var(--surface2); border: 1px solid var(--border); border-radius: 8px;
      padding: 10px; text-align: center;
    }
    .stat .n { font-size: 20px; font-weight: 800; }
    .stat .l { font-size: 9px; letter-spacing: 1px; color: var(--muted); text-transform: uppercase; margin-top: 2px; }
    .n.red { color: var(--red); } .n.green { color: var(--green); }
    .n.yellow { color: var(--yellow); } .n.blue { color: var(--blue); }

    .hw-preview {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      background: #0d0d0d; border: 1px solid var(--border); border-radius: 10px;
      padding: 12px; font-size: 11px;
    }
    .hw-row { display: flex; gap: 10px; margin-bottom: 4px; }
    .hw-k { color: var(--muted); width: 90px; flex-shrink: 0; }
    .led {
      display: inline-block; width: 10px; height: 10px; border-radius: 50%;
      background: var(--muted2); vertical-align: middle; margin-right: 6px;
    }
    .led.green { background: var(--green); box-shadow: 0 0 8px var(--green); }
    .led.red { background: var(--red); box-shadow: 0 0 8px var(--red); }
    .led.blue { background: var(--blue); box-shadow: 0 0 8px var(--blue); }
    .led.yellow { background: var(--yellow); box-shadow: 0 0 8px var(--yellow); }

    .log {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px; max-height: 180px; overflow: auto;
      background: #0d0d0d; border: 1px solid var(--border); border-radius: 8px;
      padding: 10px; color: var(--muted);
    }
    .log.tall { max-height: 280px; }
    .log .ok { color: var(--green); }
    .log .err { color: var(--red); }
    .log .info { color: var(--blue); }
    .log .hit { color: var(--text); border-bottom: 1px solid #1a1a1a; padding: 5px 0; }
    .log .hit:first-child { padding-top: 0; }
    .log .hit .src { color: var(--purple); font-weight: 700; }
    .log .hit .typ { color: var(--yellow); }
    .log .hit .pay { color: var(--muted); display: block; margin-top: 2px; word-break: break-all; }
    .log .hit.fail .src { color: var(--red); }
    .sec-head {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
    }
    .sec-head .section-title { margin-bottom: 0; }
    .hit-count {
      font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
      color: var(--muted); background: var(--surface2); border: 1px solid var(--border);
      padding: 2px 8px; border-radius: 999px;
    }
    .hit-count.live { color: var(--green); border-color: #14532d; }

    .checklist { list-style: none; }
    .checklist li {
      display: flex; gap: 8px; align-items: flex-start; padding: 6px 0;
      border-bottom: 1px solid var(--border); font-size: 12px;
    }
    .checklist li:last-child { border-bottom: none; }
    .check {
      width: 16px; height: 16px; border-radius: 4px; border: 1px solid var(--border);
      flex-shrink: 0; margin-top: 1px; display: grid; place-items: center; font-size: 10px;
    }
    .check.on { background: #14532d; border-color: var(--green); color: var(--green); }

    .script {
      font-size: 12px; color: var(--muted); line-height: 1.65;
    }
    .script ol { margin-left: 18px; }
    .script li { margin-bottom: 6px; }
    .script strong { color: var(--text); }
    code {
      font-family: ui-monospace, Menlo, monospace; font-size: 11px;
      background: var(--surface2); padding: 1px 5px; border-radius: 4px;
    }
  </style>
</head>
<body>
<nav>
  <div class="nav-logo">Alfred</div>
  <span class="nav-badge">Backstage</span>
  <div class="nav-links">
    <a href="/demo" class="nav-link active">Demo</a>
    <a href="/live" class="nav-link">Live</a>
    <a href="/settings" class="nav-link">Settings</a>
    <div id="sse-dot" title="SSE"></div>
  </div>
</nav>

<div class="wrap">
  <div class="hero">
    <h1>Demo Backstage</h1>
    <p>
      One place to fabricate a full working Alfred world for stage demos —
      task board, daily brief, modes, and hardware nudges — without waiting on the LLM pipeline.
    </p>
    <div class="hero-actions">
      <button class="primary" onclick="loadStage('full')">Load Full Working Demo</button>
      <button class="orange" onclick="loadStage('hardware')">Hardware Buzzer Only</button>
      <button class="danger" onclick="loadStage('reset')">Reset Demo Data</button>
      <a href="/live" class="btn" style="text-decoration:none;display:inline-flex;align-items:center;">Open Live →</a>
    </div>
  </div>

  <div class="grid">
    <div>
      <div class="panel">
        <div class="section-title">Stage Packs</div>
        <div class="pack-grid" id="pack-grid">
          <button class="pack-card" onclick="loadStage('full')"><h3>Full Working Demo</h3><p>Todos, nudges, brief, focus mode — complete stage set.</p></button>
          <button class="pack-card" onclick="loadStage('hardware')"><h3>Hardware Buzzer</h3><p>Single ACK-ready nudge for LED + display + buzzer.</p></button>
          <button class="pack-card" onclick="loadStage('meeting')"><h3>In Meeting</h3><p>Blue meeting mode + wrap-up nudge.</p></button>
          <button class="pack-card" onclick="loadStage('focus')"><h3>Focus Block</h3><p>Deep work mode + protect-focus nudge.</p></button>
          <button class="pack-card" onclick="loadStage('board')"><h3>Task Board Only</h3><p>Rich TODO columns for /live walkthrough, no buzzer.</p></button>
          <button class="pack-card" onclick="loadStage('reset')"><h3>Reset Demo Data</h3><p>Strip demo todos/nudges; keep real data.</p></button>
        </div>
      </div>

      <div class="panel">
        <div class="section-title">Nudge Fabricator</div>
        <div class="btn-row">
          <button onclick="fab('buzzer', true)">Buzz Demo</button>
          <button onclick="fab('critical', true)">Critical</button>
          <button onclick="fab('buildathon', true)">Buildathon Pack</button>
          <button onclick="fab('meeting', true)">Meeting</button>
          <button onclick="fab('queue', true)">Queue (3)</button>
          <button onclick="fab('focus', true)">Focus</button>
          <button class="danger" onclick="clearDemo()">Clear Demo Nudges</button>
        </div>
        <div class="field-row">
          <input id="custom-text" type="text" maxlength="40" placeholder="Custom nudge (max 40 chars for hardware)" />
          <select id="custom-pri" style="flex:0 0 100px">
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
          </select>
          <button class="primary" onclick="fabCustom()">Create</button>
        </div>
      </div>

      <div class="panel">
        <div class="section-title">Mode & Pipeline</div>
        <div class="btn-row">
          <button class="green" onclick="setMode('focus')">Focus</button>
          <button class="blue" onclick="setMode('meeting')">Meeting</button>
          <button class="orange" onclick="setMode('sparring')">Sparring</button>
          <button onclick="ackCurrent()">ACK Active Nudge</button>
          <button onclick="runProcess()">Process Inbox</button>
          <button onclick="runGarden()">Run Garden</button>
          <button onclick="pollGranola()">Poll Granola</button>
        </div>
      </div>

      <div class="panel">
        <div class="section-title">Stage Script (suggested beats)</div>
        <div class="script">
          <ol>
            <li><strong>Load Full Working Demo</strong> — seeds todos + active nudge + brief.</li>
            <li>Open <strong>/live</strong> on the projector; keep this tab as backstage.</li>
            <li>Show hardware: red LED + display text from <code>GET /api/state</code>.</li>
            <li>Press physical ACK (or <strong>ACK Active Nudge</strong>) — LED clears.</li>
            <li>Optional: <strong>In Meeting</strong> pack → blue LED → leave to focus.</li>
            <li>Optional: custom nudge mid-talk with the fabricator.</li>
            <li>End: <strong>Reset Demo Data</strong> if you need a clean slate.</li>
          </ol>
        </div>
      </div>
    </div>

    <div>
      <div class="panel">
        <div class="section-title">Live Snapshot</div>
        <div class="stat-grid">
          <div class="stat"><div class="n green" id="st-todos">0</div><div class="l">Todos</div></div>
          <div class="stat"><div class="n red" id="st-nudges">0</div><div class="l">Nudges</div></div>
          <div class="stat"><div class="n yellow" id="st-inbox">0</div><div class="l">Inbox</div></div>
          <div class="stat"><div class="n blue" id="st-mode">—</div><div class="l">Mode</div></div>
        </div>
        <div class="hw-preview" id="hw-preview">
          <div class="hw-row"><span class="hw-k">LED</span><span id="hw-led"><span class="led"></span>—</span></div>
          <div class="hw-row"><span class="hw-k">DISPLAY</span><span id="hw-display">—</span></div>
          <div class="hw-row"><span class="hw-k">BUZZER</span><span id="hw-buzzer">—</span></div>
          <div class="hw-row"><span class="hw-k">NUDGE ID</span><span id="hw-nudge">—</span></div>
        </div>
      </div>

      <div class="panel">
        <div class="section-title">Readiness</div>
        <ul class="checklist" id="readiness">
          <li><span class="check" id="ck-todos"></span><span>At least 1 active TODO</span></li>
          <li><span class="check" id="ck-nudge"></span><span>Active nudge for hardware</span></li>
          <li><span class="check" id="ck-brief"></span><span>Daily brief populated</span></li>
          <li><span class="check" id="ck-mode"></span><span>Mode set (focus/meeting/sparring)</span></li>
          <li><span class="check" id="ck-hw"></span><span>/api/state returns nudgeId when buzzing</span></li>
        </ul>
      </div>

      <div class="panel">
        <div class="section-title">Action Log</div>
        <div class="log" id="log"><div class="info">// backstage ready</div></div>
      </div>
    </div>
  </div>

  <div class="panel" style="margin-top:2px;">
    <div class="sec-head">
      <div class="section-title">Input Hits</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="hit-count" id="hit-count">0 hits</span>
        <button onclick="loadInputHits()" style="padding:4px 10px;font-size:11px;">Refresh</button>
        <button class="danger" onclick="clearInputHits()" style="padding:4px 10px;font-size:11px;">Clear</button>
      </div>
    </div>
    <p style="color:var(--muted);font-size:11px;margin:-4px 0 10px;">
      Every adapter event (Arduino HTTP ingest, Vault, Granola, …) and failed ingest attempts.
      Also on SSE channel <code>alfred.input.hit</code>.
    </p>
    <div class="log tall" id="input-hits"><div class="info">// waiting for input hits…</div></div>
  </div>
</div>

<script>
'use strict';

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function log(msg, cls) {
  var el = document.getElementById('log');
  var line = document.createElement('div');
  line.className = cls || '';
  var t = new Date().toTimeString().slice(0, 8);
  line.textContent = '[' + t + '] ' + msg;
  el.prepend(line);
}

async function post(url, body) {
  var res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  var j = await res.json().catch(function() { return {}; });
  if (!res.ok) throw new Error(j.message || ('HTTP ' + res.status));
  return j;
}

async function refresh() {
  try {
    var r = await fetch('/api/alfred/state');
    var j = await r.json();
    var s = j.state || {};
    var todos = (s.todos || []).filter(function(t) { return t.status !== 'done'; });
    var nudges = (s.nudges || []).filter(function(n) { return !n.acked; });
    document.getElementById('st-todos').textContent = todos.length;
    document.getElementById('st-nudges').textContent = nudges.length;
    document.getElementById('st-inbox').textContent = (s.inbox || []).length;
    document.getElementById('st-mode').textContent = (s.nowState && s.nowState.mode || 'focus').toUpperCase();

    setCheck('ck-todos', todos.length > 0);
    setCheck('ck-nudge', nudges.length > 0);
    setCheck('ck-brief', Boolean(s.dailySummary));
    setCheck('ck-mode', Boolean(s.nowState && s.nowState.mode));
  } catch (e) {
    log('state refresh failed: ' + e.message, 'err');
  }

  try {
    var hr = await fetch('/api/state');
    var hw = await hr.json();
    var led = hw.led || 'green';
    document.getElementById('hw-led').innerHTML = '<span class="led ' + esc(led) + '"></span>' + esc(led);
    document.getElementById('hw-display').textContent = hw.display || '—';
    document.getElementById('hw-buzzer').textContent = hw.buzzer ? 'ON' : 'off';
    document.getElementById('hw-nudge').textContent = hw.nudgeId || '—';
    setCheck('ck-hw', !hw.buzzer || Boolean(hw.nudgeId));
  } catch (e) {}
}

function setCheck(id, on) {
  var el = document.getElementById(id);
  el.className = 'check' + (on ? ' on' : '');
  el.textContent = on ? '✓' : '';
}

async function loadStage(pack) {
  try {
    var j = await post('/api/alfred/demo/stage', { pack: pack });
    log(j.message || ('Stage ' + pack + ' loaded'), 'ok');
    await refresh();
  } catch (e) {
    log(e.message, 'err');
  }
}

async function fab(scenario, replace) {
  try {
    var j = await post('/api/alfred/nudge/fabricate', { scenario: scenario, replace: !!replace });
    log(j.message + (j.statePreview && j.statePreview.nudgeText ? ' → ' + j.statePreview.nudgeText : ''), 'ok');
    await refresh();
  } catch (e) {
    log(e.message, 'err');
  }
}

async function fabCustom() {
  var text = (document.getElementById('custom-text').value || '').trim();
  var priority = document.getElementById('custom-pri').value;
  if (!text) { log('Enter custom nudge text', 'err'); return; }
  try {
    var j = await post('/api/alfred/nudge/fabricate', { text: text, priority: priority, replace: false });
    log(j.message + ' → ' + text, 'ok');
    document.getElementById('custom-text').value = '';
    await refresh();
  } catch (e) {
    log(e.message, 'err');
  }
}

async function clearDemo() {
  try {
    var j = await post('/api/alfred/nudge/clear-demo', {});
    log(j.message || 'Demo nudges cleared', 'ok');
    await refresh();
  } catch (e) {
    log(e.message, 'err');
  }
}

async function setMode(mode) {
  try {
    var j = await post('/api/alfred/set-mode', { mode: mode, context: mode === 'meeting' ? 'Demo meeting' : 'Demo' });
    log('Mode → ' + mode, 'ok');
    await refresh();
  } catch (e) {
    log(e.message, 'err');
  }
}

async function ackCurrent() {
  try {
    var j = await post('/api/alfred/nudge-ack', {});
    log(j.message || 'Acked', j.ok === false ? 'err' : 'ok');
    await refresh();
  } catch (e) {
    log(e.message, 'err');
  }
}

async function runProcess() {
  try {
    var j = await post('/api/alfred/process', {});
    log(j.message || 'Process triggered', 'info');
    setTimeout(refresh, 1500);
  } catch (e) {
    log(e.message, 'err');
  }
}

async function runGarden() {
  try {
    var j = await post('/api/alfred/garden', {});
    log(j.message || 'Garden triggered', 'info');
    setTimeout(refresh, 1500);
  } catch (e) {
    log(e.message, 'err');
  }
}

async function pollGranola() {
  try {
    var j = await post('/api/adapters/granola/actions/poll-now', {});
    log(j.message || 'Granola poll triggered', 'info');
    setTimeout(refresh, 2000);
  } catch (e) {
    log(e.message, 'err');
  }
}

function renderHit(hit) {
  var t = (hit.timestamp || '').slice(11, 19) || '--:--:--';
  var cls = hit.ok === false ? 'hit fail' : 'hit';
  var pay = hit.payload ? JSON.stringify(hit.payload) : '';
  var msg = hit.message ? ' · ' + hit.message : '';
  var status = hit.status != null ? ' [' + hit.status + ']' : '';
  var transport = hit.transport ? ' via ' + hit.transport : '';
  return '<div class="' + cls + '">'
    + '<span style="color:var(--muted2)">[' + esc(t) + ']</span> '
    + '<span class="src">' + esc(hit.source) + '</span> → '
    + '<span class="typ">' + esc(hit.type) + '</span>'
    + esc(status) + esc(transport) + esc(msg)
    + (pay ? '<span class="pay">' + esc(pay) + '</span>' : '')
    + '</div>';
}

function prependHit(hit) {
  var el = document.getElementById('input-hits');
  if (el.querySelector('.info')) el.innerHTML = '';
  el.insertAdjacentHTML('afterbegin', renderHit(hit));
  // keep DOM bounded
  while (el.children.length > 100) el.removeChild(el.lastChild);
  bumpHitCount(1);
  log('INPUT ' + hit.source + ' → ' + hit.type + (hit.ok === false ? ' FAIL' : ''), hit.ok === false ? 'err' : 'info');
}

var hitTotal = 0;
function bumpHitCount(delta) {
  if (typeof delta === 'number') hitTotal += delta;
  else hitTotal = delta;
  var el = document.getElementById('hit-count');
  el.textContent = hitTotal + ' hits';
  el.className = 'hit-count' + (hitTotal > 0 ? ' live' : '');
}

async function loadInputHits() {
  try {
    var r = await fetch('/api/alfred/input-hits?limit=100');
    var j = await r.json();
    var hits = j.hits || [];
    var el = document.getElementById('input-hits');
    if (!hits.length) {
      el.innerHTML = '<div class="info">// no input hits yet — POST to /api/adapters/…/ingest or wait for Vault/Granola</div>';
      bumpHitCount(0);
      return;
    }
    el.innerHTML = hits.map(renderHit).join('');
    bumpHitCount(hits.length);
  } catch (e) {
    log('input-hits load failed: ' + e.message, 'err');
  }
}

async function clearInputHits() {
  try {
    await post('/api/alfred/input-hits/clear', {});
    document.getElementById('input-hits').innerHTML = '<div class="info">// cleared</div>';
    bumpHitCount(0);
    log('Input hit log cleared', 'ok');
  } catch (e) {
    log(e.message, 'err');
  }
}

// SSE for live updates
(function connectSse() {
  var dot = document.getElementById('sse-dot');
  try {
    var es = new EventSource('/events');
    es.onopen = function() { dot.className = 'live'; };
    es.onerror = function() { dot.className = 'err'; };
    es.onmessage = function(ev) {
      try {
        var data = JSON.parse(ev.data);
        if (data.channel === 'alfred.input.hit' && data.hit) {
          prependHit(data.hit);
          refresh();
          return;
        }
        if (data.channel && data.channel.indexOf('alfred') === 0) refresh();
      } catch (e) {}
    };
  } catch (e) {
    dot.className = 'err';
  }
})();

refresh();
loadInputHits();
setInterval(refresh, 5000);
setInterval(loadInputHits, 15000);
</script>
</body>
</html>`;
}

module.exports = { createDemoPage };
