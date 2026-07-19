# Arduino Firmware — Alfred Hardware Client

## Hardware

- Arduino with WiFi (ESP32 / MKR WiFi 1010 / Nano 33 IoT)
- Small OLED or LCD display (I2C, e.g. SSD1306 128x32 or 16x2 LCD)
- RGB LED or 3 separate LEDs (green / yellow / red / blue)
- Buzzer (passive or active, single pin)

## State Schema

Alfred exposes `GET http://<ALFRED_IP>:3737/api/state` returning:

```json
{
  "led": "green | yellow | red | blue",
  "display": "text up to 20 chars",
  "buzzer": false,
  "nudgeId": "n_abc123 | null",
  "nudgeText": "active nudge text | null",
  "nudgeCount": 0,
  "processingStatus": "idle | processing",
  "lastUpdatedAt": "2026-07-19T10:00:00Z"
}
```

Idle `display` (no nudge / not processing / not meeting) is a rotating greeting:

```txt
Good Morning - hey
Good Day - ship it
Good Evening - rest
```

Sticky for ~5 minutes so rapid polls do not flicker.

When `nudgeId` is non-null (and usually `led` is red), a physical ACK button should POST:

```
POST /api/adapters/arduino-in/ingest
{ "eventType": "nudge-ack", "response": "acknowledged" }
```

Omit `nudgeId` to clear the currently displayed nudge. Optionally pass `"nudgeId": "<from /api/state>"`.

## LED Mapping

| LED color | Alfred state            |
|-----------|-------------------------|
| Green     | Idle, no nudges         |
| Yellow    | Processing (pulsing)    |
| Red       | Active nudge pending    |
| Blue      | User in meeting         |

## Pseudocode

```
CONSTANTS:
  ALFRED_IP   = "192.168.x.x"   // your Mac's local IP
  ALFRED_PORT = 3737
  POLL_MS     = 3000
  SSID        = "your-wifi"
  PASSWORD    = "your-password"

STATE:
  prev_led    = ""
  prev_buzzer = false

SETUP:
  wifi.connect(SSID, PASSWORD)
  while not wifi.connected: wait(500ms)

  display.init()
  display.show("Alfred ready")

  led.set("green")
  buzzer.off()

LOOP:
  response = http_get(ALFRED_IP, ALFRED_PORT, "/api/state")

  if response.error:
    display.show("No Alfred conn")
    led.set("red")
    wait(POLL_MS)
    continue

  state = json.parse(response.body)

  // Update display
  display.clear()
  display.show(state.display)

  // Update LED
  if state.led == "yellow":
    led.pulse("yellow")         // blink on/off 500ms
  else:
    led.set(state.led)          // solid color

  // Buzzer: fire only on new nudge (state transition to buzzer=true)
  if state.buzzer == true and prev_buzzer == false:
    buzzer.beep(frequency=1000, duration_ms=200)
    wait(100ms)
    buzzer.beep(frequency=1200, duration_ms=150)

  prev_led    = state.led
  prev_buzzer = state.buzzer

  wait(POLL_MS)

// ── HTTP GET helper ─────────────────────────────────────────────

FUNCTION http_get(host, port, path):
  client = WiFiClient()
  if not client.connect(host, port):
    return { error: "connect failed" }

  client.send("GET " + path + " HTTP/1.0\r\n")
  client.send("Host: " + host + "\r\n")
  client.send("Connection: close\r\n\r\n")

  // Skip headers
  while client.has_line():
    line = client.read_line()
    if line == "\r\n": break

  body = client.read_all()
  client.close()
  return { body: body }

// ── LED helper ──────────────────────────────────────────────────

FUNCTION led.set(color):
  // Map color to pin states
  // green  → R=0 G=1 B=0
  // yellow → R=1 G=1 B=0
  // red    → R=1 G=0 B=0
  // blue   → R=0 G=0 B=1
  digitalWrite(PIN_R, color in ["red","yellow"])
  digitalWrite(PIN_G, color in ["green","yellow"])
  digitalWrite(PIN_B, color == "blue")

FUNCTION led.pulse(color):
  // Called once per loop, toggles on LED_PULSE_INTERVAL
  if millis() % 1000 < 500:
    led.set(color)
  else:
    led.off()
```

## Arduino POST (ingest endpoint)

For sending hardware events TO Alfred (button presses etc.):

```
POST http://<ALFRED_IP>:3737/api/adapters/arduino-in/ingest
Headers:
  Content-Type: application/json
  x-alfred-secret: <sharedSecret>
Body:
  { "eventType": "button", "button": "sparring", "state": "pressed" }
```

### Nudge ACK (active State API nudge)

```
// Preferred — acks whatever /api/state is showing
{ "eventType": "nudge-ack", "response": "acknowledged" }

// Physical button alias
{ "eventType": "button", "button": "nudge-ack", "state": "pressed" }

// Explicit id from last GET /api/state
{ "eventType": "nudge-ack", "nudgeId": "n_abc123", "response": "acknowledged" }
```

