// ============================================================================
// 1. DHT22 TEMPERATURE & HUMIDITY SENSOR - CONSTANTS & CONFIGURATION
// ============================================================================
#include "DHT.h"

// --- Pin Assignments for ESP32-C3N SuperMini ---
const int PIN_DHT_DATA                             = 3;       // GPIO3 -> DHT22 Digital Data Pin
#define DHTTYPE DHT22                                         // DHT 22 (AM2302, AM2321)

// --- Timing & Refresh Configuration ---
const unsigned long DHT22_MIN_SETTLE_MS            = 2000;    // 2-second minimum sampling interval for DHT22
const unsigned long TERMINAL_REFRESH_DELAY_MS      = 5000;    // 5-second (5000ms) gap between terminal updates

// Instantiate DHT sensor object
DHT dht(PIN_DHT_DATA, DHTTYPE);


// ============================================================================
// 2. DHT22 HELPER & CALCULATION FUNCTIONS
// ============================================================================

// Evaluates comfort index or thermal state from temperature & humidity
const char* evaluateThermalComfort(float tempC, float humidity) {
    if (tempC < 15.0) return "❄️ Cold / Low Temperature";
    if (tempC > 32.0 && humidity > 70.0) return "🔥 Hot & Humid (High Heat Stress)";
    if (tempC > 30.0) return "☀️ Warm / Elevated Temperature";
    if (humidity < 30.0) return "🌵 Dry Environment";
    if (humidity > 80.0) return "💦 Very High Humidity";
    return "🌿 Optimal Comfort Zone";
}


// ============================================================================
// 3. SYSTEM INITIALIZATION
// ============================================================================

void setup() {
    Serial.begin(115200);
    delay(1500); // Allow native USB-CDC to initialize

    // Initialize DHT sensor
    dht.begin();

    Serial.println("======================================================================");
    Serial.println("         ESP32-C3N DHT22 TEMPERATURE & HUMIDITY SENSOR TEST           ");
    Serial.println("======================================================================");
    Serial.print("Data Pin               : GPIO "); Serial.println(PIN_DHT_DATA);
    Serial.print("Sensor Model           : DHT22 / AM2302\n");
    Serial.print("Sensor Settling Time   : "); Serial.print(DHT22_MIN_SETTLE_MS); Serial.println(" ms");
    Serial.print("Terminal Refresh Gap   : "); Serial.print(TERMINAL_REFRESH_DELAY_MS); Serial.println(" ms (5 sec)");
    Serial.println("======================================================================");

    // Initial settling time for DHT sensor internal capacitor
    delay(DHT22_MIN_SETTLE_MS);
}


// ============================================================================
// 4. DHT22 READINGS - MAIN EXECUTION LOOP (5-SECOND INTERVAL)
// ============================================================================

void loop() {
    // 1. Read temperature in Celsius and relative humidity (%)
    float humidity    = dht.readHumidity();
    float temperature = dht.readTemperature();

    // 2. Verify reading validity (DHT returns NaN on transmission or checksum failure)
    if (isnan(humidity) || isnan(temperature)) {
        Serial.println("⚠️ Warning: Failed to read from DHT22 sensor!");
        Serial.println("   Check: 3.3V power, GND, GPIO 3 connection, and 10k pullup resistor.");
        Serial.println();
    } else {
        // 3. Compute Heat Index (perceived temperature in Celsius)
        float heatIndex = dht.computeHeatIndex(temperature, humidity, false);

        // 4. Formatted output to Serial Monitor
        Serial.println("--- DHT22 ENVIRONMENTAL READINGS ---");
        Serial.print("Temperature : ");
        Serial.print(temperature, 2);
        Serial.println(" °C");

        Serial.print("Humidity    : ");
        Serial.print(humidity, 2);
        Serial.println(" % RH");

        Serial.print("Heat Index  : ");
        Serial.print(heatIndex, 2);
        Serial.println(" °C");

        Serial.print("Status      : ");
        Serial.println(evaluateThermalComfort(temperature, humidity));
        Serial.println();
    }

    // 5. Wait 5 seconds before next reading cycle
    delay(TERMINAL_REFRESH_DELAY_MS);
}
