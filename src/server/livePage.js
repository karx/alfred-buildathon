function createLivePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alfred</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0a0a0a;
      --surface: #141414;
      --surface2: #1e1e1e;
      --border: #2a2a2a;
      --text: #e0e0e0;
      --muted: #666;
      --green: #22c55e;
      --yellow: #eab308;
      --red: #ef4444;
      --blue: #3b82f6;
      --purple: #a855f7;
      --orange: #f97316;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      padding: 12px;
      max-width: 560px;
      margin: 0 auto;
    }

    /* ── Header ── */
    header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    header h1 { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; flex: 1; }
    #conn-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex-shrink: 0; }
    #conn-dot.live { background: var(--green); box-shadow: 0 0 6px var(--green); }
    #conn-dot.error { background: var(--red); }
    #conn-label { font-size: 11px; color: var(--muted); }
    #trigger-btn {
      background: var(--surface2); border: 1px solid var(--border);
      color: var(--muted); padding: 5px 12px; border-radius: 5px;
      font-size: 11px; cursor: pointer;
    }
    #trigger-btn:hover { border-color: var(--yellow); color: var(--yellow); }
    #trigger-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* ── Tamagotchi Hero ── */
    .tama-hero {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 20px 20px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      margin-bottom: 12px;
    }

    #tama-wrap { position: relative; width: 220px; height: 220px; }
    #tama-svg { width: 220px; height: 220px; transition: filter 0.6s ease; }

    /* Glow per expression */
    .expr-happy    #tama-svg { filter: drop-shadow(0 0 28px #22c55e55); }
    .expr-thinking #tama-svg { filter: drop-shadow(0 0 28px #eab30855); }
    .expr-worried  #tama-svg { filter: drop-shadow(0 0 28px #f9731655); }
    .expr-alarmed  #tama-svg { filter: drop-shadow(0 0 36px #ef444477); }
    .expr-meeting  #tama-svg { filter: drop-shadow(0 0 28px #3b82f655); }
    .expr-excited  #tama-svg { filter: drop-shadow(0 0 36px #a855f777); }

    /* Ring color per expression (SVG stroke via CSS) */
    .expr-happy    .tama-ring { stroke: #22c55e; }
    .expr-thinking .tama-ring { stroke: #eab308; }
    .expr-worried  .tama-ring { stroke: #f97316; }
    .expr-alarmed  .tama-ring { stroke: #ef4444; }
    .expr-meeting  .tama-ring { stroke: #3b82f6; }
    .expr-excited  .tama-ring { stroke: #a855f7; }

    /* Mood label color per expression */
    .expr-happy    #tama-mood { color: #22c55e; }
    .expr-thinking #tama-mood { color: #eab308; }
    .expr-worried  #tama-mood { color: #f97316; }
    .expr-alarmed  #tama-mood { color: #ef4444; }
    .expr-meeting  #tama-mood { color: #3b82f6; }
    .expr-excited  #tama-mood { color: #a855f7; }

    /* ── Animations ── */
    @keyframes bob        { 0%,100%{transform:translateY(0)}    50%{transform:translateY(-9px)} }
    @keyframes shake      { 0%,100%{transform:translateX(0) rotate(0deg)} 15%{transform:translateX(-7px) rotate(-3deg)} 30%{transform:translateX(7px) rotate(3deg)} 45%{transform:translateX(-5px) rotate(-2deg)} 60%{transform:translateX(5px) rotate(2deg)} 80%{transform:translateX(-3px) rotate(-1deg)} }
    @keyframes blink      { 0%,90%,100%{transform:scaleY(1)}    95%{transform:scaleY(0.06)} }
    @keyframes blink-fast { 0%,82%,100%{transform:scaleY(1)}    88%{transform:scaleY(0.06)} }
    @keyframes sweat-fall { 0%{opacity:0;transform:translateY(-4px)} 20%{opacity:1} 100%{opacity:0;transform:translateY(22px)} }
    @keyframes sparkle    { 0%,100%{opacity:0;transform:scale(0) rotate(0deg)} 50%{opacity:1;transform:scale(1) rotate(180deg)} }
    @keyframes spin-cw    { from{transform:rotate(0deg)}   to{transform:rotate(360deg)} }
    @keyframes spin-ccw   { from{transform:rotate(0deg)}   to{transform:rotate(-360deg)} }
    @keyframes pulse-ring { 0%,100%{opacity:0.5} 50%{opacity:0.15} }

    #tama-body-group {
      animation: bob 2.8s ease-in-out infinite;
      transform-origin: 100px 108px;
    }
    .expr-alarmed  #tama-body-group { animation: shake 0.38s ease-in-out infinite; }
    .expr-meeting  #tama-body-group { animation: none; }
    .expr-thinking #tama-body-group { animation: bob 4.5s ease-in-out infinite; }
    .expr-thinking .tama-ring       { animation: pulse-ring 1.5s ease-in-out infinite; }

    /* Eye blink via class */
    .eye-blink {
      transform-box: fill-box;
      transform-origin: center;
      animation: blink 3.8s ease-in-out infinite;
    }
    .expr-alarmed .eye-blink { animation: blink-fast 1.4s ease-in-out infinite; }

    /* Star spin */
    .star-spin-cw  { transform-box: fill-box; transform-origin: center; animation: spin-cw  3s linear infinite; }
    .star-spin-ccw { transform-box: fill-box; transform-origin: center; animation: spin-ccw 3s linear infinite; }

    /* ── Expression visibility ── */
    .eyes-happy, .eyes-normal, .eyes-thinking, .eyes-alarmed, .eyes-meeting, .eyes-stars { display: none; }
    .mouth-happy, .mouth-thinking, .mouth-worried, .mouth-alarmed, .mouth-meeting        { display: none; }
    .brow-happy, .brow-normal, .brow-thinking, .brow-alarmed, .brow-meeting              { display: none; }
    .blush, .sweat, .sparkles                                                             { display: none; }

    .expr-happy    .eyes-happy    { display: block; }
    .expr-happy    .mouth-happy   { display: block; }
    .expr-happy    .brow-happy    { display: block; }
    .expr-happy    .blush         { display: block; }

    .expr-thinking .eyes-thinking { display: block; }
    .expr-thinking .mouth-thinking{ display: block; }
    .expr-thinking .brow-thinking { display: block; }
    .expr-thinking .sweat         { display: block; }

    .expr-worried  .eyes-normal   { display: block; }
    .expr-worried  .mouth-worried { display: block; }
    .expr-worried  .brow-alarmed  { display: block; }

    .expr-alarmed  .eyes-alarmed  { display: block; }
    .expr-alarmed  .mouth-alarmed { display: block; }
    .expr-alarmed  .brow-alarmed  { display: block; }
    .expr-alarmed  .sweat         { display: block; }

    .expr-meeting  .eyes-meeting  { display: block; }
    .expr-meeting  .mouth-meeting { display: block; }
    .expr-meeting  .brow-meeting  { display: block; }

    .expr-excited  .eyes-stars    { display: block; }
    .expr-excited  .mouth-happy   { display: block; }
    .expr-excited  .brow-happy    { display: block; }
    .expr-excited  .sparkles      { display: block; }

    #tama-mood {
      font-size: 11px; font-weight: 700; letter-spacing: 1.8px;
      text-transform: uppercase; margin-top: 12px;
      transition: color 0.5s ease;
    }
    #tama-msg { font-size: 11px; color: var(--muted); margin-top: 4px; }

    /* ── Cards ── */
    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 10px; padding: 12px 14px; margin-bottom: 10px;
    }
    .card-title {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 1.2px; color: var(--muted); margin-bottom: 8px;
    }
    .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
    @media (max-width: 460px) { .row-2 { grid-template-columns: 1fr; } }

    #now-mode { font-size: 18px; font-weight: 700; text-transform: capitalize; }
    #now-context { font-size: 12px; color: var(--muted); margin-top: 2px; }
    #proc-status { font-size: 13px; font-weight: 600; }
    #proc-status.processing { color: var(--yellow); }
    #proc-status.idle { color: var(--green); }
    #proc-log { font-size: 11px; color: var(--muted); font-family: monospace; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #daily-summary { font-size: 12px; line-height: 1.7; }

    /* Nudges */
    .nudge { background: #1a0f0a; border: 1px solid #5a2d1a; border-radius: 8px; padding: 9px 11px; margin-bottom: 7px; display: flex; align-items: flex-start; gap: 8px; }
    .nudge-text { flex: 1; font-size: 12px; }
    .nudge-priority { font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 2px 5px; border-radius: 4px; flex-shrink: 0; }
    .nudge-priority.high   { background: #450a0a; color: var(--red); }
    .nudge-priority.medium { background: #431c03; color: var(--orange); }
    .nudge-priority.low    { background: #1a2d0a; color: var(--green); }
    .ack-btn { background: var(--surface2); border: 1px solid var(--border); color: var(--muted); padding: 3px 8px; border-radius: 4px; font-size: 10px; cursor: pointer; flex-shrink: 0; }
    .ack-btn:hover { background: var(--border); color: var(--text); }

    /* TODOs */
    .todo-cols { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    @media (max-width: 460px) { .todo-cols { grid-template-columns: 1fr; } }
    .todo-col-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin-bottom: 5px; }
    .todo-item { background: var(--surface2); border-left: 3px solid var(--border); border-radius: 0 5px 5px 0; padding: 7px 9px; margin-bottom: 5px; font-size: 11px; }
    .todo-item.high   { border-left-color: var(--red); }
    .todo-item.medium { border-left-color: var(--yellow); }
    .todo-item.low    { border-left-color: var(--green); }
    .todo-suggestion  { font-size: 10px; color: var(--muted); margin-top: 3px; }
    .todo-source      { font-size: 9px; color: #444; margin-top: 2px; }
    .empty-col        { font-size: 11px; color: #333; text-align: center; padding: 10px 0; }
  </style>
</head>
<body>

<header>
  <h1>Alfred</h1>
  <button id="trigger-btn" onclick="triggerPoll()">Poll Granola</button>
  <div id="conn-dot"></div>
  <span id="conn-label">Connecting...</span>
</header>

<!-- ── Tamagotchi Hero ── -->
<div class="tama-hero">
  <div id="tama-wrap" class="expr-happy">
    <svg id="tama-svg" viewBox="0 0 200 210" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bodyGrad" cx="40%" cy="30%" r="68%">
          <stop offset="0%" stop-color="#252525"/>
          <stop offset="100%" stop-color="#101010"/>
        </radialGradient>
        <radialGradient id="eyeWhite" cx="35%" cy="28%" r="68%">
          <stop offset="0%" stop-color="#f0f0f0"/>
          <stop offset="100%" stop-color="#d0d0d0"/>
        </radialGradient>
      </defs>

      <g id="tama-body-group">

        <!-- Outer glow rings -->
        <ellipse class="tama-ring" cx="100" cy="108" rx="82" ry="90" fill="none" stroke="#22c55e" stroke-width="0.5" opacity="0.2"/>
        <ellipse class="tama-ring" cx="100" cy="108" rx="77" ry="85" fill="none" stroke="#22c55e" stroke-width="1.5" opacity="0.45"/>

        <!-- Body -->
        <ellipse cx="100" cy="108" rx="73" ry="81" fill="url(#bodyGrad)"/>

        <!-- Subtle shine -->
        <ellipse cx="78" cy="70" rx="22" ry="14" fill="white" opacity="0.035"/>

        <!-- ── EYEBROWS ── -->

        <!-- Happy: gentle arch -->
        <g class="brow-happy">
          <path d="M 59 68 Q 72 60 85 66" stroke="#cccccc" stroke-width="3" fill="none" stroke-linecap="round"/>
          <path d="M 115 66 Q 128 60 141 68" stroke="#cccccc" stroke-width="3" fill="none" stroke-linecap="round"/>
        </g>

        <!-- Normal: flat natural -->
        <g class="brow-normal">
          <path d="M 61 70 Q 72 64 83 68" stroke="#cccccc" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <path d="M 117 68 Q 128 64 139 70" stroke="#cccccc" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        </g>

        <!-- Thinking: left brow raised high, right normal -->
        <g class="brow-thinking">
          <path d="M 57 60 Q 72 50 86 58" stroke="#cccccc" stroke-width="3.2" fill="none" stroke-linecap="round"/>
          <path d="M 117 68 Q 128 64 139 70" stroke="#cccccc" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        </g>

        <!-- Alarmed/Worried: inverted V (inner corners raised = distress) -->
        <g class="brow-alarmed">
          <path d="M 57 62 Q 70 70 83 63" stroke="#cccccc" stroke-width="3.2" fill="none" stroke-linecap="round"/>
          <path d="M 117 63 Q 130 70 143 62" stroke="#cccccc" stroke-width="3.2" fill="none" stroke-linecap="round"/>
        </g>

        <!-- Meeting: straight heavy determined brows -->
        <g class="brow-meeting">
          <path d="M 57 72 Q 71 68 85 71" stroke="#cccccc" stroke-width="4.5" fill="none" stroke-linecap="round"/>
          <path d="M 115 71 Q 129 68 143 72" stroke="#cccccc" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        </g>

        <!-- ── EYES ── -->

        <!-- Happy: classic ^_^ upward arc -->
        <g class="eyes-happy">
          <path d="M 57 97 Q 72 80 87 97" stroke="#d8d8d8" stroke-width="4" fill="none" stroke-linecap="round"/>
          <path d="M 113 97 Q 128 80 143 97" stroke="#d8d8d8" stroke-width="4" fill="none" stroke-linecap="round"/>
          <!-- Happy sparkle dots in eyes -->
          <circle cx="65" cy="88" r="2" fill="#d8d8d8" opacity="0.7"/>
          <circle cx="135" cy="88" r="2" fill="#d8d8d8" opacity="0.7"/>
        </g>

        <!-- Normal: round eyes with pupils, blink -->
        <g class="eyes-normal">
          <g class="eye-blink" style="transform-origin: 72px 93px;">
            <ellipse cx="72" cy="93" rx="13" ry="15" fill="url(#eyeWhite)"/>
            <ellipse cx="73" cy="95" rx="7.5" ry="9" fill="#0c0c1e"/>
            <circle  cx="77"  cy="89" r="3.5" fill="white" opacity="0.95"/>
            <circle  cx="74"  cy="88" r="1.5" fill="white" opacity="0.55"/>
          </g>
          <g class="eye-blink" style="transform-origin: 128px 93px; animation-delay: 0.1s;">
            <ellipse cx="128" cy="93" rx="13" ry="15" fill="url(#eyeWhite)"/>
            <ellipse cx="129" cy="95" rx="7.5" ry="9" fill="#0c0c1e"/>
            <circle  cx="133"  cy="89" r="3.5" fill="white" opacity="0.95"/>
            <circle  cx="130"  cy="88" r="1.5" fill="white" opacity="0.55"/>
          </g>
        </g>

        <!-- Thinking: left half-lidded (upper lid covers top half), right normal looking up -->
        <g class="eyes-thinking">
          <!-- Left: half-lidded -->
          <ellipse cx="72" cy="95" rx="13" ry="13" fill="url(#eyeWhite)"/>
          <ellipse cx="70" cy="96" rx="7"   ry="7"  fill="#0c0c1e"/>
          <circle  cx="68" cy="93" r="2.5"  fill="white" opacity="0.9"/>
          <!-- upper lid rectangle masks the top -->
          <rect x="59" y="82" width="26" height="12" fill="#181818" rx="3"/>

          <!-- Right: normal, pupil shifted up-left (looking at thought) -->
          <ellipse cx="128" cy="93" rx="13" ry="15" fill="url(#eyeWhite)"/>
          <ellipse cx="126" cy="91" rx="7.5" ry="9"  fill="#0c0c1e"/>
          <circle  cx="124" cy="87" r="3.5"  fill="white" opacity="0.9"/>
        </g>

        <!-- Alarmed: huge wide eyes, tiny pupils, rapid blink -->
        <g class="eyes-alarmed">
          <g class="eye-blink" style="transform-origin: 72px 92px;">
            <ellipse cx="72" cy="92" rx="16" ry="18" fill="url(#eyeWhite)"/>
            <ellipse cx="72" cy="95" rx="5.5" ry="6.5" fill="#0c0c1e"/>
            <circle  cx="76" cy="88" r="2.5"  fill="white" opacity="0.9"/>
          </g>
          <g class="eye-blink" style="transform-origin: 128px 92px; animation-delay: 0.13s;">
            <ellipse cx="128" cy="92" rx="16" ry="18" fill="url(#eyeWhite)"/>
            <ellipse cx="128" cy="95" rx="5.5" ry="6.5" fill="#0c0c1e"/>
            <circle  cx="132" cy="88" r="2.5"  fill="white" opacity="0.9"/>
          </g>
        </g>

        <!-- Meeting: hooded determined gaze (upper lid covers ~40%) -->
        <g class="eyes-meeting">
          <!-- Left -->
          <ellipse cx="72" cy="95" rx="14" ry="13" fill="url(#eyeWhite)"/>
          <ellipse cx="72" cy="96" rx="8"   ry="8"  fill="#0c0c1e"/>
          <circle  cx="76" cy="93" r="3"    fill="white" opacity="0.8"/>
          <rect x="58" y="82" width="28" height="13" fill="#141414" rx="3"/>
          <!-- Right -->
          <ellipse cx="128" cy="95" rx="14" ry="13" fill="url(#eyeWhite)"/>
          <ellipse cx="128" cy="96" rx="8"   ry="8"  fill="#0c0c1e"/>
          <circle  cx="132" cy="93" r="3"    fill="white" opacity="0.8"/>
          <rect x="114" y="82" width="28" height="13" fill="#141414" rx="3"/>
        </g>

        <!-- Star eyes: spinning gold stars for excited -->
        <g class="eyes-stars">
          <!-- Left star -->
          <g transform="translate(72,93)">
            <g class="star-spin-cw">
              <path d="M0-16 L3.8-5.8 L15-5 L7 3.2 L9.5 15 L0 9 L-9.5 15 L-7 3.2 L-15-5 L-3.8-5.8 Z" fill="#eab308"/>
            </g>
            <path d="M0-10 L2.3-3.5 L9.5-3 L4.3 2 L5.8 9.5 L0 5.5 L-5.8 9.5 L-4.3 2 L-9.5-3 L-2.3-3.5 Z" fill="#fde047"/>
            <circle cx="0" cy="0" r="3" fill="white" opacity="0.9"/>
          </g>
          <!-- Right star -->
          <g transform="translate(128,93)">
            <g class="star-spin-ccw">
              <path d="M0-16 L3.8-5.8 L15-5 L7 3.2 L9.5 15 L0 9 L-9.5 15 L-7 3.2 L-15-5 L-3.8-5.8 Z" fill="#eab308"/>
            </g>
            <path d="M0-10 L2.3-3.5 L9.5-3 L4.3 2 L5.8 9.5 L0 5.5 L-5.8 9.5 L-4.3 2 L-9.5-3 L-2.3-3.5 Z" fill="#fde047"/>
            <circle cx="0" cy="0" r="3" fill="white" opacity="0.9"/>
          </g>
        </g>

        <!-- ── NOSE (always visible, subtle) ── -->
        <ellipse cx="100" cy="116" rx="3.5" ry="2.5" fill="#444" opacity="0.55"/>

        <!-- ── MOUTH ── -->

        <!-- Happy: big U smile -->
        <g class="mouth-happy">
          <path d="M 68 130 Q 100 158 132 130" stroke="#d0d0d0" stroke-width="4" fill="none" stroke-linecap="round"/>
          <!-- smile dimples -->
          <circle cx="68"  cy="130" r="2.5" fill="#d0d0d0" opacity="0.5"/>
          <circle cx="132" cy="130" r="2.5" fill="#d0d0d0" opacity="0.5"/>
        </g>

        <!-- Thinking: near-flat with trailing dots -->
        <g class="mouth-thinking">
          <path d="M 83 130 Q 100 127 117 130" stroke="#d0d0d0" stroke-width="3" fill="none" stroke-linecap="round"/>
          <circle cx="127" cy="128" r="2.8" fill="#d0d0d0" opacity="0.7"/>
          <circle cx="135" cy="125" r="2"   fill="#d0d0d0" opacity="0.5"/>
          <circle cx="142" cy="121" r="1.3" fill="#d0d0d0" opacity="0.3"/>
        </g>

        <!-- Worried: frown (upward arc = sad) -->
        <g class="mouth-worried">
          <path d="M 74 140 Q 100 126 126 140" stroke="#d0d0d0" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        </g>

        <!-- Alarmed: open O mouth with top teeth -->
        <g class="mouth-alarmed">
          <ellipse cx="100" cy="134" rx="16" ry="14" fill="#080808" stroke="#d0d0d0" stroke-width="3.5"/>
          <rect x="88" y="126" width="24" height="6" fill="#d8d8d8" rx="1.5"/>
        </g>

        <!-- Meeting: firm straight line -->
        <g class="mouth-meeting">
          <path d="M 76 132 L 124 132" stroke="#d0d0d0" stroke-width="5" fill="none" stroke-linecap="round"/>
        </g>

        <!-- ── ACCESSORIES ── -->

        <!-- Blush (happy only) -->
        <g class="blush">
          <ellipse cx="49"  cy="116" rx="13" ry="8" fill="#f97316" opacity="0.18"/>
          <ellipse cx="151" cy="116" rx="13" ry="8" fill="#f97316" opacity="0.18"/>
          <!-- small blush dots -->
          <circle cx="46"  cy="114" r="2" fill="#f97316" opacity="0.25"/>
          <circle cx="52"  cy="118" r="1.5" fill="#f97316" opacity="0.2"/>
          <circle cx="148" cy="114" r="2" fill="#f97316" opacity="0.25"/>
          <circle cx="154" cy="118" r="1.5" fill="#f97316" opacity="0.2"/>
        </g>

        <!-- Sweat drops (thinking + alarmed) -->
        <g class="sweat">
          <g style="animation: sweat-fall 1.3s ease-in infinite 0s;">
            <ellipse cx="152" cy="63" rx="5.5" ry="8" fill="#3b82f6" opacity="0.85" transform="rotate(18,152,63)"/>
            <circle  cx="152" cy="57" r="4" fill="#3b82f6" opacity="0.85"/>
          </g>
          <g style="animation: sweat-fall 1.3s ease-in infinite 0.52s;">
            <ellipse cx="162" cy="80" rx="4" ry="6"  fill="#60a5fa" opacity="0.7"  transform="rotate(22,162,80)"/>
            <circle  cx="162" cy="75" r="3" fill="#60a5fa" opacity="0.7"/>
          </g>
        </g>

        <!-- Sparkles (excited) -->
        <g class="sparkles">
          <g transform="translate(18,72)">
            <path style="animation: sparkle 0.85s ease-in-out infinite 0s;" d="M0-11 L2-2 L11 0 L2 2 L0 11 L-2 2 L-11 0 L-2-2 Z" fill="#eab308"/>
          </g>
          <g transform="translate(164,58)">
            <path style="animation: sparkle 0.85s ease-in-out infinite 0.21s;" d="M0-9 L1.8-1.8 L9 0 L1.8 1.8 L0 9 L-1.8 1.8 L-9 0 L-1.8-1.8 Z" fill="#a855f7"/>
          </g>
          <g transform="translate(10,128)">
            <path style="animation: sparkle 0.85s ease-in-out infinite 0.42s;" d="M0-7 L1.4-1.4 L7 0 L1.4 1.4 L0 7 L-1.4 1.4 L-7 0 L-1.4-1.4 Z" fill="#22c55e"/>
          </g>
          <g transform="translate(170,118)">
            <path style="animation: sparkle 0.85s ease-in-out infinite 0.63s;" d="M0-10 L1.8-1.8 L10 0 L1.8 1.8 L0 10 L-1.8 1.8 L-10 0 L-1.8-1.8 Z" fill="#3b82f6"/>
          </g>
          <g transform="translate(28,155)">
            <path style="animation: sparkle 0.85s ease-in-out infinite 0.84s;" d="M0-7 L1.4-1.4 L7 0 L1.4 1.4 L0 7 L-1.4 1.4 L-7 0 L-1.4-1.4 Z" fill="#f97316"/>
          </g>
        </g>

      </g>
    </svg>
  </div>
  <div id="tama-mood">Happy</div>
  <div id="tama-msg">All systems nominal</div>
</div>

<!-- Now + Agent row -->
<div class="row-2">
  <div class="card">
    <div class="card-title">Now</div>
    <div id="now-mode">Focus</div>
    <div id="now-context">-</div>
  </div>
  <div class="card">
    <div class="card-title">Agent</div>
    <div id="proc-status" class="idle">Idle</div>
    <div id="proc-log"></div>
  </div>
</div>

<!-- Nudges -->
<div class="card">
  <div class="card-title">Nudges</div>
  <div id="nudges-list"><div class="empty-col">No active nudges</div></div>
</div>

<!-- Daily Summary -->
<div class="card">
  <div class="card-title">Daily Summary</div>
  <div id="daily-summary" style="color:var(--muted);">Not yet generated</div>
</div>

<!-- TODOs -->
<div class="card">
  <div class="card-title">TODOs</div>
  <div class="todo-cols">
    <div>
      <div class="todo-col-title">TODO</div>
      <div id="col-todo"></div>
    </div>
    <div>
      <div class="todo-col-title">In Progress</div>
      <div id="col-inprogress"></div>
    </div>
    <div>
      <div class="todo-col-title">Done</div>
      <div id="col-done"></div>
    </div>
  </div>
</div>

<script>
  function esc(s) {
    return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  // ── Expression Engine ────────────────────────────────────────

  const EXPR_DATA = {
    happy:    { mood: "Happy",    msg: "All caught up!" },
    thinking: { mood: "Thinking", msg: "Processing your world..." },
    worried:  { mood: "Worried",  msg: "Got things that need attention" },
    alarmed:  { mood: "Alert!",   msg: "Urgent — needs you now!" },
    meeting:  { mood: "Focused",  msg: "In the zone" },
    excited:  { mood: "Excited!", msg: "Just leveled up!" },
  };

  let currentExpr = "happy";
  let excitedTimer = null;
  let prevProcessing = false;

  function setExpression(name) {
    if (name === currentExpr) return;
    currentExpr = name;
    document.getElementById("tama-wrap").className = "expr-" + name;
    const d = EXPR_DATA[name];
    document.getElementById("tama-mood").textContent = d.mood;
    document.getElementById("tama-msg").textContent = d.msg;
  }

  function computeExpression(state) {
    const mode = (state.nowState?.mode || "focus").toLowerCase();
    const isProcessing = state.processingStatus === "processing";
    const nudges = (state.nudges || []).filter(n => !n.acked);
    const hasHighNudge = nudges.some(n => n.priority === "high");

    if (mode === "meeting") return "meeting";
    if (isProcessing) return "thinking";
    if (hasHighNudge) return "alarmed";
    if (nudges.length > 0) return "worried";
    return "happy";
  }

  // ── State render ─────────────────────────────────────────────

  function render(state) {
    const expr = computeExpression(state);
    const isProcessing = state.processingStatus === "processing";

    // Was processing, now done + nothing else urgent → flash excited briefly
    if (prevProcessing && !isProcessing && expr === "happy") {
      const prev = currentExpr;
      currentExpr = ""; // allow setExpression to fire
      setExpression("excited");
      clearTimeout(excitedTimer);
      excitedTimer = setTimeout(() => {
        currentExpr = "";
        setExpression("happy");
      }, 2800);
    } else if (currentExpr !== "excited") {
      setExpression(expr);
    }
    prevProcessing = isProcessing;

    // Now
    const mode = state.nowState?.mode || "focus";
    document.getElementById("now-mode").textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
    document.getElementById("now-context").textContent = state.nowState?.context || "-";

    // Processing
    const isProc = state.processingStatus === "processing";
    const procEl = document.getElementById("proc-status");
    procEl.textContent = isProc ? "Processing..." : "Idle";
    procEl.className = isProc ? "processing" : "idle";
    document.getElementById("proc-log").textContent = state.processingLog || "";

    // Daily summary
    const summaryEl = document.getElementById("daily-summary");
    summaryEl.textContent = state.dailySummary || "Not yet generated";
    summaryEl.style.color = state.dailySummary ? "var(--text)" : "var(--muted)";

    // Nudges
    const nudges = (state.nudges || []).filter(n => !n.acked);
    document.getElementById("nudges-list").innerHTML = nudges.length
      ? nudges.map(n => \`<div class="nudge">
          <span class="nudge-priority \${esc(n.priority)}">\${esc(n.priority || "")}</span>
          <span class="nudge-text">\${esc(n.text)}</span>
          <button class="ack-btn" onclick="ackNudge('\${esc(n.id)}')">Ack</button>
        </div>\`).join("")
      : '<div class="empty-col">No active nudges</div>';

    // TODOs
    const todos = state.todos || [];
    const groups = { todo: [], in_progress: [], done: [] };
    todos.forEach(t => { if (groups[t.status]) groups[t.status].push(t); });

    ["todo","in_progress","done"].forEach(status => {
      const key = status === "in_progress" ? "inprogress" : status;
      const items = groups[status];
      document.getElementById("col-" + key).innerHTML = items.length
        ? items.map(t => \`<div class="todo-item \${esc(t.priority)}">
            \${esc(t.text)}
            \${t.suggestion ? \`<div class="todo-suggestion">\${esc(t.suggestion)}</div>\` : ""}
            \${t.source ? \`<div class="todo-source">\${esc(t.source)}</div>\` : ""}
          </div>\`).join("")
        : '<div class="empty-col">-</div>';
    });
  }

  // ── Data fetching ─────────────────────────────────────────────

  async function fetchState() {
    try {
      const res = await fetch("/api/alfred/state");
      const j = await res.json();
      if (j.state) render(j.state);
    } catch (e) {}
  }

  async function ackNudge(id) {
    try {
      await fetch("/api/alfred/nudge-ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nudgeId: id }),
      });
      await fetchState();
    } catch (e) {}
  }

  async function triggerPoll() {
    const btn = document.getElementById("trigger-btn");
    btn.disabled = true;
    btn.textContent = "Polling...";
    try {
      await fetch("/api/adapters/granola/actions/poll-now", { method: "POST" });
    } catch (e) {}
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = "Poll Granola";
      fetchState();
    }, 3000);
  }

  // ── SSE ──────────────────────────────────────────────────────

  const REFRESH_CHANNELS = new Set([
    "alfred.processing.done",
    "alfred.processing.started",
    "alfred.state.updated",
  ]);

  function connectSSE() {
    const es = new EventSource("/events");
    es.onopen = () => {
      document.getElementById("conn-dot").className = "live";
      document.getElementById("conn-label").textContent = "Live";
    };
    es.onerror = () => {
      document.getElementById("conn-dot").className = "error";
      document.getElementById("conn-label").textContent = "Reconnecting...";
      es.close();
      setTimeout(connectSSE, 3000);
    };
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (REFRESH_CHANNELS.has(data.channel)) fetchState();
      } catch (e) {}
    };
  }

  // ── Init ─────────────────────────────────────────────────────

  fetchState();
  connectSSE();
  setInterval(fetchState, 15000);
</script>
</body>
</html>`;
}

module.exports = { createLivePage };