## Setup Steps

1. Install libraries: `WiFi`, `HTTPClient`, `ArduinoJson`, display driver
2. Set `ALFRED_IP` to your Mac's local IP (`ifconfig | grep inet`)
3. Set `SSID` / `PASSWORD`
4. Flash and open Serial Monitor — confirm WiFi connection
5. Alfred must be running: `npm start` in `~/kaaro/src/alfred-buildathon`

---

## Physical verification checklist

Automated coverage: `test/inputs/arduinoSimE2e.test.js` + `test/contract/stateApiContract.test.js`.
Run the same cases against a live desk controller when hardware is on the desk.
Assume Alfred is at `http://<ALFRED_IP>:3737` and Arduino In is connected with shared secret `dev-secret` (or your Settings value).

```bash
export ALFRED=http://127.0.0.1:3737
export SECRET=dev-secret   # match Settings → Arduino In sharedSecret

# Helper: project fields the firmware reads
curl -s "$ALFRED/api/state" | jq '{led,display,buzzer,nudgeId,nudgeText,nudgeCount,processingStatus}'
```

### Cases (mirror of sim e2e)

1. **audio-in** — ingest only; state stays idle green  
   ```bash
   curl -s -X POST "$ALFRED/api/adapters/arduino-in/ingest" \
     -H "Content-Type: application/json" -H "x-alfred-secret: $SECRET" \
     -d '{"eventType":"audio-in","source":"desk-mic","transcript":"hello","confidence":0.9}'
   curl -s "$ALFRED/api/state" | jq '{led,nudgeCount,processingStatus}'
   # expect: led=green, nudgeCount=0, processingStatus=idle
   ```

2. **mode-toggle** — control-plane event; projection unchanged  
   ```bash
   curl -s -X POST "$ALFRED/api/adapters/arduino-in/ingest" \
     -H "Content-Type: application/json" -H "x-alfred-secret: $SECRET" \
     -d '{"eventType":"mode-toggle","mode":"sparring","enabled":true}'
   ```

3. **nudge-fabricate** — LED red, display/nudgeText set, buzzer true; second poll still shows nudge  
   ```bash
   curl -s -X POST "$ALFRED/api/adapters/arduino-in/ingest" \
     -H "Content-Type: application/json" -H "x-alfred-secret: $SECRET" \
     -d '{"eventType":"nudge-fabricate","scenario":"buzzer","replace":true}'
   curl -s "$ALFRED/api/state" | jq '{led,display,buzzer,nudgeId,nudgeCount}'
   # expect: led=red, buzzer=true, nudgeId set, display ≤20 chars
   # firmware should chirp once on buzzer rising edge
   ```

4. **nudge-ack without nudgeId** — clears active display nudge  
   ```bash
   curl -s -X POST "$ALFRED/api/adapters/arduino-in/ingest" \
     -H "Content-Type: application/json" -H "x-alfred-secret: $SECRET" \
     -d '{"eventType":"nudge-ack","response":"acknowledged"}'
   curl -s "$ALFRED/api/state" | jq '{led,buzzer,nudgeId,nudgeCount}'
   # expect: led=green, buzzer=false, nudgeId=null, nudgeCount=0
   ```

5. **nudge-ack with nudgeId** — acks explicit id (leave another nudge active if testing multi-nudge)  
   ```bash
   NUDGE_ID=$(curl -s "$ALFRED/api/state" | jq -r .nudgeId)
   curl -s -X POST "$ALFRED/api/adapters/arduino-in/ingest" \
     -H "Content-Type: application/json" -H "x-alfred-secret: $SECRET" \
     -d "{\"eventType\":\"nudge-ack\",\"nudgeId\":\"$NUDGE_ID\",\"response\":\"acknowledged\"}"
   ```

6. **button (sparring)** — ingest accepted; no hardware projection change  
   ```bash
   curl -s -X POST "$ALFRED/api/adapters/arduino-in/ingest" \
     -H "Content-Type: application/json" -H "x-alfred-secret: $SECRET" \
     -d '{"eventType":"button","button":"sparring","state":"pressed"}'
   ```

7. **custom-template** — ingest accepted; idle state  
   ```bash
   curl -s -X POST "$ALFRED/api/adapters/arduino-in/ingest" \
     -H "Content-Type: application/json" -H "x-alfred-secret: $SECRET" \
     -d '{"eventType":"custom-template","name":"example","value":true}'
   ```

### Physical-only checks

- [ ] OLED shows `display` text (≤20) matching `/api/state`
- [ ] LED color matches `led` (green idle / red nudge / blue meeting)
- [ ] Buzzer chirps only on rising edge of `buzzer` (new nudge), not every poll
- [ ] Physical ACK button POSTs `nudge-ack` (or `button` + `nudge-ack`) and clears display
- [ ] Shared secret mismatch returns 401 (firmware should log / ignore)
