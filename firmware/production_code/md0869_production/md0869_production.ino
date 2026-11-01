// ============================================================================
// 🌿 GREEN NODE - PRODUCTION FIRMWARE (MD0869 SOIL SENSOR EDITION)
// Microcontroller : ESP32-C3 SuperMini (RISC-V)
// Sensors         : MD0869 Soil Moisture, DHT22 (Temp & Hum), BH1750 (Lux)
// Connectivity    : 2.4GHz Wi-Fi (Built-in)
// Time Source     : Sri Lanka Standard Time (UTC+5:30) via NTP
// Backend Target  : HTTP POST /api/readings
// ============================================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include "DHT.h"
#include <BH1750.h>
#include <time.h>

// ============================================================================
// 1. USER CONFIGURATION & CONSTANTS
// ============================================================================

// --- Network & Backend Configuration ---
const char* WIFI_SSID                              = "Malith's A55";                          // Wi-Fi Network Name
const char* WIFI_PASSWORD                          = "malith26";                              // Wi-Fi Password
const char* BACKEND_URL                            = "https://green-node-backend-lskq.onrender.com/api/readings"; // Target endpoint (or your render URL)
const char* DEVICE_ID                              = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"; // Registered Device UUID

// --- Telemetry & Timing Intervals ---
const unsigned long REFRESH_INTERVAL_MS            = 10000;   // Interval between telemetry transmissions (10 sec)
const unsigned long WIFI_TIMEOUT_MS                = 15000;   // Max time to wait for Wi-Fi association (15 sec)
const unsigned long HTTP_TIMEOUT_MS                = 8000;    // HTTP request timeout (8 sec)

// --- Time Service (Sri Lanka Standard Time: UTC+5:30, No DST) ---
const char* NTP_SERVER_PRIMARY                     = "pool.ntp.org";
const char* NTP_SERVER_FALLBACK                    = "time.google.com";
const long  GMT_OFFSET_SEC                         = 19800;   // UTC+5:30 (5.5 hours * 3600 = 19800 seconds)
const int   DAYLIGHT_OFFSET_SEC                    = 0;       // Sri Lanka has no Daylight Saving Time

// --- MD0869 Soil Moisture Sensor Hardware & Timing ---
const int PIN_SOIL_MD0869_AO                       = 0;       // GPIO0 (ADC1_CH0) -> Reference Sensor Analog Out
const int PIN_SOIL_POWER_GATE                      = 2;       // GPIO2 -> Dedicated VCC Power-Gate
const unsigned long MD0869_SETTLE_MS               = 80;      // 80ms RC filter stabilization after power-on
const unsigned long MD0869_RESET_MS                = 120;     // 120ms probe discharge after power-off
const int MD0869_DRY_ADC                           = 400;     // Raw ADC in dry air (0% moisture)
const int MD0869_WET_ADC                           = 4058;    // Raw ADC in saturated water (100% moisture)
const int ADC_SAMPLE_COUNT                         = 16;      // Oversampling filter count

// --- DHT22 Environmental Sensor ---
const int PIN_DHT_DATA                             = 3;       // GPIO3 -> Single-Wire Digital Data
#define DHTTYPE DHT22

// --- BH1750 Ambient Light Sensor ---
const int PIN_BH1750_SDA                           = 5;       // GPIO5 -> Hardware I2C SDA
const int PIN_BH1750_SCL                           = 6;       // GPIO6 -> Hardware I2C SCL

// --- Onboard Status Indicator ---
const int PIN_STATUS_LED                           = 8;       // GPIO8 -> Onboard Blue LED (Active LOW)

// ============================================================================
// 2. HARDWARE INSTANCES & DATA STRUCTURES
// ============================================================================

DHT dht(PIN_DHT_DATA, DHTTYPE);
BH1750 lightMeter;

struct SensorTelemetry {
    int   soilRaw;
    float soilMoisture;
    float temperature;
    float humidity;
    bool  dhtValid;
    float lightLux;
    bool  lightValid;
    float espTemperature;
    int   rssi;
    String wifiSsid;
    String timestamp;
};

