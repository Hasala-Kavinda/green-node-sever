// ============================================================================
// 1. BH1750 LUX SENSOR - CONSTANTS & CONFIGURATION
// ============================================================================
#include <Wire.h>
#include <BH1750.h>

// --- Pin Assignments for ESP32-C3N SuperMini ---
const int PIN_BH1750_SDA                           = 5;       // GPIO5 -> BH1750 I2C SDA
const int PIN_BH1750_SCL                           = 6;       // GPIO6 -> BH1750 I2C SCL

// --- Timing & Refresh Configuration ---
const unsigned long BH1750_MIN_SETTLE_MS          = 180;     // 180ms power-on integration settling time for BH1750
const unsigned long TERMINAL_REFRESH_DELAY_MS      = 5000;    // 5-second (5000ms) gap between terminal updates

// Instantiate BH1750 light sensor object
BH1750 lightMeter;


// ============================================================================
// 2. BH1750 HELPER & LIGHT LEVEL CLASSIFICATION FUNCTIONS
// ============================================================================

// Categorizes lux readings according to plant growth and environmental stages
const char* categorizeIlluminance(float lux) {
    if (lux < 10.0)      return "🌑 Pitch Dark / Night";
    if (lux < 200.0)     return "💡 Dim Indoor / Low Light";
    if (lux < 1000.0)    return "🏢 Bright Indoor / Office Lighting";
    if (lux < 5000.0)    return "⛅ Overcast Sky / Partial Shade";
    if (lux < 25000.0)   return "🌤️ Daylight / Ambient Outdoor";
    return "☀️ Direct Sunlight (High Intensity)";
}


// ============================================================================
// 3. SYSTEM INITIALIZATION
// ============================================================================

void setup() {
    Serial.begin(115200);
    delay(1500); // Allow native USB-CDC to initialize

    // Initialize I2C communication on custom pins for ESP32-C3N
    Wire.begin(PIN_BH1750_SDA, PIN_BH1750_SCL);

    // Initialize the BH1750 sensor (Default I2C address is 0x23)
    bool sensorOk = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);

    Serial.println("======================================================================");
    Serial.println("           ESP32-C3N BH1750 AMBIENT LIGHT SENSOR TEST                 ");
    Serial.println("======================================================================");
    Serial.print("I2C SDA Pin            : GPIO "); Serial.println(PIN_BH1750_SDA);
    Serial.print("I2C SCL Pin            : GPIO "); Serial.println(PIN_BH1750_SCL);
    Serial.print("Sensor Settling Time   : "); Serial.print(BH1750_MIN_SETTLE_MS); Serial.println(" ms");
    Serial.print("Terminal Refresh Gap   : "); Serial.print(TERMINAL_REFRESH_DELAY_MS); Serial.println(" ms (5 sec)");
    Serial.print("Sensor Status          : ");
    if (sensorOk) {
        Serial.println("✅ Online & Operational");
    } else {
        Serial.println("❌ Offline / Detection Failed! Check wiring (3.3V, GND, GPIO 5/6)");
    }
    Serial.println("======================================================================");

    // Allow sensor to complete initial optical measurement cycle
    delay(BH1750_MIN_SETTLE_MS);
}


// ============================================================================
// 4. BH1750 LUX READINGS - MAIN EXECUTION LOOP (5-SECOND INTERVAL)
// ============================================================================

void loop() {
    // 1. Read ambient illuminance in Lux
    float lux = lightMeter.readLightLevel();

    // 2. Verify reading validity and display formatted metrics
    Serial.println("--- BH1750 AMBIENT LIGHT READING ---");
    if (lux >= 0.0) {
        Serial.print("Illuminance : ");
        Serial.print(lux, 2);
        Serial.println(" lx");

        Serial.print("Category    : ");
        Serial.println(categorizeIlluminance(lux));
    } else {
        Serial.println("⚠️ Warning: BH1750 read error or optical sensor saturation.");
    }
    Serial.println();

    // 3. Wait 5 seconds before next reading cycle
    delay(TERMINAL_REFRESH_DELAY_MS);
}
