# 🌿 ESP32-C3 SuperMini - Integrated Hardware Test Suite

This directory contains the **integrated hardware test** that polls all active sensors simultaneously on the **ESP32-C3 SuperMini** without requiring an active WiFi connection or backend server.

---

## 🎯 Purpose of the Integrated Test
Before deploying the firmware with WiFi and cloud backend services, the integrated test validates:
1. All sensor circuits are functional simultaneously.
2. No hardware pin, bus, or ADC collisions exist between modules.
3. The power-gating circuitry on `GPIO 2` energizes the soil probe only during measurement.
4. Native USB-CDC serial telemetry prints valid metrics every 5 seconds.

---

## 📌 Integrated Hardware Configuration

| Sensor / Module | Measurement | Protocol / Interface | ESP32-C3 Pin |
|---|---|---|---|
| **MD0869** (Reference) | Soil Moisture Content | Analog (ADC1_CH0) | **GPIO 0** |
| **Power Gate** | Electrolysis Protection Switch | Digital Output | **GPIO 2** |
| **DHT22 (AM2302)** | Temperature & Relative Humidity | Single-Wire Digital | **GPIO 3** |
| **BH1750** | Ambient Illuminance (Lux) | Hardware I2C (Address `0x23`) | **GPIO 5** (SDA)<br>**GPIO 6** (SCL) |
| **Status LED** | Measurement Pulse Indicator | Active LOW | **GPIO 8** |

---

## 📂 Files in this Directory

* **[`integrated_test.ino`](./integrated_test.ino)**:
  The complete Arduino integration test sketch. Sequentially executes power-gated soil measurement, DHT22 environmental sampling, BH1750 lux sampling, and pulses the onboard LED before printing a unified telemetry table every 5 seconds.
* **[`pin_diagram.md`](./pin_diagram.md)**:
  Dedicated visual ASCII pin layout and wiring table for the integrated test.

---

## ⚙️ Arduino IDE Configuration & Libraries
* **Board**: `ESP32C3 Dev Module`
* **USB CDC On Boot**: **`Enabled`** ⚠️ *(Crucial for Serial Monitor output)*
* **Baud Rate**: `115200`
* **Libraries Required**:
  1. `BH1750` by *Christopher Laws*
  2. `DHT sensor library` by *Adafruit*
  3. `Adafruit Unified Sensor` by *Adafruit*
