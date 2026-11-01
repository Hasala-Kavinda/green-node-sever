# 🌿 Green Node — Production Firmware

This directory contains the production-ready telemetry firmware for the **ESP32-C3 SuperMini**. Each sketch connects to Wi-Fi, acquires all sensor data, synchronises time from NTP (Sri Lanka Standard Time UTC+5:30), and POSTs an encrypted JSON payload via HTTPS to the Green Node cloud backend on Render.

Two standalone editions are provided — select the one matching the soil sensor physically wired to your node:

| Edition | Soil Sensor | Soil Pin | Sketch |
|---|---|---|---|
| **FC-28 Edition** | FC-28 Standard Probe | GPIO 1 (ADC1_CH1) | [`fc28_production/`](./fc28_production/) |
| **MD0869 Edition** | MD0869 Reference Probe | GPIO 0 (ADC1_CH0) | [`md0869_production/`](./md0869_production/) |

---

## ⚠️ Brownout Protection (Critical — Read Before Flashing)

The ESP32-C3 SuperMini's onboard LDO regulator has a limited continuous current budget (~150–300 mA). Wi-Fi RF bursts at the default TX power (+20 dBm) can draw 350–500 mA spikes, dropping the 3.3 V rail below the brownout threshold and causing **random hardware resets**.

Both sketches enforce two hardware-level protections:

1. **Wi-Fi TX power is capped at 11 dBm** via `WiFi.setTxPower(WIFI_POWER_11dBm)` applied safely after `WiFi.begin()`. This keeps peak RF current below 180 mA while maintaining full greenhouse/room coverage.
2. **The soil probe is fully de-energised and discharged before any HTTP transmission.** ADC sampling and Wi-Fi TX are strictly separated in time — they never run concurrently.

> [!CAUTION]
> Never set `WIFI_TX_POWER` higher than `WIFI_POWER_11dBm` on an ESP32-C3 SuperMini powered by USB or a small LDO. Doing so will cause intermittent brownout resets.

---

## 🗂️ Code Architecture & Production Hardening

Each sketch is structured into modular sections with production-grade embedded safeguards:

* **Zero-Heap Telemetry**: Uses static fixed buffers (`char wifiSsid[33]`, `char timestamp[25]`) instead of heap-allocated `String` objects, preventing memory fragmentation over weeks of continuous operation.
* **Pure Math Rounding**: Uses `roundToDp(float, int)` to output clean numbers into JSON without string conversions.
* **TLS / HTTPS Security**: Uses `WiFiClientSecure` with `.setInsecure()` to communicate over HTTPS with Render without requiring large root CA certificate bundles in flash memory.
* **Non-Blocking Scheduler**: `loop()` operates via drift-free `millis()` interval timing, allowing FreeRTOS background tasks and Wi-Fi keep-alives to process without blocking.
* **Epoch Sanity Guard**: Verifies NTP clock sync against a timestamp threshold (`MIN_VALID_EPOCH = 1700000000`) before emitting the ISO-8601 UTC timestamp. If not synced yet, the timestamp is omitted and the backend server timestamps the record upon reception.
* **USB-CDC Handshake**: Built-in 3-second handshake so opening the Serial Monitor immediately displays the boot diagnostics.

---

## ⚙️ User Configuration Reference (Section 1)

All values an operator or editor would ever need to change are isolated in **Section 1** of each sketch. No other section needs to be touched for standard deployment.

### 1A — Network & Backend
| Constant | Default | Description |
|---|---|---|
| `WIFI_SSID` | `"Malith's A55"` | Wi-Fi network name |
| `WIFI_PASSWORD` | `"malith26"` | Wi-Fi password |
| `BACKEND_URL` | `"https://blue-circle.onrender.com/api/readings"` | Production Render HTTPS endpoint |
| `DEVICE_ID` | `"a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"` | Registered Device UUID |

### 1B — Timing & Telemetry Intervals
| Constant | Default | Description |
|---|---|---|
| `REFRESH_INTERVAL_MS` | `10000` | Telemetry transmission interval (10 seconds) |
| `WIFI_TIMEOUT_MS` | `15000` | Max wait for Wi-Fi association (15 seconds) |
| `HTTP_TIMEOUT_MS` | `12000` | HTTPS request timeout (allows for TLS handshake + Render routing) |

