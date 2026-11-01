# 🌿 Green Node - Final Production Integration Firmware

This directory contains the final, single-soil-sensor production integration sketches for the **ESP32-C3 SuperMini**. Each sketch integrates environmental monitoring (temperature & humidity), ambient light (lux), active status LED, and power-gated soil moisture monitoring.

Two separate, standalone firmware editions are provided to match the physical soil moisture hardware attached to your node:

1. **`md0869_integration/`**: Configured for the **MD0869** high-precision reference soil moisture probe.
2. **`fc28_integration/`**: Configured for the **FC-28** standard soil moisture probe.

---

## 📊 Edition Comparison & Sensor Specifications

| Parameter | MD0869 Edition (`md0869_integration`) | FC-28 Edition (`fc28_integration`) |
|---|---|---|
| **Target Soil Sensor** | **MD0869** (High-precision Reference) | **FC-28** (Standard probe) |
| **Soil Analog Pin** | **`GPIO 0`** (ADC1_CH0) | **`GPIO 1`** (ADC1_CH1) |
| **Power-Gate Pin** | **`GPIO 2`** (Active HIGH) | **`GPIO 2`** (Active HIGH) |
| **Power Settling Time** | `80 ms` (RC filter stabilization) | `20 ms` |
| **Probe Discharge Time** | `120 ms` (Capacitance decay) | `40 ms` |
| **Dry Baseline (0%)** | Raw ADC $\approx 400$ | Raw ADC $\approx 400$ |
| **Wet Baseline (100%)** | Raw ADC $\approx 4058$ | Raw ADC $\approx 4095$ |
| **DHT22 Data Pin** | **`GPIO 3`** (Single-wire digital) | **`GPIO 3`** (Single-wire digital) |
| **BH1750 I2C SDA** | **`GPIO 5`** | **`GPIO 5`** |
| **BH1750 I2C SCL** | **`GPIO 6`** | **`GPIO 6`** |
| **Onboard Blue LED** | **`GPIO 8`** (Active LOW) | **`GPIO 8`** (Active LOW) |
| **Refresh Interval** | `5000 ms` (5 seconds) | `5000 ms` (5 seconds) |

---

## 🔌 Pin Connections & Wiring Diagrams

### 1. MD0869 Edition Wiring

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

| Component | Pin | ESP32-C3 SuperMini Pin | Note |
|---|---|---|---|
| **MD0869 Soil** | AO | **GPIO 0** | Primary ADC1 input |
| **MD0869 Soil** | VCC | **GPIO 2** | Gated VCC power |
| **MD0869 Soil** | GND | **GND** | System ground |
| **DHT22** | DATA | **GPIO 3** | Digital I/O (with 10k pullup) |
| **DHT22** | VCC / GND | **3V3** / **GND** | Continuous power |
| **BH1750** | SDA / SCL | **GPIO 5** / **GPIO 6** | Dedicated hardware I2C |
| **BH1750** | VCC / GND | **3V3** / **GND** | Continuous power |
| **Status LED** | Onboard | **GPIO 8** | Flashes on each cycle |

---

### 2. FC-28 Edition Wiring

```
                   ┌───────────────────────┐
                   │   ESP32-C3 SuperMini  │
                   │                       │
            [5V] --│ 5V                 21 │-- 
           [GND] --│ GND                20 │-- 
          [3.3V] --│ 3V3                 9 │-- [BOOT button]
                   │ GPIO 0              8 │-- [Onboard Blue LED]
  FC-28 AO (A0) ---│ GPIO 1              7 │-- 
Soil Power-Gate ---│ GPIO 2              6 │-- BH1750 SCL (I2C Clock)
DHT22 Data (D)  ---│ GPIO 3              5 │-- BH1750 SDA (I2C Data)
                   │ GPIO 4             10 │-- 
                   │       [USB-C]         │
                   └───────────────────────┘
```

| Component | Pin | ESP32-C3 SuperMini Pin | Note |
|---|---|---|---|
| **FC-28 Soil** | AO | **GPIO 1** | Secondary ADC1 input |
| **FC-28 Soil** | VCC | **GPIO 2** | Gated VCC power |
| **FC-28 Soil** | GND | **GND** | System ground |
| **DHT22** | DATA | **GPIO 3** | Digital I/O |
| **DHT22** | VCC / GND | **3V3** / **GND** | Continuous power |
| **BH1750** | SDA / SCL | **GPIO 5** / **GPIO 6** | Dedicated hardware I2C |
| **BH1750** | VCC / GND | **3V3** / **GND** | Continuous power |
| **Status LED** | Onboard | **GPIO 8** | Flashes on each cycle |

---

## ⚡ Power-Gating Protection (GPIO 2)
Both sketches power the soil moisture sensor probe via **`GPIO 2`** rather than the continuous 3.3V rail.
* The probe is energized for only the required settling window (`80 ms` for MD0869, `20 ms` for FC-28).
* It is switched `LOW` immediately after reading and kept discharged for the remainder of the 5-second interval.
* **Benefit**: Eliminates electrolysis on the probe traces, preventing metal erosion and extending probe lifespan indefinitely.

---

## 📦 Required Libraries & IDE Configuration

### Arduino IDE Tools Settings
* **Board**: `ESP32C3 Dev Module`
* **USB CDC On Boot**: **`Enabled`** ⚠️ *(Required for USB-C Serial Monitor output)*
* **CPU Frequency**: `160MHz (WiFi)`
* **Flash Size**: `4MB (32Mb)`
* **Baud Rate**: `115200`

### Required Libraries (Install via Arduino Library Manager)
1. **`BH1750`** by *Christopher Laws*
2. **`DHT sensor library`** by *Adafruit*
3. **`Adafruit Unified Sensor`** by *Adafruit*
