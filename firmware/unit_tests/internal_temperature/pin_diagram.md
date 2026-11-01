# 🌡️ ESP32-C3 SuperMini In-Built Temperature Sensor - Unit Test & Pin Diagram

## 📌 Hardware Overview

The **ESP32-C3 SuperMini** features an **integrated on-chip bandgap thermal sensor** fabricated directly into the silicon die.
* **No External Wiring Required**: Because the sensor is inside the RISC-V SoC, there are **no physical GPIO pins, pull-up resistors, or external sensors needed**.
* **What it measures**: It monitors the internal junction/die temperature of the MCU ($T_j$), reflecting CPU processing load, internal power dissipation, and ambient temperature offset.
* **Onboard Status LED (`GPIO 8`)**: Flashes briefly during every 5-second measurement cycle to provide a visual heartbeat.

```
             ┌───────────────────────┐
             │   ESP32-C3 SuperMini  │
             │   [Internal On-Die]   │
             │    Thermal Sensor     │
      [5V] --│ 5V                 21 │-- 
     [GND] --│ GND                20 │-- 
    [3.3V] --│ 3V3                 9 │-- [BOOT button]
             │ GPIO 0              8 │-- [Onboard Blue LED]
             │ GPIO 1              7 │-- 
             │ GPIO 2              6 │-- 
             │ GPIO 3              5 │-- 
             │ GPIO 4             10 │-- 
             │       [USB-C]         │
             └───────────────────────┘
```

---

## 🔌 Hardware Details

| Feature | Location | Description |
|---|---|---|
| **Thermal Sensor** | On-Die (Internal SoC) | Built-in bandgap temperature circuit |
| **API Function** | `temperatureRead()` | Built into the official ESP32 Arduino Core (returns float in °C) |
| **Typical Range** | -40°C to +125°C | Silicon junction operating limits |
| **Status LED** | **GPIO 8** | Onboard Blue LED (Active LOW: `LOW = ON`, `HIGH = OFF`) |

---

## ⚙️ Board & Serial Settings (Arduino IDE)
* **Board**: `ESP32C3 Dev Module`
* **USB CDC On Boot**: `Enabled` ⚠️ *(Crucial for Serial Monitor over native USB-C)*
* **CPU Frequency**: `160MHz (WiFi)`
* **Flash Size**: `4MB`
* **Baud Rate**: `115200`
* **Libraries Required**: None (Uses built-in `temperatureRead()` from the ESP32 core)
