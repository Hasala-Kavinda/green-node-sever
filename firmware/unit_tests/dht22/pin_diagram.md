# 🌡️ DHT22 (AM2302) Temperature & Humidity Sensor - Unit Test & Pin Diagram

## 📌 ESP32-C3 SuperMini Pin Configuration

The **DHT22** communicates using a single-wire digital protocol on **GPIO 3**.
This pin is completely separate from the soil moisture sensor pins (`GPIO 0`, `GPIO 1`, `GPIO 2`) and I2C pins (`GPIO 5`, `GPIO 6`).

```
             ┌───────────────────────┐
             │   ESP32-C3 SuperMini  │
             │                       │
      [5V] --│ 5V                 21 │-- 
     [GND] --│ GND                20 │-- 
    [3.3V] --│ 3V3                 9 │-- [BOOT button]
             │ GPIO 0              8 │-- [Onboard Blue LED]
             │ GPIO 1              7 │-- 
             │ GPIO 2              6 │-- 
  DHT22 DATA-│ GPIO 3              5 │-- 
             │ GPIO 4             10 │-- 
             │       [USB-C]         │
             └───────────────────────┘
```

---

## 🔌 Connection Table

| DHT22 Sensor Pin | ESP32-C3 SuperMini Pin | Description / Function |
|---|---|---|
| **VCC** (Pin 1) | **3V3** | 3.3V Power Rail |
| **DATA** (Pin 2) | **GPIO 3** | Digital bidirectional single-wire bus |
| **NC** (Pin 3) | *Not Connected* | No connection (on 4-pin raw sensor) |
| **GND** (Pin 4) | **GND** | Common ground rail |

> [!NOTE]
> If using a bare 4-pin DHT22 sensor (not a pre-soldered 3-pin module), place a **4.7kΩ to 10kΩ pull-up resistor** between `VCC (3.3V)` and `DATA (GPIO 3)`. Most 3-pin breakout modules already have this resistor integrated onboard.

---

## 📦 Required Arduino Libraries

In Arduino IDE (`Sketch -> Include Library -> Manage Libraries...`):
1. **DHT sensor library** by *Adafruit*
2. **Adafruit Unified Sensor** by *Adafruit*

---

## ⚙️ Board & Serial Settings (Arduino IDE)
* **Board**: `ESP32C3 Dev Module`
* **USB CDC On Boot**: `Enabled` ⚠️
* **Baud Rate**: `115200`
* **Flash Size**: `4MB`
