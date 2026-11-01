# 🌿 Green Node — Production Firmware

This directory contains the production-ready telemetry firmware for the **ESP32-C3 SuperMini**. Each sketch connects to Wi-Fi, acquires all sensor data, synchronises time from NTP (Sri Lanka Standard Time), and POSTs a structured JSON payload to the Green Node backend on every cycle.

Two standalone editions are provided — select the one matching the soil sensor physically wired to your node:

| Edition | Soil Sensor | Soil Pin | Sketch |
|---|---|---|---|
| **FC-28 Edition** | FC-28 Standard Probe | GPIO 1 (ADC1_CH1) | [`fc28_production/`](./fc28_production/) |
| **MD0869 Edition** | MD0869 Reference Probe | GPIO 0 (ADC1_CH0) | [`md0869_production/`](./md0869_production/) |

---

## ⚠️ Brownout Protection (Critical — Read Before Flashing)

The ESP32-C3 SuperMini's onboard LDO regulator has a limited continuous current budget (~150–300 mA). Wi-Fi RF bursts at the default TX power (+20 dBm) can draw 350–500 mA spikes, dropping the 3.3 V rail below the brownout threshold and causing **random hardware resets**.

Both sketches enforce two hardware-level protections:

1. **Wi-Fi TX power is capped at 11 dBm** via `WiFi.setTxPower(WIFI_POWER_11dBm)`. This keeps peak RF current below 180 mA while maintaining full greenhouse/room range (~20–30 m).
2. **The soil probe is fully de-energised and discharged before any HTTP transmission.** ADC sampling and Wi-Fi TX are always separated in time — they never overlap within the same cycle.

> [!CAUTION]
> Never set `WIFI_TX_POWER` higher than `WIFI_POWER_11dBm` on an ESP32-C3 SuperMini powered by USB or a small LDO. Doing so will cause intermittent brownout resets.

---

## 🗂️ Code Architecture

Each sketch is structured into **13 clearly numbered sections** so any editor can navigate or change any component in isolation:

| Section | Contents |
|---|---|
| **1 — Libraries** | All `#include` headers |
| **2 — User Configuration** | All tunable constants (credentials, timing, thresholds, calibration) |
| **3 — Pin Assignments** | GPIO constants — only change if hardware is rewired |
| **4 — Sensor Instances** | `DHT` and `BH1750` object declarations |
| **5 — Data Model** | `struct SensorReading` — single data container passed between functions |
| **6 — Utility Functions** | LED pulse, lux classifier, RSSI classifier |
| **7 — Wi-Fi Module** | `connectToWiFi()`, `ensureWiFiConnected()` |
| **8 — Time Module** | `synchroniseNtp()`, `getIso8601Timestamp()` |
| **9 — Sensor Modules** | One function per sensor driver |
| **10 — Telemetry POST** | JSON build + HTTP POST |
| **11 — Serial Report** | Formatted dashboard output |
| **12 — `setup()`** | System initialisation |
| **13 — `loop()`** | Main execution cycle |

---

## ⚙️ User Configuration Reference (Section 2)

All values an operator or editor would ever need to change are isolated in **Section 2** of each sketch. No other section needs to be touched for standard deployment.

### 2A — Network & Backend
| Constant | Default | Description |
|---|---|---|
| `WIFI_SSID` | `"Malith's A55"` | Wi-Fi network name |
| `WIFI_PASSWORD` | `"malith26"` | Wi-Fi password |
| `BACKEND_URL` | `https://<your-render-app>.onrender.com/api/readings` | Full backend POST endpoint |
| `DEVICE_ID` | `"a0eebc99-..."` | Device UUID (must match backend device registration) |

### 2B — Wi-Fi & Brownout Protection
| Constant | Default | Description |
|---|---|---|
| `WIFI_TX_POWER` | `WIFI_POWER_11dBm` | RF TX power cap — do not raise on SuperMini |
| `WIFI_TIMEOUT_MS` | `20000` | Max ms to wait for Wi-Fi association |
| `HTTP_TIMEOUT_MS` | `8000` | Max ms to wait for HTTP response (accounts for Render cold-start) |

### 2C — Telemetry Interval
| Constant | Default | Description |
|---|---|---|
| `TELEMETRY_INTERVAL_MS` | `15000` | ms between successive POST requests (15 s minimum for free Render tier) |

### 2D — NTP / Time
| Constant | Default | Description |
|---|---|---|
| `NTP_PRIMARY` | `"pool.ntp.org"` | Primary NTP server |
| `NTP_FALLBACK` | `"time.google.com"` | Secondary NTP server |
| `GMT_OFFSET_SEC` | `19800` | UTC+5:30 → `5×3600 + 30×60 = 19800` s |
| `DAYLIGHT_OFFSET` | `0` | Sri Lanka has no DST |
| `NTP_SYNC_TIMEOUT_MS` | `10000` | Max ms to wait for first NTP sync on boot |

