# 🌱 MD0869 Soil Moisture Sensor - Unit Test & Pin Diagram

## 📌 ESP32-C3 SuperMini Pin Configuration

The **MD0869** is the high-precision reference soil moisture sensor. Its analog output connects to **ADC1_CH0 (GPIO 0)**. VCC is gated via **GPIO 2** to drastically prolong sensor probe lifespan and prevent galvanic corrosion.

```
             ┌───────────────────────┐
             │   ESP32-C3 SuperMini  │
             │                       │
      [5V] --│ 5V                 21 │-- 
     [GND] --│ GND                20 │-- 
    [3.3V] --│ 3V3                 9 │-- [BOOT button]
 MD0869 AO --│ GPIO 0              8 │-- [Onboard Blue LED]
             │ GPIO 1              7 │-- 
Power Gate --│ GPIO 2              6 │-- 
             │ GPIO 3              5 │-- 
             │ GPIO 4             10 │-- 
             │       [USB-C]         │
             └───────────────────────┘
```

---

## 🔌 Connection Table

| MD0869 Sensor Pin | ESP32-C3 SuperMini Pin | Description / Function |
|---|---|---|
| **AO** (Analog Out) | **GPIO 0** | ADC1_CH0 (Analog measurement signal) |
| **VCC** | **GPIO 2** | Power-gating output (active HIGH during reading) |
| **GND** | **GND** | Common system ground rail |

---

## ⚙️ Calibration Reference
* **Air (0% Moisture)**: Raw ADC $\approx 400$
* **Water / Saturated Soil (100% Moisture)**: Raw ADC $\approx 4058$
* **Settle Time**: 80 ms
* **Reset / Discharge Time**: 120 ms

---

## ⚙️ Board & Serial Settings (Arduino IDE)
* **Board**: `ESP32C3 Dev Module`
* **USB CDC On Boot**: `Enabled` ⚠️
* **Baud Rate**: `115200`
* **Flash Size**: `4MB`
