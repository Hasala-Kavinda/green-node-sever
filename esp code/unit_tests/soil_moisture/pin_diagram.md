# 🌱 Soil Moisture Dual-Sensor Comparison (MD0869 vs FC-28) - Pin Diagram

## 📌 ESP32-C3 SuperMini Pin Configuration

This unit test benchmarks the **MD0869** (reference sensor) directly against the **FC-28** (uncorrected sensor). Both analog pins are routed to **ADC1** (`GPIO 0` and `GPIO 1`) to eliminate WiFi/ADC2 conflicts, with power gating on `GPIO 2` to prevent probe corrosion.

```
             ┌───────────────────────┐
             │   ESP32-C3 SuperMini  │
             │                       │
      [5V] --│ 5V                 21 │-- 
     [GND] --│ GND                20 │-- 
    [3.3V] --│ 3V3                 9 │-- [BOOT button]
 MD0869 AO --│ GPIO 0              8 │-- [Onboard Blue LED]
  FC-28 AO --│ GPIO 1              7 │-- 
Power Gate --│ GPIO 2              6 │-- 
             │ GPIO 3              5 │-- 
             │ GPIO 4             10 │-- 
             │       [USB-C]         │
             └───────────────────────┘
```

---

## 🔌 Complete Connection Table

| Sensor | Sensor Pin | ESP32-C3 SuperMini Pin | Description / Purpose |
|---|---|---|---|
| **MD0869** | AO (Analog Out) | **GPIO 0** | ADC1_CH0 - Correct Reference Sensor |
| **FC-28** | AO (Analog Out) | **GPIO 1** | ADC1_CH1 - Uncorrected Sensor |
| **Both Sensors** | VCC | **GPIO 2** | Power-gating pin (energized only during read cycle) |
| **Both Sensors** | GND | **GND** | Common system ground rail |

---

## ⚙️ Board & Serial Settings (Arduino IDE)

| Setting | Value | Purpose |
|---|---|---|
| **Board** | **`ESP32C3 Dev Module`** | Target MCU core |
| **USB CDC On Boot** | **`Enabled`** ⚠️ | Enables `Serial.print()` over native USB-C port |
| **Baud Rate** | **`115200`** | Terminal output speed |
| **Flash Size** | `4MB (32Mb)` | Standard flash size |
| **Partition Scheme** | `Default 4MB with spiffs` | Standard layout |
