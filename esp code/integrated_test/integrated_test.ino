// ============================================================================
// 1. ESP32-C3 SUPERMINI MULTI-SENSOR INTEGRATION TEST - CONFIGURATION
// ============================================================================
#include <Wire.h>
#include "DHT.h"
#include <BH1750.h>

// --- Pin Assignments for ESP32-C3N SuperMini ---
// 1. Soil Moisture (Single Reference Sensor - ADC1_CH0)
const int PIN_SOIL_MD0869_AO                       = 0;       // GPIO0 (ADC1_CH0) -> MD0869 Reference Soil Sensor
const int PIN_SOIL_POWER_GATE                      = 2;       // GPIO2 -> VCC Power-Gating Pin

// 2. DHT22 Temperature & Humidity (Digital Single-Wire Bus)
const int PIN_DHT_DATA                             = 3;       // GPIO3 -> DHT22 Digital Data Pin
#define DHTTYPE DHT22

// 3. BH1750 Ambient Light Sensor (Dedicated Hardware I2C Bus)
const int PIN_BH1750_SDA                           = 5;       // GPIO5 -> BH1750 I2C SDA
const int PIN_BH1750_SCL                           = 6;       // GPIO6 -> BH1750 I2C SCL

// 4. Onboard Status LED
const int PIN_STATUS_LED                           = 8;       // GPIO8 -> Onboard Blue LED (Active LOW)

// --- Timing Configurations ---
const unsigned long SOIL_SETTLE_MS                 = 80;      // MD0869 settle time after power-on
const unsigned long SOIL_RESET_MS                  = 120;     // Probe discharge time after power-off
const unsigned long TERMINAL_REFRESH_DELAY_MS      = 5000;    // 5-second interval between dashboard updates

// --- Calibration Endpoints for MD0869 Soil Moisture ---
const int MD0869_DRY_RAW_ADC                       = 400;     // Dry air baseline (0%)
const int MD0869_WET_RAW_ADC                       = 4058;    // Water saturation baseline (100%)
const int SOIL_ADC_SAMPLES                         = 16;      // ADC oversampling filter count

// Instantiate Sensor Objects
DHT dht(PIN_DHT_DATA, DHTTYPE);
BH1750 lightMeter;


// ============================================================================
// 2. HELPER & SENSOR PROCESSING FUNCTIONS
// ============================================================================

// Blinks the onboard blue LED for visual feedback (Active LOW on ESP32-C3)
void pulseLed(int durationMs = 40) {
    digitalWrite(PIN_STATUS_LED, LOW);   // ON
    delay(durationMs);
    digitalWrite(PIN_STATUS_LED, HIGH);  // OFF
}

// Multi-sample ADC reading with initial transient discard
int readSoilAdcAveraged(int analogPin) {
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

// Converts raw ADC to calibrated percentage
float calculateMoisturePercent(int rawAdc) {
    float span = (float)(MD0869_WET_RAW_ADC - MD0869_DRY_RAW_ADC);
    float percent = (((float)rawAdc - (float)MD0869_DRY_RAW_ADC) / span) * 100.0f;
    return constrain(percent, 0.0f, 100.0f);
}

// Classifies ambient lux level
const char* classifyLux(float lux) {
    if (lux < 10.0)      return "Dark / Night";
    if (lux < 200.0)     return "Dim Indoor";
    if (lux < 1000.0)    return "Bright Indoor";
    if (lux < 5000.0)    return "Overcast / Shaded";
    return "Direct Sunlight";
}


// ============================================================================
// 3. SYSTEM INITIALIZATION
// ============================================================================

void setup() {
    Serial.begin(115200);
    delay(1500); // Allow native USB-CDC to initialize

    // Initialize Onboard LED
    pinMode(PIN_STATUS_LED, OUTPUT);
    digitalWrite(PIN_STATUS_LED, HIGH); // OFF initially

    // Initialize Soil Power Gate
    pinMode(PIN_SOIL_POWER_GATE, OUTPUT);
    digitalWrite(PIN_SOIL_POWER_GATE, LOW);

    // Initialize ADC (12-bit, 11dB attenuation)
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);

    // Initialize DHT22
    dht.begin();

    // Initialize I2C Bus & BH1750
    Wire.begin(PIN_BH1750_SDA, PIN_BH1750_SCL);
    bool bh1750Ok = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);

    Serial.println("\n======================================================================");
    Serial.println("     🌿 GREEN NODE - ESP32-C3 SUPERMINI ALL-IN-ONE SENSOR TEST        ");
    Serial.println("======================================================================");
    Serial.println("PIN MAPPING:");
    Serial.println("  • MD0869 Soil Moisture (Ref) : GPIO 0 (ADC1_CH0)");
    Serial.println("  • Soil VCC Power Gate        : GPIO 2");
    Serial.println("  • DHT22 Temp & Humidity      : GPIO 3");
    Serial.println("  • BH1750 I2C Data (SDA)      : GPIO 5");
    Serial.println("  • BH1750 I2C Clock (SCL)     : GPIO 6");
    Serial.println("  • Onboard Status LED         : GPIO 8");
    Serial.println("----------------------------------------------------------------------");
    Serial.print("BH1750 Status                : ");
    Serial.println(bh1750Ok ? "✅ ONLINE" : "❌ OFFLINE (Check wiring)");
    Serial.print("Refresh Interval             : ");
    Serial.print(TERMINAL_REFRESH_DELAY_MS);
    Serial.println(" ms (5 sec)");
    Serial.println("======================================================================\n");

    delay(200);
}


