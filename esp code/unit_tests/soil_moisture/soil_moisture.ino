// ============================================================================
// 1. SOIL MOISTURE SENSOR - CONSTANTS & CONFIGURATION
// ============================================================================

// --- Pin Assignments (ESP32-C3N SuperMini) ---
const int PIN_SOIL_MD0869_AO                       = 0;       // GPIO0 (ADC1_CH0) -> Correct Reference Sensor
const int PIN_SOIL_FC28_AO                         = 1;       // GPIO1 (ADC1_CH1) -> Uncorrected Sensor
const int PIN_SOIL_POWER_GATE                      = 2;       // GPIO2 -> Shared VCC Power-Gating Pin

// --- Individual Sensor Minimum Settling Times (Power ON -> Valid Reading) ---
const unsigned long MD0869_MIN_SETTLE_MS           = 80;      // 80ms for MD0869 RC filter to settle completely
const unsigned long FC28_MIN_SETTLE_MS             = 20;      // 20ms for FC-28 RC filter to settle
const unsigned long SOIL_SETTLE_TIME_DIFF_MS       = 60;      // Difference: MD0869 (80ms) - FC28 (20ms)

// --- Individual Sensor Minimum Reset Times (Power OFF -> Reset to 0V) ---
const unsigned long MD0869_MIN_RESET_MS            = 120;     // 120ms for MD0869 to discharge between cycles
const unsigned long FC28_MIN_RESET_MS              = 40;      // 40ms for FC-28 to discharge between cycles
const unsigned long SOIL_RESET_TIME_DIFF_MS        = 80;      // Difference: MD0869 (120ms) - FC28 (40ms)

// --- Unified Mean Cycle Average & 5-Second Terminal Refresh Gap ---
const unsigned long SOIL_MOISTURE_MIN_CYCLE_AVG_MS = 200;     // 200ms total active sensor cycle (80ms ON + 120ms OFF)
const unsigned long SOIL_ACTIVE_SETTLE_MS          = MD0869_MIN_SETTLE_MS; // 80ms Power-ON settle time
const unsigned long SOIL_ACTIVE_RESET_MS           = MD0869_MIN_RESET_MS;  // 120ms Power-OFF reset time
const unsigned long TERMINAL_REFRESH_DELAY_MS      = 5000;    // 5-second (5000ms) gap between terminal updates

// --- Sensor Direction Flags ---
const bool MD0869_WET_IS_LOW_ADC                   = false;   // High ADC = Wet (4058+), Low ADC = Dry
const bool FC28_WET_IS_LOW_ADC                     = false;   // High ADC = Wet (4095+), Low ADC = Dry

// --- Raw ADC Dry (0% Moisture) and Wet (100% Moisture) Endpoints ---
const int MD0869_DRY_RAW_ADC                       = 400;     // MD0869 raw ADC in dry air (0% moisture)
const int MD0869_WET_RAW_ADC                       = 4058;    // MD0869 raw ADC in wet soil/water (100% moisture)

const int FC28_DRY_RAW_ADC                         = 400;     // FC-28 raw ADC in dry air (0% moisture)
const int FC28_WET_RAW_ADC                         = 4095;    // FC-28 raw ADC in wet soil/water (100% moisture)

// --- User-Adjustable Calibration Constants (Updated for your Serial readings) ---
const float SOIL_CAL_ALPHA                         = 0.9910f; // Scale factor: 4058 / 4095 aligns FC-28 span to MD0869
const float SOIL_CAL_BETA                          = 0.00f;   // Zero offset constant (User adjustable)

// --- Sampling Filter Configuration ---
const int SOIL_ADC_SAMPLES                         = 16;      // Number of ADC samples averaged per read


// ============================================================================
// 2. SOIL MOISTURE SENSOR - HELPER & CALIBRATION FUNCTIONS
// ============================================================================

int readSoilSensorADC(int analogPin) {
    for (int i = 0; i < 4; i++) {
        (void)analogRead(analogPin);
        delayMicroseconds(500);
    }

    long sum = 0;
    for (int i = 0; i < SOIL_ADC_SAMPLES; i++) {
        sum += analogRead(analogPin);
        delayMicroseconds(250);
    }
    return (int)(sum / SOIL_ADC_SAMPLES);
}

