const test = require("node:test");
const assert = require("node:assert/strict");
const { idleGreetingDisplay, dayPeriod } = require("../../src/server/idleGreeting");

test("dayPeriod maps hours to Morning/Day/Evening", () => {
  assert.equal(dayPeriod(7), "Morning");
  assert.equal(dayPeriod(11), "Morning");
  assert.equal(dayPeriod(12), "Day");
  assert.equal(dayPeriod(15), "Day");
  assert.equal(dayPeriod(18), "Evening");
  assert.equal(dayPeriod(23), "Evening");
  assert.equal(dayPeriod(2), "Evening");
});

test("idleGreetingDisplay is time-aware and ≤20 chars", () => {
  const morning = idleGreetingDisplay(new Date("2026-07-19T08:30:00"));
  assert.match(morning, /^Good Morning/);
  assert.ok(morning.length <= 20, morning);

  const day = idleGreetingDisplay(new Date("2026-07-19T14:00:00"));
  assert.match(day, /^Good Day/);
  assert.ok(day.length <= 20, day);

  const evening = idleGreetingDisplay(new Date("2026-07-19T20:00:00"));
  assert.match(evening, /^Good Evening/);
  assert.ok(evening.length <= 20, evening);
});

test("idleGreetingDisplay is sticky within the same 5-min bucket", () => {
  const a = idleGreetingDisplay(new Date("2026-07-19T09:01:00"));
  const b = idleGreetingDisplay(new Date("2026-07-19T09:03:00"));
  assert.equal(a, b);
});

test("idleGreetingDisplay includes a minified tail after dash", () => {
  const text = idleGreetingDisplay(new Date("2026-07-19T09:00:00"));
  assert.match(text, /^Good Morning - .+/);
});