// ============================================================================
// 3. UTILITY & HARDWARE HELPER FUNCTIONS
// ============================================================================

void pulseStatusLed(int durationMs = 40) {
    digitalWrite(PIN_STATUS_LED, LOW);   // ON (active low)
    delay(durationMs);
    digitalWrite(PIN_STATUS_LED, HIGH);  // OFF
}

const char* classifyLux(float lux) {
    if (lux < 10.0f)     return "Dark / Night";
    if (lux < 200.0f)    return "Dim Indoor";
    if (lux < 1000.0f)   return "Bright Indoor";
    if (lux < 5000.0f)   return "Overcast / Shaded";
    return "Direct Sunlight";
}

// ============================================================================
// 4. SENSOR ACQUISITION MODULES
// ============================================================================

// Multi-sample ADC averaging with initial transient discard
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

// Converts ADC value to moisture percentage
float calculateMoisturePercent(int rawAdc) {
    float span = (float)(MD0869_WET_ADC - MD0869_DRY_ADC);
    float percent = (((float)rawAdc - (float)MD0869_DRY_ADC) / span) * 100.0f;
    return constrain(percent, 0.0f, 100.0f);
}

// Reads MD0869 sensor with power gating
void sampleSoilSensor(SensorTelemetry& data) {
    // 1. Energize probe
    digitalWrite(PIN_SOIL_POWER_GATE, HIGH);
    delay(MD0869_SETTLE_MS);

    // 2. Read ADC
    data.soilRaw = readSoilAdcAveraged(PIN_SOIL_MD0869_AO);

    // 3. De-energize immediately to prevent electrolysis and save power
    digitalWrite(PIN_SOIL_POWER_GATE, LOW);
    delay(MD0869_RESET_MS);

    // 4. Calculate moisture percentage
    data.soilMoisture = calculateMoisturePercent(data.soilRaw);
}

void sampleEnvironmentalSensor(SensorTelemetry& data) {
    data.humidity    = dht.readHumidity();
    data.temperature = dht.readTemperature();
    data.dhtValid    = !isnan(data.humidity) && !isnan(data.temperature);
    if (!data.dhtValid) {
        data.humidity    = 0.0f;
        data.temperature = 0.0f;
    }
}

void sampleLightSensor(SensorTelemetry& data) {
    data.lightLux   = lightMeter.readLightLevel();
    data.lightValid = (data.lightLux >= 0.0f);
    if (!data.lightValid) {
        data.lightLux = 0.0f;
    }
}

void sampleInternalMetrics(SensorTelemetry& data) {
    data.espTemperature = temperatureRead();
    data.rssi           = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : 0;
    data.wifiSsid       = (WiFi.status() == WL_CONNECTED) ? WiFi.SSID() : "";
}

// ============================================================================
// 5. WI-FI & TIME SERVICES
// ============================================================================

bool connectToWiFi() {
    Serial.printf("\n[WiFi] Connecting to \"%s\"", WIFI_SSID);

    WiFi.disconnect(true);
    delay(200);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    // Cap RF TX power AFTER WiFi.begin to prevent brownout current spikes on ESP32-C3 SuperMini
    WiFi.setTxPower(WIFI_POWER_11dBm);

    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - start < WIFI_TIMEOUT_MS)) {
        digitalWrite(PIN_STATUS_LED, !digitalRead(PIN_STATUS_LED));
        delay(300);
        Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
        digitalWrite(PIN_STATUS_LED, HIGH); // OFF when connected
        Serial.printf("\n[WiFi] ✅ Connected! IP: %s | RSSI: %d dBm\n",
                      WiFi.localIP().toString().c_str(), WiFi.RSSI());
        return true;
    } else {
        digitalWrite(PIN_STATUS_LED, LOW);  // ON if failed
        Serial.println("\n[WiFi] ❌ Connection timed out.");
        return false;
    }
}

