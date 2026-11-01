// ============================================================================
// 1. FC-28 SOIL MOISTURE SENSOR - CONSTANTS & CONFIGURATION
// ============================================================================

// --- Pin Assignments (ESP32-C3N SuperMini) ---
const int PIN_SOIL_FC28_AO                         = 1;       // GPIO1 (ADC1_CH1) -> FC-28 Sensor Analog Output
const int PIN_SOIL_POWER_GATE                      = 2;       // GPIO2 -> Dedicated VCC Power-Gating Pin

// --- FC-28 Timing & Integration Configuration ---
const unsigned long FC28_MIN_SETTLE_MS             = 20;      // 20ms for FC-28 RC filter to settle
const unsigned long FC28_MIN_RESET_MS              = 40;      // 40ms for sensor probe to discharge between cycles
const unsigned long TERMINAL_REFRESH_DELAY_MS      = 5000;    // 5-second (5000ms) gap between terminal updates

// --- Raw ADC Dry (0% Moisture) and Wet (100% Moisture) Endpoints ---
const int FC28_DRY_RAW_ADC                         = 400;     // FC-28 raw ADC in dry air (0% moisture)
const int FC28_WET_RAW_ADC                         = 4095;    // FC-28 raw ADC in wet soil/water (100% moisture)

// --- Sampling Filter Configuration ---
const int SOIL_ADC_SAMPLES                         = 16;      // Number of ADC samples averaged per read


// ============================================================================
// 2. FC-28 SOIL MOISTURE SENSOR - HELPER & CONVERSION FUNCTIONS
// ============================================================================

// Reads analog pin with warm-up discard followed by multi-sample averaging
int readSoilSensorADC(int analogPin) {
    // Discard initial transient readings
    for (int i = 0; i < 4; i++) {
        (void)analogRead(analogPin);
        delayMicroseconds(500);
    }

    // Accumulate averaged samples
    long sum = 0;
    for (int i = 0; i < SOIL_ADC_SAMPLES; i++) {
        sum += analogRead(analogPin);
        delayMicroseconds(250);
    }
    return (int)(sum / SOIL_ADC_SAMPLES);
}

// Converts raw ADC reading to moisture percentage (0.0% to 100.0%)
float calculateSoilMoisturePercent(int rawAdc) {
    float span = (float)(FC28_WET_RAW_ADC - FC28_DRY_RAW_ADC);
    float percent = (((float)rawAdc - (float)FC28_DRY_RAW_ADC) / span) * 100.0f;

    if (percent < 0.0f)   percent = 0.0f;
    if (percent > 100.0f) percent = 100.0f;

    return percent;
}


// ============================================================================
// 3. SYSTEM INITIALIZATION
// ============================================================================

void setup() {
    Serial.begin(115200);
    delay(1500); // Allow native USB-CDC to initialize

    // Initialize power gate pin and keep sensor de-energized initially
    pinMode(PIN_SOIL_POWER_GATE, OUTPUT);
    digitalWrite(PIN_SOIL_POWER_GATE, LOW);

    // Configure ESP32-C3 12-bit ADC (0 - 4095) with 11dB attenuation
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);

    Serial.println("======================================================================");
    Serial.println("         ESP32-C3N FC-28 SOIL MOISTURE STANDALONE UNIT TEST           ");
    Serial.println("======================================================================");
    Serial.print("Sensor AO Pin          : GPIO "); Serial.println(PIN_SOIL_FC28_AO);
    Serial.print("Power Gate Pin         : GPIO "); Serial.println(PIN_SOIL_POWER_GATE);
    Serial.print("Active Settle Time     : "); Serial.print(FC28_MIN_SETTLE_MS); Serial.println(" ms");
    Serial.print("Discharge Reset Time   : "); Serial.print(FC28_MIN_RESET_MS);  Serial.println(" ms");
    Serial.print("Calibrated Range (ADC) : Dry = "); Serial.print(FC28_DRY_RAW_ADC);
    Serial.print(" | Wet = "); Serial.println(FC28_WET_RAW_ADC);
    Serial.print("Terminal Refresh Gap   : "); Serial.print(TERMINAL_REFRESH_DELAY_MS); Serial.println(" ms (5 sec)");
    Serial.println("======================================================================");
}


// ============================================================================
// 4. FC-28 SOIL MOISTURE READINGS - MAIN EXECUTION LOOP (5-SECOND INTERVAL)
// ============================================================================

void loop() {
    // 1. Energize sensor and wait for settling
    digitalWrite(PIN_SOIL_POWER_GATE, HIGH);
    delay(FC28_MIN_SETTLE_MS);

    // 2. Read multi-sampled ADC
    int soilRaw = readSoilSensorADC(PIN_SOIL_FC28_AO);

    // 3. De-energize sensor to prevent corrosion and allow discharge
    digitalWrite(PIN_SOIL_POWER_GATE, LOW);
    delay(FC28_MIN_RESET_MS);

    // 4. Calculate moisture percentage
    float moisturePercent = calculateSoilMoisturePercent(soilRaw);

    // 5. Output report to Serial Monitor
    Serial.println("--- FC-28 SOIL MOISTURE READING ---");
    Serial.print("FC-28 Raw ADC   : ");
    Serial.print(soilRaw);
    Serial.print(" / 4095");
    Serial.print(" | Moisture Level: ");
    Serial.print(moisturePercent, 2);
    Serial.println("%");

    // Diagnostic status indication
    if (soilRaw <= FC28_DRY_RAW_ADC + 50) {
        Serial.println("Status: 🏜️ Dry Air / Sensor Probe Out of Soil");
    } else if (moisturePercent >= 75.0) {
        Serial.println("Status: 💧 High Moisture / Saturated Soil");
    } else {
        Serial.println("Status: 🌱 Optimal Moisture Range");
    }
    Serial.println();

    // 6. Wait before next cycle
    delay(TERMINAL_REFRESH_DELAY_MS);
}
