# 🌿 Green Node - ESP32-C3 SuperMini Firmware & Sensor Suite

A comprehensive sensor suite tailored specifically for the ultra-compact **ESP32-C3 SuperMini** (Single-core RISC-V 32-bit MCU @ 160MHz).

---

## 📋 System Sensors Overview

| Sensor Model | Sensor Type | Physical Metric | Interface | ESP32-C3 Pin |
|---|---|---|---|---|
| **DHT22 (AM2302)** | Environmental Sensor | Ambient Temperature (°C) & Relative Humidity (% RH) | Single-Wire Digital | **GPIO 3** |
| **BH1750** | Optical Lux Sensor | Ambient Illuminance (Lux / lx) | I2C (`0x23`) | **GPIO 5** (SDA)<br>**GPIO 6** (SCL) |
| **MD0869** | Soil Moisture Probe | Primary Soil Moisture Content (% Volumetric) | Analog (ADC1_CH0) | **GPIO 0** |
| **FC-28** | Soil Moisture Probe | Secondary / Auxiliary Soil Moisture Content | Analog (ADC1_CH1) | **GPIO 1** |
| **Power Gate** | Probe Power Switch | Electrolysis Protection Switch (Active HIGH) | Digital Output | **GPIO 2** |
| **Onboard Blue LED**| Status Indicator | Transmission & Health Ping Indicator | GPIO (Active LOW) | **GPIO 8** |

---

## 🔍 Detailed Sensor Specifications

### 1. 🌡️ DHT22 / AM2302 - Temperature & Humidity Sensor
* **Purpose**: Measures ambient air temperature and relative humidity inside the growing/monitored environment.
* **Operating Voltage**: 3.3V – 5.0V (powered via **3V3** rail).
* **Interface**: Single-wire bidirectional digital protocol.
* **Assigned Pin**: **`GPIO 3`**.
* **Measurement Ranges**:
  * **Temperature**: -40°C to +80°C (Accuracy: $\pm 0.5$°C).
  * **Humidity**: 0% to 100% RH (Accuracy: $\pm 2$–$5$% RH).
* **Sampling Rate**: Minimum 2 seconds between consecutive reads.
* **Circuit Note**: A 4.7kΩ–10kΩ pull-up resistor between VCC and DATA is required (included onboard on most 3-pin breakout modules).

---

### 2. ☀️ BH1750 - Ambient Light & Illuminance Sensor
* **Purpose**: Measures visible ambient light intensity in calibrated Lux (lx) to track solar exposure and photoperiods.
* **Operating Voltage**: 3.3V (powered via **3V3** rail).
* **Interface**: Standard I2C bus (Default 7-bit Address: `0x23` with ADDR pin tied to GND).
* **Assigned Pins**:
  * **SDA (Data)** $\rightarrow$ **`GPIO 5`**
  * **SCL (Clock)** $\rightarrow$ **`GPIO 6`**
* **Measurement Range**: 1 to 65,535 lx (Resolutions down to 1 lx in High-Res mode).
* **Integration Time**: ~120 ms to 180 ms settling time per measurement.
* **Advantage**: Unlike raw analog LDRs (photoresistors), the BH1750 directly outputs true illuminance in lux without non-linear curve fitting.

---

### 3. 🌱 MD0869 - Primary Reference Soil Moisture Sensor
* **Purpose**: High-precision reference sensor measuring volumetric water content in soil.
* **Operating Voltage**: 3.3V (Gated via **`GPIO 2`**).
* **Interface**: Analog voltage output routed to **ADC1_CH0 (`GPIO 0`)**.
* **Calibration Endpoints**:
  * **Dry Air (0% Moisture)**: Raw ADC $\approx 400$
  * **Saturated Water (100% Moisture)**: Raw ADC $\approx 4058$
* **Settle & Discharge Times**:
  * **Settling Time**: 80 ms (RC filter stabilization after power-on).
  * **Reset / Discharge Time**: 120 ms (probe discharge after power-off).

---

### 4. 🌾 FC-28 - Secondary Soil Moisture Sensor
* **Purpose**: Auxiliary / comparison sensor for soil moisture monitoring.
* **Operating Voltage**: 3.3V (Gated via **`GPIO 2`**).
* **Interface**: Analog voltage output routed to **ADC1_CH1 (`GPIO 1`)**.
* **Calibration Endpoints**:
  * **Dry Air (0% Moisture)**: Raw ADC $\approx 400$
  * **Saturated Water (100% Moisture)**: Raw ADC $\approx 4095$
* **Settle & Discharge Times**:
  * **Settling Time**: 20 ms.
  * **Reset / Discharge Time**: 40 ms.

---

### 5. ⚡ Power-Gating Circuit (Electrolysis Prevention)
* **Assigned Pin**: **`GPIO 2`**.
* **Why it is needed**: Constant DC voltage on submerged soil probes causes rapid galvanic corrosion and metal leaching, destroying probes within weeks.
* **How it works**: Both MD0869 and FC-28 VCC pins are powered from `GPIO 2`. The pin is driven `HIGH` only during the brief measurement window (~80 ms) and immediately returned to `LOW` for the remainder of the interval.

---

## 📌 Master Wiring Diagram (ESP32-C3 SuperMini)