### 2E — Soil Sensor Timing & ADC Endpoints
*(Constants differ between FC-28 and MD0869 editions.)*

| Constant | FC-28 | MD0869 | Description |
|---|---|---|---|
| `SETTLE_MS` | `20` | `80` | ms after probe power-on before sampling (RC filter settle) |
| `RESET_MS` | `40` | `120` | ms after probe power-off for probe discharge |
| `DRY_RAW_ADC` | `400` | `400` | Raw ADC at 0 % moisture (dry air) |
| `WET_RAW_ADC` | `4095` | `4058` | Raw ADC at 100 % moisture (saturated water) |
| `ADC_SAMPLES` | `16` | `16` | Oversampling count per read cycle |

> **FC-28 only** — Linear calibration constants (Section 2E):
> ```cpp
> const float FC28_CAL_A = 0.0f;  // Slope 'a' — set from your calibration run
> const float FC28_CAL_B = 0.0f;  // Intercept 'b' — set from your calibration run
> ```
> When both are `0.0` (default), raw ADC passes through unchanged.

### 2F–2H — Sensor Validation Bounds
| Constant | Default | Description |
|---|---|---|
| `DHT22_TEMP_MIN / MAX` | `-40 / 80 °C` | Discard DHT22 readings outside this range |
| `DHT22_HUM_MIN / MAX` | `0 / 100 %RH` | Discard DHT22 humidity outside this range |
| `BH1750_LUX_MIN` | `0.0 lx` | Discard negative BH1750 sentinel values |
| `ESP_TEMP_MIN / MAX` | `-40 / 125 °C` | Discard internal die temp outside rated range |

---

## 📡 JSON Payload Sent to Backend

```json
{
  "deviceId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "temperature": 24.50,
  "humidity": 62.30,
  "soilMoisture": 48.7,
  "light": 420.5,
  "espTemperature": 39.25,
  "wifiSsid": "Greenhouse_IoT_2.4G",
  "timestamp": "2026-11-02T01:50:43Z",
  "metadata": {
    "chip": "esp32-c3-supermini",
    "rssi": -62,
    "soilRaw": 2180
  }
}
```

- `timestamp` is a UTC ISO 8601 string derived from the NTP-synced local SLST clock.  
- If NTP has not yet synced on boot, `timestamp` is **omitted** — the backend schema automatically falls back to the server reception time.
- All numeric fields are serialised with fixed decimal precision matching the backend `z.number()` schema.

---

## 🔌 Hardware Wiring

### FC-28 Edition
| Sensor / Component | Pin | ESP32-C3 GPIO | Notes |
|---|---|---|---|
| FC-28 Soil | AO | GPIO 1 | ADC1_CH1 — safe with Wi-Fi active |
| FC-28 Soil | VCC | GPIO 2 | Power-gated (active HIGH during read only) |
| FC-28 Soil | GND | GND | System ground |
| DHT22 | DATA | GPIO 3 | 10 kΩ pull-up recommended |
| DHT22 | VCC / GND | 3V3 / GND | Continuous power |
| BH1750 | SDA / SCL | GPIO 5 / GPIO 6 | Hardware I2C |
| BH1750 | VCC / GND | 3V3 / GND | Continuous power |
| Status LED | Onboard | GPIO 8 | Active LOW — built-in |

### MD0869 Edition
| Sensor / Component | Pin | ESP32-C3 GPIO | Notes |
|---|---|---|---|
| MD0869 Soil | AO | GPIO 0 | ADC1_CH0 — safe with Wi-Fi active |
| MD0869 Soil | VCC | GPIO 2 | Power-gated (active HIGH during read only) |
| MD0869 Soil | GND | GND | System ground |
| DHT22 | DATA | GPIO 3 | 10 kΩ pull-up recommended |
| DHT22 | VCC / GND | 3V3 / GND | Continuous power |
| BH1750 | SDA / SCL | GPIO 5 / GPIO 6 | Hardware I2C |
| BH1750 | VCC / GND | 3V3 / GND | Continuous power |
| Status LED | Onboard | GPIO 8 | Active LOW — built-in |

---

## 📦 Required Libraries (Arduino IDE Library Manager)

| Library | Author | Used For |
|---|---|---|
| `ArduinoJson` | Benoît Blanchon | JSON serialisation |
| `DHT sensor library` | Adafruit | DHT22 driver |
| `Adafruit Unified Sensor` | Adafruit | DHT22 dependency |
| `BH1750` | Christopher Laws | BH1750 I2C driver |

`WiFi`, `HTTPClient`, `Wire`, and `time` are part of the ESP32 Arduino core — no separate installation needed.

---

## 🛠️ Arduino IDE Settings

| Setting | Value |
|---|---|
| **Board** | `ESP32C3 Dev Module` |
| **USB CDC On Boot** | `Enabled` ⚠️ *(Required for Serial Monitor over USB-C)* |
| **CPU Frequency** | `160 MHz (WiFi)` |
| **Flash Size** | `4MB (32Mb)` |
| **Baud Rate** | `115200` |
