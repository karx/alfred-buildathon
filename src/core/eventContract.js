const crypto = require("crypto");

const VALID_SOURCES = new Set(["vault", "slack", "discord", "arduino-in", "granola"]);

function createEventId(prefix = "evt") {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

function createNormalizedEvent({ source, type, payload = {}, timestamp = new Date().toISOString(), id }) {
  return {
    id: id || createEventId(),
    source,
    type,
    timestamp,
    payload,
  };
}

function validateNormalizedEvent(event) {
  const errors = [];

  if (!event || typeof event !== "object") errors.push("event must be an object");
  if (!event?.id || typeof event.id !== "string") errors.push("event.id must be a string");
  if (!event?.source || typeof event.source !== "string") errors.push("event.source must be a string");
  if (event?.source && !VALID_SOURCES.has(event.source)) errors.push(`unsupported event.source: ${event.source}`);
  if (!event?.type || typeof event.type !== "string") errors.push("event.type must be a string");
  if (!event?.timestamp || Number.isNaN(Date.parse(event.timestamp))) errors.push("event.timestamp must be ISO parseable");
  if (!event?.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) errors.push("event.payload must be an object");

  return {
    ok: errors.length === 0,
    errors,
  };
}

module.exports = {
  VALID_SOURCES,
  createEventId,
  createNormalizedEvent,
  validateNormalizedEvent,
};
