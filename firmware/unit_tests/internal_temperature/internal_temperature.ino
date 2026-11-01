// ============================================================================
// 1. ESP32-C3 SUPERMINI INTERNAL TEMPERATURE SENSOR - CONFIGURATION
// ============================================================================

// --- Pin Assignments & Hardware Configuration ---
const int PIN_STATUS_LED                      = 8;       // Onboard Blue Status LED (Active LOW on ESP32-C3)
const unsigned long TERMINAL_REFRESH_DELAY_MS = 5000;    // 5-second (5000ms) gap between terminal updates

// --- Thermal Threshold Constants (°C) ---
const float TEMP_NORMAL_MAX                   = 65.0f;   // Normal SoC operating temperature ceiling
const float TEMP_WARNING_MAX                  = 80.0f;   // Warning / elevated junction temperature threshold


// ============================================================================
// 2. HELPER & THERMAL EVALUATION FUNCTIONS
// ============================================================================

// Flashes the onboard blue LED for visual heartbeat
void pulseLed(int durationMs = 40) {
    digitalWrite(PIN_STATUS_LED, LOW);   // ON (active low)
    delay(durationMs);
    digitalWrite(PIN_STATUS_LED, HIGH);  // OFF
}

// Converts Celsius to Fahrenheit
float celsiusToFahrenheit(float tempC) {
    return (tempC * 1.8f) + 32.0f;
}

// Evaluates the thermal state of the ESP32-C3 silicon die
const char* evaluateDieThermalState(float tempC) {
    if (tempC < 30.0f) {
        return "❄️ Cool / Low Core Load";
    } else if (tempC <= TEMP_NORMAL_MAX) {
        return "🟢 Nominal / Healthy Operating Temperature";
    } else if (tempC <= TEMP_WARNING_MAX) {
        return "⚠️ Warm / Heavy Processing Load (Within Spec)";
    } else {
        return "🔥 Hot / Thermal Throttling Zone (Inspect Heat Dissipation)";
    }
}


// ============================================================================
// 3. SYSTEM INITIALIZATION
// ============================================================================

void setup() {
    Serial.begin(115200);
    delay(1500); // Allow native USB-CDC to initialize

    pinMode(PIN_STATUS_LED, OUTPUT);
    digitalWrite(PIN_STATUS_LED, HIGH); // OFF initially

    Serial.println("======================================================================");
    Serial.println("     ESP32-C3 SUPERMINI IN-BUILT SILICON DIE TEMPERATURE TEST         ");
    Serial.println("======================================================================");
    Serial.println("Sensor Architecture    : Integrated On-Die Bandgap Thermal Sensor");
    Serial.println("Microcontroller        : ESP32-C3 Single-Core RISC-V @ 160MHz");
    Serial.println("Wiring / External Pins : None (Internal Silicon Core)");
    Serial.print("Normal Temp Threshold  : < "); Serial.print(TEMP_NORMAL_MAX, 1); Serial.println(" °C");
    Serial.print("Warning Temp Threshold : > "); Serial.print(TEMP_WARNING_MAX, 1); Serial.println(" °C");
    Serial.print("Status Refresh Gap     : "); Serial.print(TERMINAL_REFRESH_DELAY_MS); Serial.println(" ms (5 sec)");
    Serial.println("======================================================================");

    // Initial settling time for on-chip thermal sensor
    delay(200);
}


// ============================================================================
// 4. MAIN EXECUTION LOOP (5-SECOND INTERVAL)
// ============================================================================

void loop() {
    // 1. Read the on-chip silicon die temperature using ESP32 Arduino Core HAL API
    float chipTempC = temperatureRead();
    float chipTempF = celsiusToFahrenheit(chipTempC);

    // 2. Pulse onboard status LED on each sampling cycle
    pulseLed(40);

    // 3. Output formatted diagnostic metrics to Serial Monitor
    Serial.println("┌────────────────── ON-CHIP DIE TEMPERATURE REPORT ──────────────────┐");
    Serial.printf("│ Temperature (Celsius)    : %6.2f °C                                │\n", chipTempC);
    Serial.printf("│ Temperature (Fahrenheit) : %6.2f °F                                │\n", chipTempF);
    Serial.printf("│ Thermal Health Status    : %-39s │\n", evaluateDieThermalState(chipTempC));
    Serial.printf("│ CPU Operating Frequency  : %3u MHz                                   │\n", getCpuFrequencyMhz());
    Serial.printf("│ Free Heap Memory         : %6u bytes                               │\n", ESP.getFreeHeap());
    Serial.printf("│ System Uptime            : %6lu seconds                             │\n", millis() / 1000);
    Serial.println("└────────────────────────────────────────────────────────────────────┘\n");

    // 4. Wait 5 seconds before next polling cycle
    delay(TERMINAL_REFRESH_DELAY_MS);
}
