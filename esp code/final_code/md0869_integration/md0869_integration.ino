// ============================================================================
// 🌿 GREEN NODE - FINAL INTEGRATION CODE (MD0869 SOIL SENSOR EDITION)
// Microcontroller: ESP32-C3 SuperMini (RISC-V)
// Sensors: MD0869 Soil Moisture, DHT22 (Temp & Hum), BH1750 (Lux), Status LED
// ============================================================================

#include <Wire.h>
#include "DHT.h"
#include <BH1750.h>

// ============================================================================
// 1. PIN ASSIGNMENTS & HARDWARE CONFIGURATION
// ============================================================================

// --- MD0869 Soil Moisture Sensor (ADC1 Pin - Safe with WiFi) ---
const int PIN_SOIL_MD0869_AO                       = 0;       // GPIO0 (ADC1_CH0) -> Analog Out
const int PIN_SOIL_POWER_GATE                      = 2;       // GPIO2 -> Power-Gating VCC (Active HIGH)

// --- DHT22 Temperature & Humidity Sensor ---
const int PIN_DHT_DATA                             = 3;       // GPIO3 -> Single-Wire Digital Data
#define DHTTYPE DHT22

// --- BH1750 Ambient Light Sensor (Dedicated Hardware I2C) ---
const int PIN_BH1750_SDA                           = 5;       // GPIO5 -> Hardware I2C SDA
const int PIN_BH1750_SCL                           = 6;       // GPIO6 -> Hardware I2C SCL

// --- Onboard Status LED ---
const int PIN_STATUS_LED                           = 8;       // GPIO8 -> Blue Status LED (Active LOW)

// ============================================================================
// 2. TIMING & CALIBRATION CONSTANTS
// ============================================================================

// Timing parameters
const unsigned long MD0869_SETTLE_MS               = 80;      // 80ms RC filter stabilization after power-on
const unsigned long MD0869_RESET_MS                = 120;     // 120ms probe discharge after power-off
const unsigned long REFRESH_INTERVAL_MS            = 5000;    // 5-second interval between telemetry reads

// MD0869 Calibration Endpoints (ESP32-C3 12-bit ADC: 0 - 4095)
const int MD0869_DRY_ADC                           = 400;     // Raw ADC in dry air (0% moisture)
const int MD0869_WET_ADC                           = 4058;    // Raw ADC in saturated water (100% moisture)
const int ADC_SAMPLE_COUNT                         = 16;      // Oversampling count per measurement

// Sensor Instances
DHT dht(PIN_DHT_DATA, DHTTYPE);
BH1750 lightMeter;


// ============================================================================
// 3. HELPER FUNCTIONS
// ============================================================================

// Flashes the onboard blue LED
void pulseStatusLed(int durationMs = 40) {
    digitalWrite(PIN_STATUS_LED, LOW);   // ON (active low)
    delay(durationMs);
    digitalWrite(PIN_STATUS_LED, HIGH);  // OFF
}

// Multi-sample ADC averaging with warm-up discard
int readSoilAdcAveraged(int analogPin) {
    for (int i = 0; i < 4; i++) {
        (void)analogRead(analogPin);
        delayMicroseconds(500);
    }
    long sum = 0;
    for (int i = 0; i < ADC_SAMPLE_COUNT; i++) {
        sum += analogRead(analogPin);
        delayMicroseconds(250);
    }
    return (int)(sum / ADC_SAMPLE_COUNT);
}

// Converts raw ADC reading into moisture percentage
float calculateMoisturePercent(int rawAdc) {
    float span = (float)(MD0869_WET_ADC - MD0869_DRY_ADC);
    float percent = (((float)rawAdc - (float)MD0869_DRY_ADC) / span) * 100.0f;
    return constrain(percent, 0.0f, 100.0f);
}

// Classifies ambient lux intensity
const char* classifyLux(float lux) {
    if (lux < 10.0)      return "Dark / Night";
    if (lux < 200.0)     return "Dim Indoor";
    if (lux < 1000.0)    return "Bright Indoor";
    if (lux < 5000.0)    return "Overcast / Shaded";
    return "Direct Sunlight";
}


// ============================================================================
// 4. SYSTEM INITIALIZATION
// ============================================================================

