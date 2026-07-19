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
