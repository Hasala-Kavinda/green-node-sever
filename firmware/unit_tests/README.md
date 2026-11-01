# 🧪 Green Node - Unit Test Suite (ESP32-C3 SuperMini)

This directory contains standalone, isolated unit tests for every sensor component connected to the **ESP32-C3 SuperMini**.

---

## 🎯 Purpose of Unit Testing
Testing components individually ensures that:
1. Each sensor module is verified healthy and properly wired before running combined integration code.
2. Analog sensor calibration baselines (dry vs wet endpoints) can be adjusted independently.
3. Every component has its own dedicated data and control pins, so you can leave **all hardware connected simultaneously** and run tests one by one without moving jumper wires.

---

## 📂 Unit Tests Directory Structure

| Directory | Sensor / Component | Metric Tested | Pin(s) Used |
|---|---|---|---|
| **[`soil_moisture/`](./soil_moisture/)** | Dual Soil Moisture Comparison | Comparative benchmark: MD0869 vs FC-28 | `GPIO 0`, `GPIO 1`, `GPIO 2` |
| **[`soil_moisture_md0869/`](./soil_moisture_md0869/)** | MD0869 Reference Probe | Standalone precision soil moisture (%) | `GPIO 0` (AO), `GPIO 2` (VCC Gate) |
| **[`soil_moisture_fc28/`](./soil_moisture_fc28/)** | FC-28 Secondary Probe | Standalone soil moisture (%) with linear calibrator ($y = ax + b$) | `GPIO 1` (AO), `GPIO 2` (VCC Gate) |
| **[`dht22/`](./dht22/)** | DHT22 / AM2302 | Ambient temperature (°C) & humidity (% RH) | `GPIO 3` (Digital Data) |
| **[`bh1750/`](./bh1750/)** | BH1750 | Ambient illuminance (Lux / lx) | `GPIO 5` (SDA), `GPIO 6` (SCL) |
| **[`wifi_module_test/`](./wifi_module_test/)** | Built-in Wi-Fi Transceiver | 2.4 GHz Network Connectivity, RSSI, DHCP | Internal RF Antenna (No pins) |
| **[`internal_temperature/`](./internal_temperature/)** | On-Die Thermal Sensor | Internal silicon junction temperature (°C / °F) | Internal SoC (No pins) |

---

## 📐 Unified Standards Across All Unit Tests

Every unit test adheres to these four core design rules:

1. **Dedicated, Non-Overlapping Pins**:
   * MD0869 Soil: `GPIO 0`
   * FC-28 Soil: `GPIO 1`
   * Soil Power-Gating: `GPIO 2`
   * DHT22 Data: `GPIO 3`
   * BH1750 I2C: `GPIO 5` (SDA) & `GPIO 6` (SCL)
   * Status LED: `GPIO 8`
2. **Dedicated Documentation**:
   * Every unit test folder contains an individual **`pin_diagram.md`** file with an ASCII schematic and pin connection table.
3. **Consistent Code Structure**:
   * **Section 1**: Constants & Pin Configurations
   * **Section 2**: Helper & Conversion Functions
   * **Section 3**: System Initialization & Terminal Banner (`setup()`)
   * **Section 4**: Reading Execution & Status Diagnostics (`loop()`)
4. **Unified Timing**:
   * All unit tests output formatted diagnostic reports at a consistent **5-second (5000 ms)** interval.

---

## ⚙️ Arduino IDE Requirements
* **Board**: `ESP32C3 Dev Module`
* **USB CDC On Boot**: **`Enabled`** ⚠️ *(Crucial for Serial Monitor)*
* **Baud Rate**: `115200`
* **Libraries Needed**:
  * `BH1750` by *Christopher Laws*
  * `DHT sensor library` by *Adafruit*
  * `Adafruit Unified Sensor` by *Adafruit*