// ============================================================================
// 4. MULTI-SENSOR MAIN LOOP (5-SECOND INTERVAL)
// ============================================================================

void loop() {
    // ------------------------------------------------------------------------
    // Step 1: Read Soil Moisture (MD0869 Gated Power Cycle)
    // ------------------------------------------------------------------------
    digitalWrite(PIN_SOIL_POWER_GATE, HIGH); // Turn power ON
    delay(SOIL_SETTLE_MS);

    int soilRaw = readSoilAdcAveraged(PIN_SOIL_MD0869_AO);

    digitalWrite(PIN_SOIL_POWER_GATE, LOW);  // Turn power OFF
    delay(SOIL_RESET_MS);

    float soilPct = calculateMoisturePercent(soilRaw);

    // ------------------------------------------------------------------------
    // Step 2: Read DHT22 (Temperature & Humidity)
    // ------------------------------------------------------------------------
    float humidity    = dht.readHumidity();
    float temperature = dht.readTemperature();
    bool dhtValid     = !isnan(humidity) && !isnan(temperature);
    float heatIndex   = dhtValid ? dht.computeHeatIndex(temperature, humidity, false) : 0.0f;

    // ------------------------------------------------------------------------
    // Step 3: Read BH1750 (Ambient Light in Lux)
    // ------------------------------------------------------------------------
    float lux = lightMeter.readLightLevel();
    bool luxValid = (lux >= 0.0f);

    // ------------------------------------------------------------------------
    // Step 4: Visual Activity Feedback
    // ------------------------------------------------------------------------
    pulseLed(50); // Flash LED on measurement completion

    // ------------------------------------------------------------------------
    // Step 5: Formatted Unified Dashboard Output
    // ------------------------------------------------------------------------
    Serial.println("┌─────────────────────────── TELEMETRY REPORT ───────────────────────────┐");

    // Soil Moisture section
    Serial.printf("│ 🌱 Soil Moisture (MD0869) : %5.1f %%  (Raw ADC: %4d / 4095)              │\n", soilPct, soilRaw);

    // Temperature & Humidity section
    if (dhtValid) {
        Serial.printf("│ 🌡️  Temperature           : %5.2f °C  (Heat Index: %5.2f °C)              │\n", temperature, heatIndex);
        Serial.printf("│ 💧 Relative Humidity      : %5.2f %%                                      │\n", humidity);
    } else {
        Serial.println("│ ⚠️  DHT22 Environmental    : Read Error (NaN) Check GPIO 3 wiring       │");
    }

    // BH1750 Ambient Light section
    if (luxValid) {
        Serial.printf("│ ☀️  Ambient Light (BH1750) : %7.1f lx  [%-18s]           │\n", lux, classifyLux(lux));
    } else {
        Serial.println("│ ⚠️  BH1750 Light Sensor    : Read Error Check GPIO 5/6 I2C             │");
    }

    Serial.println("└────────────────────────────────────────────────────────────────────────┘\n");

    // ------------------------------------------------------------------------
    // Step 6: Wait 5 seconds before next polling cycle
    // ------------------------------------------------------------------------
    delay(TERMINAL_REFRESH_DELAY_MS);
}
