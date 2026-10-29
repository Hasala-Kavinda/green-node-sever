# 🌿 ESP32-C3 Super Mini - Sensor & Health Probe Firmware

Tailored specifically for the ultra-compact **ESP32-C3 Super Mini** (RISC-V architecture).

---

## ⚠️ Important Changes for ESP32-C3

1. **No GPIO 34 or 35**: Classic ESP32 analog pins `34` and `35` do **not** exist on the ESP32-C3.
2. **WiFi + ADC Conflict Avoidance**: When WiFi is running on ESP32 chips, **ADC2 is unavailable**. Therefore, all analog sensors are routed to **ADC1** pins:
   * **Soil Moisture (FC-28)** $\rightarrow$ **GPIO 0** (ADC1_CH0)
   * **Light Sensor (LDR)** $\rightarrow$ **GPIO 1** (ADC1_CH1)
3. **DHT22 Digital Pin**:
   * **DHT22 Data** $\rightarrow$ **GPIO 3**
4. **Onboard Blue LED (GPIO 8)**:
   * Used for visual status: blinks during WiFi connection, flashes briefly upon sending telemetry or answering health pings.

---

## 📌 Wiring Diagram for ESP32-C3 Super Mini

```
             ┌───────────────────────┐
             │   ESP32-C3 SuperMini  │
             │                       │
      [5V] --│ 5V                 21 │-- 
     [GND] --│ GND                20 │-- 
    [3.3V] --│ 3V3                 9 │-- [BOOT button]
  Soil(A0) --│ GPIO 0              8 │-- [Onboard Blue LED]
   LDR(A0) --│ GPIO 1              7 │-- 
             │ GPIO 2              6 │-- 
  DHT22(D) --│ GPIO 3              5 │-- 
             │ GPIO 4             10 │-- 
             │       [USB-C]         │
             └───────────────────────┘
```

### Complete Pin Table

| Sensor / Module | Sensor Pin | ESP32-C3 Pin | Purpose |
|---|---|---|---|
| **Power** | 5V / VBUS | `5V` | Power input from USB or external 5V |
| **Power** | 3.3V | `3V3` | 3.3V sensor rail |
| **Ground** | GND | `GND` | Common ground rail |
| **FC-28 Soil Moisture** | A0 (Analog Out) | **GPIO 0** | ADC1_CH0 (0–4095) |
| **LDR Light Sensor** | Signal (Voltage divider) | **GPIO 1** | ADC1_CH1 (0–4095) |
| **DHT22 / AM2302** | DATA | **GPIO 3** | Digital I/O (Temp & Humidity) |
| **Onboard Blue LED** | - | **GPIO 8** | Status indicator (Active LOW) |

---

## ⚙️ Arduino IDE Settings for ESP32-C3 Super Mini

Under the **Tools** menu in Arduino IDE:

| Setting | Value | Why |
|---|---|---|
| **Board** | **`ESP32C3 Dev Module`** | Standard ESP32-C3 core |
| **USB CDC On Boot** | **`Enabled`** ⚠️ *(Crucial)* | Enables Serial.print() over the native USB-C port |
| **CPU Frequency** | `160MHz (WiFi)` | Maximum performance |
| **Flash Size** | `4MB (32Mb)` | Standard flash size |
| **Upload Speed** | `921600` | Fast flashing |
| **Port** | Select the recognized COM/ttyACM port | |

*(If you don't see Serial output in the Serial Monitor, ensure **USB CDC On Boot** is set to **Enabled** and re-flash).*

---

## 📦 Required Arduino Libraries

In Arduino IDE (`Sketch -> Include Library -> Manage Libraries...`):
1. **DHT sensor library** by *Adafruit*
2. **Adafruit Unified Sensor** by *Adafruit*
*(WiFi, WebServer, and HTTPClient are built into the ESP32 Core).*
