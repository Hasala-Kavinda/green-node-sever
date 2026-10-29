# 🌿 ESP32-C3 SuperMini - Firmware & Wiring Guide

This firmware is written specifically for the **ESP32-C3 SuperMini** development board according to the [Official ESP32-C3 SuperMini Datasheet](https://dl.artronshop.co.th/ESP32-C3%20SuperMini%20datasheet.pdf).

---

## 📋 Hardware Specifications (From Datasheet)

* **Chip Model**: `ESP32C3FN4`
* **CPU**: 32-bit RISC-V single-core processor with FPU, running up to **160 MHz**
* **Memory**: 400 KB SRAM, 384 KB ROM, built-in **4 MB Flash**
* **Wireless**: 2.4 GHz Wi-Fi (IEEE 802.11 b/g/n) & Bluetooth 5.0 (LE)
* **Form Factor**: Ultra-compact thumb-sized board (22.52 × 18 mm)
* **Peripherals**: 11 Digital GPIOs (PWM capable), 4 Analog Inputs (ADC1), 1× I2C, 1× SPI, 2× UART
* **Onboard LED**: Blue LED wired to **GPIO 8** (`HIGH` = ON, `LOW` = OFF)
* **Power Supply**: 5V pin accepts 3.3V – 6V. 
  > ⚠️ **Caution from Datasheet**: When connecting an external power supply, do **NOT** plug in USB at the same time. Choose either USB or external power.

---

## 🔌 Pin Mapping & Wiring Diagram

The ESP32-C3 SuperMini has two 8-pin rows:

```
             ┌───────────────────────┐
             │   ESP32-C3 SuperMini  │
             │                       │
      [5V] --│ 5V                 21 │-- [UART TX / USB D-]
     [GND] --│ GND                20 │-- [UART RX / USB D+]
    [3.3V] --│ 3V3                 9 │-- [BOOT button]
  Soil(A0) --│ GPIO 0              8 │-- [Onboard Blue LED]
   LDR(A0) --│ GPIO 1              7 │-- GPIO 7
             │ GPIO 2              6 │-- GPIO 6
  DHT22(D) --│ GPIO 3              5 │-- GPIO 5
             │ GPIO 4             10 │-- GPIO 10
             │       [USB-C]         │
             └───────────────────────┘
```

### Complete Pin Connections

| Module / Sensor | Module Pin | ESP32-C3 SuperMini Pin | Description |
|---|---|---|---|
| **Power** | VCC / 5V | `5V` | 5V power from USB or external 5V |
| **Power** | 3.3V | `3V3` | 3.3V output rail for DHT22 / LDR |
| **Ground** | GND | `GND` | Common ground rail |
| **FC-28 Soil Moisture** | A0 (Analog Out) | **`GPIO 0`** | ADC1_CH0 (0 – 4095, 12-bit ADC) |
| **LDR Light Sensor** | Signal (Divider) | **`GPIO 1`** | ADC1_CH1 (0 – 4095, 12-bit ADC) |
| **DHT22 (AM2302)** | DATA | **`GPIO 3`** | Digital Temp & Humidity I/O |
| **Onboard Blue LED** | Internal | **`GPIO 8`** | Status indicator (`HIGH` = ON) |

> 💡 **Why GPIO 0 & 1?** On the ESP32-C3, only **ADC1** channels (GPIO 0, 1, 2, 3) can be read while Wi-Fi is actively transmitting. GPIO 0 and 1 avoid all Wi-Fi ADC conflicts.

---

## ⚙️ Arduino IDE Configuration (Exact Datasheet Settings)

Follow these exact steps from the datasheet:

1. **Add Board URL**:
   In Arduino IDE, open `File` $\rightarrow$ `Preferences`, and paste this into **Additional Boards Manager URLs**:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
2. **Install Board Core**:
   Open `Tools` $\rightarrow$ `Board` $\rightarrow$ `Boards Manager...`, search for `esp32` and install the latest version.
3. **Configure Tools Menu**:
   * **Board**: Select **`ESP32C3 Dev Module`**
   * **USB CDC On Boot**: Set to **`Enabled`** ⚠️ *(Essential! Otherwise Serial.print will not output over USB-C)*
   * **CPU Frequency**: `160MHz (WiFi)`
   * **Flash Size**: `4MB (32Mb)`
   * **Upload Speed**: `921600`
   * **Port**: Select your recognized device port (e.g., `/dev/ttyACM0` on Linux, `COM3+` on Windows)

---

## 🚀 How to Enter Download / Flashing Mode

If your computer doesn't detect the COM port or flashing fails:
1. **Method 1**: Hold down the **BOOT** button (GPIO 9), plug in the USB-C cable, then release the BOOT button.
2. **Method 2**: While plugged in, hold the **BOOT** button, press the **RESET** button once, release the **RESET** button, and then release the **BOOT** button.
3. Click **Upload** in Arduino IDE.
4. Once upload shows `100% Hash of data verified`, press the **RESET** button once to run the firmware.

---

## 📡 Firmware Features

1. **Non-blocking Telemetry (`POST /api/readings`)**:
   Sends JSON data every 10 seconds:
   ```json
   {
     "deviceId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
     "temperature": 25.80,
     "humidity": 70.30,
     "soilMoisture": 45.00,
     "light": 580.0,
     "metadata": {
       "chip": "ESP32C3FN4",
       "board": "ESP32-C3 SuperMini",
       "soil_raw": 2200,
       "light_raw": 1580,
       "rssi": -52
     }
   }
   ```
2. **Onboard Liveness Probe (`GET /health` on port 80)**:
   Runs an embedded lightweight WebServer so the backend and dashboard can verify if the ESP32 is powered on and reachable in real-time.
3. **LED Indicators (GPIO 8)**:
   * **Blinking during boot**: Connecting to Wi-Fi.
   * **Solid OFF**: Successfully connected and operating normally.
   * **Quick Flash**: Sent sensor reading packet or responded to health check.
   * **Solid ON**: Wi-Fi connection lost / alert state.