void initTimeService() {
    Serial.println("[NTP]  Initialising time sync for Sri Lanka (UTC+5:30)...");
    configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER_PRIMARY, NTP_SERVER_FALLBACK);
}

String getIso8601Timestamp() {
    struct tm timeinfo;
    if (!getLocalTime(&timeinfo)) {
        return ""; // If not synced yet, return empty string so backend uses server reception time
    }
    // Convert local SLST to UTC for ISO-8601 'Z' standard
    time_t local = mktime(&timeinfo);
    time_t utc   = local - GMT_OFFSET_SEC;
    struct tm* utcTm = gmtime(&utc);

    char buffer[32];
    strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", utcTm);
    return String(buffer);
}

// ============================================================================
// 6. HTTP TELEMETRY DISPATCH
// ============================================================================

void sendTelemetryHttp(const SensorTelemetry& data) {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[HTTP] ⚠️ WiFi disconnected. Skipping POST.");
        return;
    }

#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument doc;
#else
    StaticJsonDocument<512> doc;
#endif

    doc["deviceId"]       = DEVICE_ID;
    doc["temperature"]    = serialized(String(data.temperature, 2));
    doc["humidity"]       = serialized(String(data.humidity, 2));
    doc["soilMoisture"]   = serialized(String(data.soilMoisture, 1));
    doc["light"]          = serialized(String(data.lightLux, 1));
    doc["espTemperature"] = serialized(String(data.espTemperature, 2));
    doc["wifiSsid"]       = data.wifiSsid;

    if (data.timestamp.length() > 0) {
        doc["timestamp"]  = data.timestamp;
    }

    JsonObject metadata  = doc["metadata"].to<JsonObject>();
    metadata["chip"]     = "esp32-c3-supermini";
    metadata["rssi"]     = data.rssi;
    metadata["soilRaw"]  = data.soilRaw;

    String jsonPayload;
    serializeJson(doc, jsonPayload);

    HTTPClient http;
    http.begin(BACKEND_URL);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(HTTP_TIMEOUT_MS);

    int httpCode = http.POST(jsonPayload);
    if (httpCode > 0) {
        Serial.printf("[HTTP] ✅ POST %d | Size: %d bytes\n", httpCode, jsonPayload.length());
    } else {
        Serial.printf("[HTTP] ❌ POST Failed: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
}

// ============================================================================
// 7. SYSTEM INITIALIZATION (setup)
// ============================================================================

void setup() {
    Serial.begin(115200);

    // Allow time for host USB CDC enumeration
    delay(1500);

    // Handshake: wait up to 3 seconds if Serial Monitor is connecting
    unsigned long startSerialWait = millis();
    while (!Serial && (millis() - startSerialWait < 3000)) {
        delay(10);
    }

    // Initialize Onboard Status LED
    pinMode(PIN_STATUS_LED, OUTPUT);
    digitalWrite(PIN_STATUS_LED, HIGH); // OFF initially

    // Initialize Soil Power-Gate (De-energized at boot)
    pinMode(PIN_SOIL_POWER_GATE, OUTPUT);
    digitalWrite(PIN_SOIL_POWER_GATE, LOW);

    // Configure 12-bit ADC (0 - 4095) with 11dB attenuation
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);

    // Initialize DHT22
    dht.begin();

    // Initialize BH1750 I2C
    Wire.begin(PIN_BH1750_SDA, PIN_BH1750_SCL);
    bool bh1750Online = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);

    Serial.println("\n======================================================================");
    Serial.println("     🌿 GREEN NODE PRODUCTION FIRMWARE - MD0869 SOIL EDITION           ");
    Serial.println("======================================================================");
    Serial.println("HARDWARE PIN ASSIGNMENTS:");
    Serial.println("  • MD0869 Soil Moisture (AO)  : GPIO 0 (ADC1_CH0 - Safe with WiFi)");
    Serial.println("  • Soil VCC Power Gate        : GPIO 2 (Electrolysis & Brownout Guard)");
    Serial.println("  • DHT22 Temp & Humidity      : GPIO 3 (Digital Single-Wire)");
    Serial.println("  • BH1750 Ambient Light (SDA) : GPIO 5 (I2C SDA)");
    Serial.println("  • BH1750 Ambient Light (SCL) : GPIO 6 (I2C SCL)");
    Serial.println("  • Onboard Status Indicator   : GPIO 8 (Active LOW)");
    Serial.println("----------------------------------------------------------------------");
    Serial.print("BH1750 Sensor Status         : ");
    Serial.println(bh1750Online ? "✅ ONLINE (Address 0x23)" : "❌ OFFLINE (Check wiring)");
    Serial.printf("Calibrated Range (ADC)       : Dry = %d | Wet = %d\n", MD0869_DRY_ADC, MD0869_WET_ADC);
    Serial.printf("Telemetry Interval           : %lu ms\n", REFRESH_INTERVAL_MS);
    Serial.printf("Backend Endpoint             : %s\n", BACKEND_URL);
    Serial.printf("Target Device UUID           : %s\n", DEVICE_ID);
    Serial.println("======================================================================\n");

    // Connect to Wi-Fi
    connectToWiFi();

    // Start NTP background time sync
    initTimeService();

    delay(200);
}

