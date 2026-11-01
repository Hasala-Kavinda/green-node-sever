# ☀️ BH1750 Ambient Light Sensor - Unit Test & Pin Diagram

## 📌 ESP32-C3 SuperMini Pin Configuration

The **BH1750** communicates using the standard **I2C interface**. On the ESP32-C3 SuperMini, the custom I2C bus is mapped to **GPIO 5** (SDA) and **GPIO 6** (SCL).
This keeps the ADC1 pins (`GPIO 0-4`) and LED (`GPIO 8`) completely free for other modules.

```
             ┌───────────────────────┐
             │   ESP32-C3 SuperMini  │
             │                       │
      [5V] --│ 5V                 21 │-- 
     [GND] --│ GND                20 │-- 
    [3.3V] --│ 3V3                 9 │-- [BOOT button]
             │ GPIO 0              8 │-- [Onboard Blue LED]
             │ GPIO 1              7 │-- 
             │ GPIO 2              6 │-- BH1750 SCL
             │ GPIO 3              5 │-- BH1750 SDA
             │ GPIO 4             10 │-- 
             │       [USB-C]         │
             └───────────────────────┘
```

---

## 🔌 Connection Table

| BH1750 Pin | ESP32-C3 SuperMini Pin | Description / Function |
|---|---|---|
| **VCC** | **3V3** | 3.3V Power Rail |
| **GND** | **GND** | Common ground rail |
| **SDA** | **GPIO 5** | I2C Serial Data |
| **SCL** | **GPIO 6** | I2C Serial Clock |
| **ADDR** | `GND` (or floating) | I2C address `0x23` (Connected to 3V3 = `0x5C`) |

---

## 📦 Required Arduino Library

In Arduino IDE (`Sketch -> Include Library -> Manage Libraries...`):
* Search for **`BH1750`** by *Christopher Laws* and click **Install**.

---

## ⚙️ Board & Serial Settings (Arduino IDE)
* **Board**: `ESP32C3 Dev Module`
* **USB CDC On Boot**: `Enabled` ⚠️
* **Baud Rate**: `115200`
* **Flash Size**: `4MB`
