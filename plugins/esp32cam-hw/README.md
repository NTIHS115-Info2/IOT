# esp32cam-hw Plugin

ESP32-CAM + OV2640 + IR + MG90S x2 plugin for LLM tool calls.

## Features
- Camera MJPEG stream URL discovery.
- Pan/Tilt servo rotation with cw/ccw and optional micro-steps/duration.
- IR receive (start/stop/last) and IR send (protocol or raw pulses).
- Mock mode for local development (no hardware required).

## Hardware Wiring & Power Notes
- **Power supply**: 120V → HLK-PM01 → 5V output.
- **Servos and ESP32-CAM must share GND**, but **servo power should be isolated** from ESP32-CAM 5V rail to reduce noise and brownout risk.
- Add **bulk capacitors** (e.g., 470–1000µF) near servos and camera module.
- Keep IR receiver and emitter power clean; route IR emitter from a transistor/driver if needed.
- If you observe resets or camera dropouts, add more filtering or a dedicated 5V regulator for servos.

## ESP32-CAM API Spec (Minimal)
The plugin expects the ESP32-CAM to expose the following HTTP endpoints:

### Status
- **GET** `/api/status`
  - **Response**:
    ```json
    {
      "connected": true,
      "uptime": 12345,
      "temperatureC": 36.5,
      "voltageV": 4.95,
      "lastError": null
    }
    ```

### Servo
- **POST** `/api/servo`
  - **Body**:
    ```json
    {
      "axis": "pan",
      "dir": "cw",
      "step": 1,
      "ms": 120
    }
    ```
  - `step` or `ms` are optional; firmware can use either pulse count or duration.

### IR Send
- **POST** `/api/ir/send`
  - **Body**:
    ```json
    {
      "format": "nec",
      "value": 551502255,
      "bits": 32
    }
    ```
  - **Raw**:
    ```json
    {
      "format": "raw",
      "raw": [9000, 4500, 560, 560, 560, 1690]
    }
    ```

### IR Receive
- **POST** `/api/ir/receive/start`
- **POST** `/api/ir/receive/stop`
- **GET** `/api/ir/last`
  - **Response**:
    ```json
    {
      "format": "nec",
      "value": 551502255,
      "bits": 32,
      "raw": [9000, 4500, 560, 560, 560, 1690],
      "receivedAt": "2024-01-01T00:00:00.000Z"
    }
    ```

### Camera Stream
- **GET** `/stream` (MJPEG)

## Plugin Usage

### Initialization
```js
const plugin = require("./plugins/esp32cam-hw");

await plugin.updateStrategy({
  mode: "real",
  baseURL: "http://192.168.1.50",
  timeoutMs: 4000,
  retries: 2,
  retryDelayMs: 300
});

await plugin.online();
```

### Mock Mode
```js
await plugin.updateStrategy({ mode: "mock" });
await plugin.online();
```

### Model JSON Tool Invocation Examples
The LLM embeds JSON instructions that the system routes to this plugin. Example:

#### Get Camera Stream URL
```json
{
  "tool": "camera.stream_url_get",
  "params": {}
}
```

#### Rotate Pan CW and Tilt CCW
```json
{
  "tool": "servo.rotate",
  "params": { "axis": "pan", "dir": "cw", "step": 2 }
}
```
```json
{
  "tool": "servo.rotate",
  "params": { "axis": "tilt", "dir": "ccw", "ms": 150 }
}
```

#### IR Receive → Read Last → Send
```json
{
  "tool": "ir.receive",
  "params": { "action": "start" }
}
```
```json
{
  "tool": "ir.receive",
  "params": { "action": "last" }
}
```
```json
{
  "tool": "ir.send",
  "params": { "format": "nec", "value": 551502255, "bits": 32 }
}
```

## Testing
### Local Test Script
```bash
node plugins/esp32cam-hw/scripts/test-local.js
```

### Curl Examples
```bash
curl http://192.168.1.50/api/status
curl -X POST http://192.168.1.50/api/servo \
  -H 'content-type: application/json' \
  -d '{"axis":"pan","dir":"cw","step":2}'
```

## FAQ
- **Cannot connect to ESP32-CAM**: check baseURL, same subnet, and firewall rules.
- **Stream is choppy**: reduce frame size/quality in firmware or ensure Wi-Fi RSSI is strong.
- **IR receive not working**: confirm 1838 wiring and that the firmware uses correct GPIO.
- **Servo jitter/brownout**: isolate servo power, add capacitors, and share GND only.

## Assumptions
- The ESP32-CAM firmware implements the API endpoints exactly as defined above.
- The plugin runtime will provide the LLM tool payloads via `send()`.
- MJPEG stream is reachable at `/stream` with no authentication.
