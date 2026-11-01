# 🌿 Single-Sensor Integrated Hardware Test - Pin Diagram & Setup

This guide documents the non-conflicting pin mapping for the **ESP32-C3 SuperMini** running the integrated test with a **single soil moisture sensor (MD0869)**:
1. **MD0869** (Precision Reference Soil Moisture)
2. **DHT22 / AM2302** (Temperature & Humidity)
3. **BH1750** (Ambient Light Sensor in Lux)
4. **Onboard Blue LED** (Active Low cycle indicator)

---

## 📌 ESP32-C3 SuperMini Pin Configuration

```
                   ┌───────────────────────┐
                   │   ESP32-C3 SuperMini  │
                   │                       │
            [5V] --│ 5V                 21 │-- 
           [GND] --│ GND                20 │-- 
          [3.3V] --│ 3V3                 9 │-- [BOOT button]
 MD0869 AO (A0) ---│ GPIO 0              8 │-- [Onboard Blue LED]
                   │ GPIO 1              7 │-- 
Soil Power-Gate ---│ GPIO 2              6 │-- BH1750 SCL (I2C Clock)
DHT22 Data (D)  ---│ GPIO 3              5 │-- BH1750 SDA (I2C Data)
                   │ GPIO 4             10 │-- 
                   │       [USB-C]         │
                   └───────────────────────┘
```

---

## 🔌 Connection Table

| Subsystem / Sensor | Sensor Pin | ESP32-C3 SuperMini Pin | Description / Purpose |
|---|---|---|---|
| **Power Rails** | 3.3V / VCC | **3V3** | Shared 3.3V rail (DHT22, BH1750) |
| **Power Rails** | GND | **GND** | Shared common ground rail |
| **MD0869 Soil** | AO (Analog Out) | **GPIO 0** | ADC1_CH0 (0–4095) Reference Soil Moisture |
| **Soil Power Rail**| VCC | **GPIO 2** | Gated power (turns ON only during read cycle) |
| **DHT22** | DATA | **GPIO 3** | Single-wire digital data bus |
| **BH1750** | SDA | **GPIO 5** | I2C Serial Data |
| **BH1750** | SCL | **GPIO 6** | I2C Serial Clock |
| **BH1750** | ADDR | **GND** (or float) | Sets default I2C address `0x23` |
| **Status LED** | Onboard | **GPIO 8** | Activity indicator (Active LOW) |

---

## 📦 Required Arduino Libraries
1. **DHT sensor library** by *Adafruit*
2. **Adafruit Unified Sensor** by *Adafruit*
3. **BH1750** by *Christopher Laws*
