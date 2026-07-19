const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GranolaAdapter } = require("../../src/inputs/adapters/granolaAdapter");

function adapter() {
  return new GranolaAdapter({});
}

test("parseMeetingsXml extracts owner (note creator) and attendees", () => {
  const xml = `
<meetings_data count="2">
  <meeting id="aaa-111" title="My standup" date="Jul 19, 2026 3:00 PM GMT+5:30">
    <known_participants>
    Kartik Arora (note creator) <kartik@example.com>
    Sam Lee <sam@example.com>
    </known_participants>
    <summary>We shipped the buzzer.</summary>
  </meeting>
  <meeting id="bbb-222" title="Shared design review" date="Jul 18, 2026 1:00 PM GMT+5:30">
    <known_participants>
    Alice Designer (note creator) <alice@example.com>
    Kartik Arora <kartik@example.com>
    </known_participants>
    <notes>Action: follow up on icons</notes>
  </meeting>
</meetings_data>`;

  const meetings = adapter().parseMeetingsXml(xml);
  assert.equal(meetings.length, 2);

  assert.equal(meetings[0].id, "aaa-111");
  assert.equal(meetings[0].title, "My standup");
  assert.deepEqual(meetings[0].owner, { name: "Kartik Arora", email: "kartik@example.com" });
  assert.equal(meetings[0].attendees.length, 2);
  assert.equal(meetings[0].summary, "We shipped the buzzer.");

  assert.equal(meetings[1].id, "bbb-222");
  assert.deepEqual(meetings[1].owner, { name: "Alice Designer", email: "alice@example.com" });
  assert.equal(meetings[1].notes, "Action: follow up on icons");
});

test("parseFoldersPayload accepts JSON object and array shapes", () => {
  const a = adapter();
  assert.deepEqual(
    a.parseFoldersPayload({ count: 1, folders: [{ id: "fol_abc", title: "Shared" }] }),
    [{ id: "fol_abc", title: "Shared" }]
  );
  assert.deepEqual(a.parseFoldersPayload([{ id: "fol_x" }]), [{ id: "fol_x" }]);
  assert.deepEqual(a.parseFoldersPayload({ count: 0, folders: [] }), []);
});

test("listMeetingsArgs defaults to last_30_days and accepts custom range", () => {
  const a = adapter();
  a.config = { timeRange: "last_30_days" };
  assert.deepEqual(a.listMeetingsArgs(), { time_range: "last_30_days" });
  assert.deepEqual(a.listMeetingsArgs({ folder_id: "fol_1" }), {
    time_range: "last_30_days",
    folder_id: "fol_1",
  });

  a.config = { timeRange: "custom", customStart: "2026-01-01", customEnd: "2026-01-31" };
  assert.deepEqual(a.listMeetingsArgs(), {
    time_range: "custom",
    custom_start: "2026-01-01",
    custom_end: "2026-01-31",
  });
});

test("fetchMeetingDetails batches get_meetings in chunks of 10", async () => {
  const a = adapter();
  const calls = [];
  a.callTool = async (name, args) => {
    assert.equal(name, "get_meetings");
    calls.push(args.meeting_ids.slice());
    return args.meeting_ids.map((id) => ({ id, title: `M-${id}` }));
  };

  const ids = Array.from({ length: 23 }, (_, i) => `id-${i}`);
  const full = await a.fetchMeetingDetails(ids);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].length, 10);
  assert.equal(calls[1].length, 10);
  assert.equal(calls[2].length, 3);
  assert.equal(full.length, 23);
});
