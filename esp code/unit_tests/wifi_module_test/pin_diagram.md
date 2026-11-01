# 📶 ESP32-C3 SuperMini Built-In Wi-Fi Module - Unit Test & Pin Diagram

## 📌 Hardware Overview

The Wi-Fi module is **fully built into the ESP32-C3 RISC-V SoC** (integrated 2.4 GHz 802.11 b/g/n transceiver) and operates using the **onboard PCB ceramic/trace antenna**.
* **Zero external wiring required**: There are no physical jumper wires or external pins needed to connect the Wi-Fi module.
* **Onboard Status LED (`GPIO 8`)**: The built-in blue LED blinks while attempting to connect to the access point and flashes during each 5-second polling cycle.

```
             ┌───────────────────────┐
             │   ESP32-C3 SuperMini  │
             │   [Onboard Antenna]   │
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

## 🔑 Wi-Fi Credentials Configuration

Open **`wifi_module_test.ino`** and edit lines 7–8:

```cpp
// ---> [WIFI NETWORK CREDENTIALS - CONFIGURE HERE] <---
const char* WIFI_SSID     = "Your_WiFi_SSID";       // <-- Enter your WiFi Network Name
const char* WIFI_PASSWORD = "Your_WiFi_Password";   // <-- Enter your WiFi Password
```

> [!NOTE]
> The ESP32-C3 supports **2.4 GHz Wi-Fi networks only** (802.11 b/g/n). It does not support 5 GHz Wi-Fi bands. If your router uses a dual-band SSID, ensure the 2.4 GHz band is enabled.

---

## 🔌 Pin Table

| Feature / Hardware | Location | Description |
|---|---|---|
| **2.4 GHz Wi-Fi Radio** | Internal SoC | Built-in 802.11 b/g/n baseband & MAC |
| **RF Antenna** | Onboard PCB | Surface-mount ceramic antenna on SuperMini PCB |
| **Status Indicator** | **GPIO 8** | Onboard Blue LED (Active LOW: `LOW = ON`, `HIGH = OFF`) |

---

## ⚙️ Board & Serial Settings (Arduino IDE)
* **Board**: `ESP32C3 Dev Module`
* **USB CDC On Boot**: `Enabled` ⚠️ *(Crucial for Serial.print over native USB-C)*
* **CPU Frequency**: `160MHz (WiFi)`
* **Flash Size**: `4MB`
* **Baud Rate**: `115200`