### 1C — NTP Time Service (Sri Lanka Standard Time)
| Constant | Default | Description |
|---|---|---|
| `NTP_SERVER_PRIMARY` | `"pool.ntp.org"` | Primary NTP server |
| `NTP_SERVER_FALLBACK` | `"time.google.com"` | Secondary NTP server |
| `GMT_OFFSET_SEC` | `19800` | UTC+5:30 (`5.5 × 3600 = 19800` seconds) |
| `DAYLIGHT_OFFSET_SEC` | `0` | Sri Lanka has no Daylight Saving Time |

### 1D — Soil Sensor Timing & ADC Calibration
*(Constants differ between FC-28 and MD0869 editions.)*

| Constant | FC-28 Edition | MD0869 Edition | Description |
|---|---|---|---|
| `SETTLE_MS` | `20` | `80` | ms after probe power-on before ADC sampling |
| `RESET_MS` | `40` | `120` | ms after probe power-off for probe discharge |
| `DRY_ADC` | `400` | `400` | Raw ADC at 0 % moisture |
| `WET_ADC` | `4095` | `4058` | Raw ADC at 100 % moisture |
| `ADC_SAMPLE_COUNT` | `16` | `16` | Oversampling count per read cycle |

> **Linear Calibration Constants ($y = ax + b$)**:
> ```cpp
> const float FC28_CAL_A = 0.0f;  // Slope 'a' — set from calibration run
> const float FC28_CAL_B = 0.0f;  // Intercept 'b' — set from calibration run
> ```
> Default initial values are `0.0f` (uncalibrated: passes through raw ADC directly). Update with your derived linear coefficients when ready.

---

## 📡 JSON Telemetry Payload

Sent via `POST https://blue-circle.onrender.com/api/readings`:

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

---

## 🔌 Hardware Wiring Guide

```
                   ┌───────────────────────┐
                   │   ESP32-C3 SuperMini  │
                   │                       │
            [5V] --│ 5V                 21 │-- GPIO 21
    [Common GND] --│ GND                20 │-- GPIO 20
      [3.3V Rail]--│ 3V3                 9 │-- GPIO 9 [BOOT button]
 MD0869 AO (Ref) --│ GPIO 0              8 │-- GPIO 8 [Onboard Blue LED]
   FC-28 AO (Sec)--│ GPIO 1              7 │-- GPIO 7
Soil Power-Gate ---│ GPIO 2              6 │-- GPIO 6 ──► BH1750 SCL (I2C Clock)
   DHT22 Data (D)--│ GPIO 3              5 │-- GPIO 5 ──► BH1750 SDA (I2C Data)
                   │ GPIO 4             10 │-- GPIO 10
                   │       [USB-C]         │
                   └───────────────────────┘
```

### Pin Connection Summary

| Component | Sensor Pin | ESP32-C3 Pin | Notes |
|---|---|---|---|
| **Soil AO** | AO | **GPIO 1** (FC-28) or **GPIO 0** (MD0869) | ADC1 channel — safe during active Wi-Fi |
| **Soil Power** | VCC | **GPIO 2** | Power-gated (active HIGH during reading only) |
| **DHT22** | DATA | **GPIO 3** | Single-wire digital data |
| **BH1750** | SDA | **GPIO 5** | Hardware I2C SDA |
| **BH1750** | SCL | **GPIO 6** | Hardware I2C SCL |
| **BH1750** | ADDR | **GND** (or float) | Sets default address `0x23` |
| **Power** | VCC | **3V3** | Shared 3.3V rail |
| **Ground** | GND | **GND** | Shared common ground rail |

---

## 📦 Required Libraries

Install via Arduino IDE Library Manager (`Ctrl+Shift+I`):
1. **`ArduinoJson`** by *Benoît Blanchon*
2. **`DHT sensor library`** by *Adafruit*
3. **`Adafruit Unified Sensor`** by *Adafruit*
4. **`BH1750`** by *Christopher Laws*
*(WiFi, WiFiClientSecure, HTTPClient, Wire, and time are built into the ESP32 Core).*

---

## 🛠️ Arduino IDE Board Settings

| Setting | Value |
|---|---|
| **Board** | `ESP32C3 Dev Module` |
| **USB CDC On Boot** | `Enabled` ⚠️ *(Crucial for Serial Monitor)* |
| **CPU Frequency** | `160 MHz (WiFi)` |
| **Flash Size** | `4MB (32Mb)` |
| **Baud Rate** | `115200` |
