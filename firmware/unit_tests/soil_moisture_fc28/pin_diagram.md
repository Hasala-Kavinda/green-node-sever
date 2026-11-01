# 🌱 FC-28 Soil Moisture Sensor - Unit Test & Pin Diagram

## 📌 ESP32-C3 SuperMini Pin Configuration

The **FC-28** analog output connects to **ADC1_CH1 (GPIO 1)**. VCC is powered through **GPIO 2** so power is applied only during sampling, minimizing copper trace electrolysis.

```
             ┌───────────────────────┐
             │   ESP32-C3 SuperMini  │
             │                       │
      [5V] --│ 5V                 21 │-- 
     [GND] --│ GND                20 │-- 
    [3.3V] --│ 3V3                 9 │-- [BOOT button]
             │ GPIO 0              8 │-- [Onboard Blue LED]
  FC-28 AO --│ GPIO 1              7 │-- 
Power Gate --│ GPIO 2              6 │-- 
             │ GPIO 3              5 │-- 
             │ GPIO 4             10 │-- 
             │       [USB-C]         │
             └───────────────────────┘
```

---

## 🔌 Connection Table

| FC-28 Sensor Pin | ESP32-C3 SuperMini Pin | Description / Function |
|---|---|---|
| **AO** (Analog Out) | **GPIO 1** | ADC1_CH1 (Analog measurement signal) |
| **VCC** | **GPIO 2** | Power-gating output (active HIGH during reading) |
| **GND** | **GND** | Common system ground rail |

---

## ⚙️ Calibration Reference
* **Air (0% Moisture)**: Raw ADC $\approx 400$
* **Water / Saturated Soil (100% Moisture)**: Raw ADC $\approx 4095$
* **Linear Calibration Formula**: $y = ax + b$
  * **Slope constant `a` (`FC28_CAL_A`)**: Initial value = `0.0` (User-configurable constant)
  * **Intercept / Offset constant `b` (`FC28_CAL_B`)**: Initial value = `0.0` (User-configurable constant)
  * *Note*: When both `a` and `b` are at the initial condition `0.0`, raw ADC is passed through as uncalibrated baseline. Once calibrated parameters are determined, update `FC28_CAL_A` and `FC28_CAL_B` at their declaration in `soil_moisture_fc28.ino`.
* **Settle Time**: 20 ms
* **Reset / Discharge Time**: 40 ms

---

## ⚙️ Board & Serial Settings (Arduino IDE)
* **Board**: `ESP32C3 Dev Module`
* **USB CDC On Boot**: `Enabled` ⚠️
* **Baud Rate**: `115200`
* **Flash Size**: `4MB`