float calibrateSoilMoistureValue(int uncorrectedRaw, float alpha, float beta) {
    float fcSpan = (float)(FC28_WET_RAW_ADC - FC28_DRY_RAW_ADC);
    float wetnessRatio = ((float)uncorrectedRaw - (float)FC28_DRY_RAW_ADC) / fcSpan;

    float mdSpan = (float)(MD0869_WET_RAW_ADC - MD0869_DRY_RAW_ADC);
    float normalizedToMD0869 = (float)MD0869_DRY_RAW_ADC + (wetnessRatio * mdSpan);

    float calibrated = (alpha * normalizedToMD0869) + beta;

    if (calibrated < 0.0f)    calibrated = 0.0f;
    if (calibrated > 4095.0f) calibrated = 4095.0f;

    return calibrated;
}

float calculateSoilMoisturePercent(float mdScaleAdcValue) {
    float span = (float)(MD0869_WET_RAW_ADC - MD0869_DRY_RAW_ADC);
    float percent = ((mdScaleAdcValue - (float)MD0869_DRY_RAW_ADC) / span) * 100.0f;

    if (percent < 0.0f)   percent = 0.0f;
    if (percent > 100.0f) percent = 100.0f;

    return percent;
}


// ============================================================================
// 3. SYSTEM INITIALIZATION
// ============================================================================

void setup() {
    Serial.begin(115200);
    delay(1500);

    pinMode(PIN_SOIL_POWER_GATE, OUTPUT);
    digitalWrite(PIN_SOIL_POWER_GATE, LOW);

    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);

    Serial.println("======================================================================");
    Serial.println("         ESP32-C3N SOIL MOISTURE CALIBRATION (UPDATED)                ");
    Serial.println("======================================================================");
    Serial.print("Sensor Min Cycle Avg   : "); Serial.print(SOIL_MOISTURE_MIN_CYCLE_AVG_MS); Serial.println(" ms");
    Serial.print("Active Settle / Reset  : "); Serial.print(SOIL_ACTIVE_SETTLE_MS);          Serial.print(" ms / ");
                                               Serial.print(SOIL_ACTIVE_RESET_MS);           Serial.println(" ms");
    Serial.print("Calibration Constants  : ALPHA = "); Serial.print(SOIL_CAL_ALPHA, 4);
                                               Serial.print(" | BETA = "); Serial.println(SOIL_CAL_BETA, 2);
    Serial.println("======================================================================");
}


// ============================================================================
// 4. SOIL MOISTURE READINGS - MAIN EXECUTION LOOP (5-SECOND INTERVAL)
// ============================================================================

void loop() {
    digitalWrite(PIN_SOIL_POWER_GATE, HIGH);
    delay(SOIL_ACTIVE_SETTLE_MS);

    int soilMD0869_Raw = readSoilSensorADC(PIN_SOIL_MD0869_AO);
    delay(5);
    int soilFC28_Raw   = readSoilSensorADC(PIN_SOIL_FC28_AO);

    digitalWrite(PIN_SOIL_POWER_GATE, LOW);
    delay(SOIL_ACTIVE_RESET_MS);

    float soilFC28_Calibrated = calibrateSoilMoistureValue(soilFC28_Raw, SOIL_CAL_ALPHA, SOIL_CAL_BETA);
    float soilMD0869_Percent  = calculateSoilMoisturePercent((float)soilMD0869_Raw);
    float soilFC28_Percent    = calculateSoilMoisturePercent(soilFC28_Calibrated);
    float calibrationError    = soilFC28_Calibrated - (float)soilMD0869_Raw;

    Serial.println("--- SOIL MOISTURE READINGS ---");
    Serial.print("MD0869 (Correct)     -> Raw ADC: ");
    Serial.print(soilMD0869_Raw);
    Serial.print(" | Moisture: ");
    Serial.print(soilMD0869_Percent, 1);
    Serial.println("%");

    Serial.print("FC-28  (Uncorrected) -> Raw ADC: ");
    Serial.print(soilFC28_Raw);
    Serial.print(" | Calibrated ADC: ");
    Serial.print(soilFC28_Calibrated, 0);
    Serial.print(" | Moisture: ");
    Serial.print(soilFC28_Percent, 1);
    Serial.print("% | Diff: ");
    Serial.println(calibrationError, 1);
    Serial.println();

    delay(TERMINAL_REFRESH_DELAY_MS);
}