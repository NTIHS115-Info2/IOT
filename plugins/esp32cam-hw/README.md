# esp32cam-hw Plugin

提供 ESP32-CAM + OV2640 + IR + MG90S x2 的 LLM 工具插件。

## 功能
- 由模型指令觸發拍照並回傳影像資料。
- Pan/Tilt 伺服馬達順時針/逆時針旋轉（支援步數或持續時間微調）。
- IR 接收（start/stop/last）與 IR 發射（協定或 raw pulses）。
- Mock 模式，無硬體也可測試。

## 硬體接線與供電注意事項
- **電源**：120V → HLK-PM01 → 5V 輸出。
- **伺服與 ESP32-CAM 必須共地**，但**伺服電源請獨立供電**，避免雜訊與壓降導致 brownout。
- 建議在伺服與相機附近加 **470–1000µF** 電容作為濾波。
- IR receiver/emitter 請使用穩定 5V，必要時以電晶體/驅動模組輸出。
- 若出現重啟或畫面卡頓，請優先檢查供電與電容。

## ESP32-CAM API 規格（最小可用）
插件預期 ESP32-CAM 端提供以下 HTTP 端點：

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

### Camera Capture
- **GET** `/api/camera/capture`
  - **Response**:
    ```json
    {
      "mime": "image/jpeg",
      "imageBase64": "...",
      "capturedAt": "2024-01-01T00:00:00.000Z"
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
  - `step` 或 `ms` 可選擇使用其一。

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

## 插件使用方式

### 初始化
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

### Mock 模式
```js
await plugin.updateStrategy({ mode: "mock" });
await plugin.online();
```

### 模型 JSON 工具呼叫範例
LLM 以 JSON 指令嵌入於 Prompt，系統解析後轉交插件執行。

#### 觸發拍照回傳影像
```json
{
  "tool": "camera.capture",
  "params": {}
}
```

#### 旋轉 Pan CW 與 Tilt CCW
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

#### IR 接收 → 讀取 Last → 發射
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

## 測試
### 本地測試腳本
```bash
node plugins/esp32cam-hw/scripts/test-local.js
```

### Curl 範例
```bash
curl http://192.168.1.50/api/status
curl http://192.168.1.50/api/camera/capture
curl -X POST http://192.168.1.50/api/servo \
  -H 'content-type: application/json' \
  -d '{"axis":"pan","dir":"cw","step":2}'
```

## 常見問題
- **無法連線**：確認 baseURL、同網段與防火牆設定。
- **拍照回傳失敗**：確認 `/api/camera/capture` 是否正確實作並輸出 JSON。
- **IR 接收失敗**：確認 1838 接線與 GPIO 設定。
- **伺服抖動或重啟**：分離供電、加電容、共地即可。

## Assumptions
- ESP32-CAM 韌體實作上述 API 端點。
- 系統會以 `send()` 傳遞工具 payload。