void setup() {
    Serial.begin(115200);
    delay(1500); // Allow native USB-CDC to initialize

    // Initialize Onboard LED
    pinMode(PIN_STATUS_LED, OUTPUT);
    digitalWrite(PIN_STATUS_LED, HIGH); // OFF initially

    // Initialize Soil Power-Gating pin
    pinMode(PIN_SOIL_POWER_GATE, OUTPUT);
    digitalWrite(PIN_SOIL_POWER_GATE, LOW); // Probe powered off initially

    // Configure 12-bit ADC with 11dB attenuation (~2.6V - 3.1V range)
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);

    // Initialize DHT22
    dht.begin();

    // Initialize I2C Bus & BH1750
    Wire.begin(PIN_BH1750_SDA, PIN_BH1750_SCL);
    bool bh1750Online = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);

    Serial.println("\n======================================================================");
    Serial.println("     🌿 GREEN NODE FINAL INTEGRATION - MD0869 EDITION                 ");
    Serial.println("======================================================================");
    Serial.println("HARDWARE PIN ASSIGNMENTS:");
    Serial.println("  • MD0869 Soil Moisture (Ref) : GPIO 0 (ADC1_CH0)");
    Serial.println("  • Soil VCC Power Gate        : GPIO 2 (Electrolysis Protection)");
    Serial.println("  • DHT22 Temp & Humidity      : GPIO 3 (Digital Single-Wire)");
    Serial.println("  • BH1750 Ambient Light (SDA) : GPIO 5 (I2C SDA)");
    Serial.println("  • BH1750 Ambient Light (SCL) : GPIO 6 (I2C SCL)");
    Serial.println("  • Onboard Status Indicator   : GPIO 8 (Active LOW)");
    Serial.println("----------------------------------------------------------------------");
    Serial.print("BH1750 Sensor Status         : ");
    Serial.println(bh1750Online ? "✅ ONLINE (Address 0x23)" : "❌ OFFLINE (Check wiring)");
    Serial.print("Refresh Interval             : ");
    Serial.print(REFRESH_INTERVAL_MS);
    Serial.println(" ms (5 sec)");
    Serial.println("======================================================================\n");

    delay(200);
}


// ============================================================================
// 5. MAIN EXECUTION LOOP (5-SECOND INTERVAL)
// ============================================================================

void loop() {
    // ------------------------------------------------------------------------
    // Step 1: Read MD0869 Soil Moisture with Power Gating
    // ------------------------------------------------------------------------
    digitalWrite(PIN_SOIL_POWER_GATE, HIGH); // Power ON probe
    delay(MD0869_SETTLE_MS);

    int soilRaw = readSoilAdcAveraged(PIN_SOIL_MD0869_AO);

    digitalWrite(PIN_SOIL_POWER_GATE, LOW);  // Power OFF probe (stops corrosion)
    delay(MD0869_RESET_MS);

    float soilPercent = calculateMoisturePercent(soilRaw);

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
    // Step 4: Visual Status Feedback
    // ------------------------------------------------------------------------
    pulseStatusLed(40);

    // ------------------------------------------------------------------------
    // Step 5: Formatted Telemetry Output
    // ------------------------------------------------------------------------
    Serial.println("┌─────────────────────────── TELEMETRY REPORT ───────────────────────────┐");

    // Soil Moisture
    Serial.printf("│ 🌱 Soil Moisture (MD0869) : %5.1f %%  (Raw ADC: %4d / 4095)              │\n", soilPercent, soilRaw);

    // Temperature & Humidity
    if (dhtValid) {
        Serial.printf("│ 🌡️  Temperature           : %5.2f °C  (Heat Index: %5.2f °C)              │\n", temperature, heatIndex);
        Serial.printf("│ 💧 Relative Humidity      : %5.2f %%                                      │\n", humidity);
    } else {
        Serial.println("│ ⚠️  DHT22 Environmental    : Read Error (NaN) Check GPIO 3 wiring       │");
    }

    // Light
    if (luxValid) {
        Serial.printf("│ ☀️  Ambient Light (BH1750) : %7.1f lx  [%-18s]           │\n", lux, classifyLux(lux));
    } else {
        Serial.println("│ ⚠️  BH1750 Light Sensor    : Read Error Check GPIO 5/6 I2C             │");
    }

    Serial.println("└────────────────────────────────────────────────────────────────────────┘\n");

    // ------------------------------------------------------------------------
    // Step 6: Wait before next cycle
    // ------------------------------------------------------------------------
    delay(REFRESH_INTERVAL_MS);
}