// ============================================================================
// 8. MAIN EXECUTION LOOP
// ============================================================================

void loop() {
    // 1. Maintain Wi-Fi connectivity
    if (WiFi.status() != WL_CONNECTED) {
        connectToWiFi();
    }

    // 2. Sample all sensors sequentially
    SensorTelemetry data;
    sampleSoilSensor(data);             // Gated reading: probe is turned OFF before Wi-Fi TX
    sampleEnvironmentalSensor(data);
    sampleLightSensor(data);
    sampleInternalMetrics(data);
    data.timestamp = getIso8601Timestamp();

    // 3. Visual feedback
    pulseStatusLed(40);

    // 4. Formatted Terminal Dashboard
    Serial.println("┌─────────────────────────── TELEMETRY REPORT ───────────────────────────┐");
    Serial.printf("│ 🕐 Timestamp (UTC ISO)     : %-44s│\n",
                  data.timestamp.length() > 0 ? data.timestamp.c_str() : "(Syncing with NTP...)");
    Serial.printf("│ 🌱 Soil Moisture (MD0869)  : %5.1f %%  (Raw ADC: %4d / 4095)           │\n",
                  data.soilMoisture, data.soilRaw);
    if (data.dhtValid) {
        Serial.printf("│ 🌡️  Temperature           : %5.2f °C                                     │\n", data.temperature);
        Serial.printf("│ 💧 Relative Humidity      : %5.2f %%                                      │\n", data.humidity);
    } else {
        Serial.println("│ ⚠️  DHT22 Environmental    : Read Error (NaN) Check GPIO 3 wiring       │");
    }
    if (data.lightValid) {
        Serial.printf("│ ☀️  Ambient Light (BH1750) : %7.1f lx  [%-18s]           │\n", data.lightLux, classifyLux(data.lightLux));
    } else {
        Serial.println("│ ⚠️  BH1750 Light Sensor    : Read Error Check GPIO 5/6 I2C             │");
    }
    Serial.printf("│ 🔥 ESP32 Internal Temp     : %5.2f °C                                     │\n", data.espTemperature);
    Serial.printf("│ 📶 Wi-Fi Signal (RSSI)     : %d dBm (SSID: %s)                     │\n",
                  data.rssi, data.wifiSsid.c_str());
    Serial.println("└────────────────────────────────────────────────────────────────────────┘\n");

    // 5. Send JSON to backend (probe is guaranteed OFF, safe from brownout)
    sendTelemetryHttp(data);

    // 6. Wait for next interval
    delay(REFRESH_INTERVAL_MS);
}