```
                   ┌───────────────────────┐
                   │   ESP32-C3 SuperMini  │
                   │                       │
            [5V] --│ 5V                 21 │-- 
           [GND] --│ GND                20 │-- 
          [3.3V] --│ 3V3                 9 │-- [BOOT button]
 MD0869 AO (A0) ---│ GPIO 0              8 │-- [Onboard Blue LED]
  FC-28 AO (A0) ---│ GPIO 1              7 │-- 
Soil Power-Gate ---│ GPIO 2              6 │-- BH1750 SCL (I2C Clock)
DHT22 Data (D)  ---│ GPIO 3              5 │-- BH1750 SDA (I2C Data)
                   │ GPIO 4             10 │-- 
                   │       [USB-C]         │
                   └───────────────────────┘
```

### Complete Pin Mapping Table

| Component | Sensor Pin | ESP32-C3 SuperMini Pin | Description |
|---|---|---|---|
| **Power Rails** | VCC / 3.3V | **3V3** | Continuous 3.3V power (DHT22, BH1750) |
| **Power Rails** | GND | **GND** | Shared common ground rail |
| **MD0869 Soil** | AO | **GPIO 0** | ADC1_CH0 (0–4095) |
| **FC-28 Soil** | AO | **GPIO 1** | ADC1_CH1 (0–4095) |
| **Soil Power Rail** | VCC | **GPIO 2** | Switched VCC (Active HIGH during read) |
| **DHT22** | DATA | **GPIO 3** | Digital I/O |
| **BH1750** | SDA | **GPIO 5** | I2C Serial Data |
| **BH1750** | SCL | **GPIO 6** | I2C Serial Clock |
| **BH1750** | ADDR | **GND** | Hardware address `0x23` |
| **Status LED** | Onboard | **GPIO 8** | Activity indicator (Active LOW) |

---

## ⚠️ ESP32-C3 Hardware Architecture Constraints

1. **ADC1 Exclusivity (WiFi Conflict Prevention)**:
   * When WiFi is transmitting on ESP32 chips, **ADC2 is hardware-disabled**.
   * All analog pins are strictly assigned to **ADC1** (`GPIO 0` and `GPIO 1`).
2. **Strapping Pins**:
   * `GPIO 9` is the BOOT strapping pin; avoided to prevent boot interference.
   * `GPIO 8` controls the onboard blue LED.
3. **USB CDC On Boot**:
   * ESP32-C3 SuperMini uses native on-chip USB-CDC instead of a dedicated USB-to-UART bridge chip (like CP2102/CH340).
   * **`USB CDC On Boot: Enabled`** must be turned on in Arduino IDE, or `Serial.print()` will produce no output in the Serial Monitor.

---

## 🧪 Firmware & Test Suite Directory Hierarchy

The ESP code repository is organized into distinct, modular folders, each containing its own dedicated `README.md`:

```
esp code/
├── README.md                                  <-- Master sensor & hardware guide
├── assets/                                    <-- Board schematics & hardware visual diagrams
│   └── ESPC3SuperMini.png
│
├── unit_tests/                                <-- Standalone individual sensor tests
│   ├── README.md                              <-- Unit test suite documentation & standards
│   ├── soil_moisture/                         <-- Comparative test (MD0869 vs FC-28)
│   │   ├── soil_moisture.ino
│   │   ├── pin_diagram.md
│   │   └── soil_moisture_reading_log.txt
│   ├── soil_moisture_md0869/                  <-- MD0869 standalone test
│   │   ├── soil_moisture_md0869.ino
│   │   └── pin_diagram.md
│   ├── soil_moisture_fc28/                    <-- FC-28 standalone test
│   │   ├── soil_moisture_fc28.ino
│   │   └── pin_diagram.md
│   ├── dht22/                                 <-- DHT22 Temp & Humidity standalone test
│   │   ├── dht22.ino
│   │   └── pin_diagram.md
│   └── bh1750/                                <-- BH1750 Ambient Light standalone test
│       ├── bh1750.ino
│       └── pin_diagram.md
│
├── integrated_test/                           <-- Single-sensor hardware integration test
│   ├── README.md                              <-- Integrated test overview & hardware mapping
│   ├── integrated_test.ino                    <-- All-in-one local test sketch (no WiFi required)
│   └── pin_diagram.md                         <-- Hardware pin diagram
│
├── final_code/                                <-- Production single-sensor integration firmware
│   ├── README.md                              <-- Comprehensive guide & edition comparison
│   ├── md0869_integration/                   <-- Final code for MD0869 reference soil probe
│   │   └── md0869_integration.ino
│   └── fc28_integration/                     <-- Final code for FC-28 standard soil probe
│       └── fc28_integration.ino
│
└── esp_code/                                  <-- Full wireless telemetry & HTTP health probe
    ├── README.md                              <-- WiFi & server endpoint documentation
    └── esp_code.ino                           <-- Production wireless IoT telemetry firmware
```

---

## ⚙️ Arduino IDE Setup & Required Libraries

### Board Configuration (`Tools` Menu)
* **Board**: `ESP32C3 Dev Module`
* **USB CDC On Boot**: **`Enabled`** ⚠️ *(Crucial)*
* **CPU Frequency**: `160MHz (WiFi)`
* **Flash Size**: `4MB (32Mb)`
* **Upload Speed**: `921600`
* **Baud Rate**: `115200`

### Required Libraries
Install via **Library Manager** (`Ctrl+Shift+I`):
1. **DHT sensor library** by *Adafruit* (requires *Adafruit Unified Sensor*)
2. **BH1750** by *Christopher Laws*
*(Wire, WiFi, WebServer, and HTTPClient are bundled within the standard ESP32 Arduino Core).*
