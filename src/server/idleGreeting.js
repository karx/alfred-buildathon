/**
 * Idle fallback for GET /api/state `display` when nothing else is active.
 * Format: "Good <Morning|Day|Evening> - <minified greeting>"
 * Clamped to 20 chars (hardware OLED budget).
 * Pick is stable for STICKY_MS so rapid polls don't flicker.
 */

const STICKY_MS = 5 * 60 * 1000; // rotate every 5 minutes

/** Short tails so "Good Morning - tail" fits ~20 chars. */
const TAILS = {
  Morning: ["hey", "hi!", "rise", "focus", "go go", "brew", "ship it", "let's go", "yo"],
  Day: ["hey", "hi!", "focus", "go!", "crush it", "onward", "ship it", "push", "yo"],
  Evening: ["hey", "hi!", "rest", "wrap up", "nice", "ease", "ship it", "wind dn", "yo"],
};

function dayPeriod(hour) {
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Day";
  // 17–4
  return "Evening";
}

function pickIndex(seed, length) {
  // Simple deterministic mix from seed
  let x = seed | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x = (x ^ (x >>> 16)) >>> 0;
  return x % length;
}

/**
 * @param {Date} [now]
 * @returns {string} display text ≤ 20 chars
 */
function idleGreetingDisplay(now = new Date()) {
  const period = dayPeriod(now.getHours());
  const tails = TAILS[period] || TAILS.Day;
  const bucket = Math.floor(now.getTime() / STICKY_MS);
  // Mix calendar day so the sequence reshuffles daily
  const dayKey = now.getFullYear() * 1000 + now.getMonth() * 50 + now.getDate();
  const idx = pickIndex(bucket * 31 + dayKey, tails.length);
  const tail = tails[idx];
  const text = `Good ${period} - ${tail}`;
  return text.slice(0, 20);
}

module.exports = {
  idleGreetingDisplay,
  dayPeriod,
  TAILS,
  STICKY_MS,
};
