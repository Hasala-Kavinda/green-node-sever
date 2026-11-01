# 🌿 Master Multi-Sensor Integration - Pin Diagram & Setup

This guide documents the complete, non-conflicting pin mapping for the **ESP32-C3 SuperMini**, wiring all sensors simultaneously:
1. **MD0869** (Precision Reference Soil Moisture)
2. **FC-28** (Secondary Soil Moisture)
3. **DHT22 / AM2302** (Temperature & Humidity)
4. **BH1750** (Ambient Light Sensor in Lux)
5. **Onboard Blue LED** (Active Low status flasher)

---

## 📌 Master ESP32-C3 SuperMini Pin Configuration

```
                   ┌───────────────────────┐
                   │   ESP32-C3 SuperMini  │
                   │                       │
            [5V] --│ 5V                 21 │-- 
           [GND] --│ GND                20 │-- 
          [3.3V] --│ 3V3                 9 │-- [BOOT button]
 MD0869 AO (A0) ---│ GPIO 0              8 │-- [Onboard Blue LED]
  FC-28 AO (A0) ---│ GPIO 1              7 │-- 
Soil Power-Gate ---│ GPIO 2              6 │-- BH1750 SCL (I2C Clock)
DHT22 Data (D)  ---│ GPIO 3              5 │-- BH1750 SDA (I2C Data)
                   │ GPIO 4             10 │-- 
                   │       [USB-C]         │
                   └───────────────────────┘
```

---

## 🔌 Master Pin Connection Table

| Subsystem / Sensor | Sensor Pin | ESP32-C3 SuperMini Pin | Description / Purpose |
|---|---|---|---|
| **Power Rails** | 3.3V / VCC | **3V3** | Shared 3.3V rail (DHT22, BH1750) |
| **Power Rails** | GND | **GND** | Shared common ground rail |
| **MD0869 Soil** | AO (Analog Out) | **GPIO 0** | ADC1_CH0 (0–4095) Reference Soil Moisture |
| **FC-28 Soil** | AO (Analog Out) | **GPIO 1** | ADC1_CH1 (0–4095) Secondary Soil Moisture |
| **Soil Power Rail**| VCC (Both Soil) | **GPIO 2** | Gated power (turns ON only during read cycle) |
| **DHT22** | DATA | **GPIO 3** | Single-wire digital data bus |
| **BH1750** | SDA | **GPIO 5** | I2C Serial Data |
| **BH1750** | SCL | **GPIO 6** | I2C Serial Clock |
| **BH1750** | ADDR | **GND** | Sets default I2C address `0x23` |
| **Status LED** | Onboard | **GPIO 8** | Activity indicator (Active LOW) |

---

## 🛡️ Conflict-Free Pin Design Rationale

1. **ADC1 Exclusivity**:
   On ESP32 chips, ADC2 is disabled when WiFi is transmitting. By routing all analog signals (MD0869 and FC-28) strictly to **GPIO 0** (ADC1_CH0) and **GPIO 1** (ADC1_CH1), there are zero ADC/WiFi collisions.
2. **Dedicated I2C Bus**:
   BH1750 uses **GPIO 5** and **GPIO 6**, keeping GPIO 8 free for the onboard LED and avoiding GPIO 9 (boot strapping pin).
3. **Electrolysis Prevention**:
   Soil sensors are powered by **GPIO 2** instead of continuous 3.3V. Power is applied for only 80 ms per cycle and grounded for 120 ms to discharge capacitance, multiplying probe lifespan.

---

## 📦 Required Arduino Libraries

In Arduino IDE (`Sketch -> Include Library -> Manage Libraries...`):
1. **DHT sensor library** by *Adafruit*
2. **Adafruit Unified Sensor** by *Adafruit*
3. **BH1750** by *Christopher Laws*

---

## ⚙️ Arduino IDE Settings
* **Board**: `ESP32C3 Dev Module`
* **USB CDC On Boot**: `Enabled` ⚠️ *(Crucial for Serial.print over native USB-C)*
* **Upload Speed**: `921600`
* **Baud Rate**: `115200`
