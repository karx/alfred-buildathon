/**
 * Ring buffer of input adapter hits — every ingest/event that enters Alfred.
 * Used by /demo backstage and GET /api/alfred/input-hits.
 */
function createInputHitLog({ limit = 200 } = {}) {
  const hits = [];
  const listeners = new Set();

  function notify(hit) {
    for (const fn of listeners) {
      try {
        fn(hit);
      } catch {
        /* ignore listener errors */
      }
    }
  }

  function summarizePayload(payload) {
    if (!payload || typeof payload !== "object") return undefined;
    const out = {};
    const keys = [
      "eventType", "type", "button", "mode", "enabled", "nudgeId", "response",
      "scenario", "text", "transcript", "deviceId", "meetingId", "title",
      "relativePath", "changeType", "state", "priority",
    ];
    for (const k of keys) {
      if (payload[k] !== undefined && payload[k] !== null && payload[k] !== "") {
        const v = payload[k];
        out[k] = typeof v === "string" && v.length > 80 ? v.slice(0, 80) + "…" : v;
      }
    }
    return Object.keys(out).length ? out : undefined;
  }

  function record(entry = {}) {
    const hit = {
      id: `hit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: entry.timestamp || new Date().toISOString(),
      source: entry.source || "unknown",
      type: entry.type || entry.eventType || "hit",
      ok: entry.ok !== false,
      status: entry.status ?? (entry.ok === false ? 400 : 202),
      message: entry.message || null,
      transport: entry.transport || "event",
      path: entry.path || null,
      eventId: entry.eventId || null,
      payload: summarizePayload(entry.payload),
    };

    hits.unshift(hit);
    while (hits.length > limit) hits.pop();
    notify(hit);
    return hit;
  }

  /** Normalized event from any adapter publish path. */
  function recordEvent(event, meta = {}) {
    return record({
      source: event?.source,
      type: event?.type,
      eventId: event?.id,
      timestamp: event?.timestamp,
      payload: event?.payload,
      ok: true,
      status: 202,
      transport: meta.transport || "adapter",
      path: meta.path || null,
      message: meta.message || "accepted",
    });
  }

  /** HTTP ingest attempt (success or failure). */
  function recordIngest({ adapterId, payload, result, path }) {
    return record({
      source: adapterId,
      type: payload?.eventType || payload?.type || result?.event?.type || "ingest",
      eventId: result?.event?.id,
      payload: result?.event?.payload || payload,
      ok: Boolean(result?.ok),
      status: result?.status ?? (result?.ok ? 202 : 400),
      message: result?.message || null,
      transport: "http",
      path: path || `/api/adapters/${adapterId}/ingest`,
    });
  }

  return {
    record,
    recordEvent,
    recordIngest,
    getRecent(limitN) {
      if (limitN == null) return [...hits];
      return hits.slice(0, Math.max(0, Number(limitN) || 50));
    },
    clear() {
      hits.length = 0;
    },
    onHit(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    size() {
      return hits.length;
    },
  };
}

module.exports = { createInputHitLog };
