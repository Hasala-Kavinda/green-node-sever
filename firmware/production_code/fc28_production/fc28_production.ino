// ============================================================================
// 🌿 GREEN NODE - PRODUCTION FIRMWARE (FC-28 SOIL SENSOR EDITION)
// Microcontroller : ESP32-C3 SuperMini (RISC-V, single-core)
// Sensors         : FC-28 Soil Moisture, DHT22 (Temp & Hum), BH1750 (Lux)
// Connectivity    : 2.4GHz Wi-Fi 802.11 b/g/n (built-in)
// Time Source     : NTP (pool.ntp.org) → Sri Lanka Standard Time (UTC+5:30)
// Backend         : HTTP POST → /api/readings (JSON telemetry payload)
// ============================================================================
//
// ⚠️  BROWNOUT PROTECTION NOTICE (ESP32-C3 SuperMini)
// The onboard LDO regulator supplies ~150-300 mA continuous. Wi-Fi RF bursts
// at default TX power (+20 dBm) can spike 350-500 mA and crash the board.
// This firmware enforces two protections:
//   1. Wi-Fi TX power is capped at 11 dBm (safe < 180 mA RF current).
//   2. The soil probe is ALWAYS de-energised before any HTTP transmission.
//      ADC sampling and Wi-Fi TX never run at the same instant.
//
// ============================================================================


// ============================================================================
// SECTION 1 — LIBRARIES
// ============================================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include "DHT.h"
#include <BH1750.h>
#include <time.h>


// ============================================================================
// SECTION 2 — USER CONFIGURATION  ← Editor changes values in this section
// ============================================================================

// ----------------------------------------------------------------------------
// 2A. Network & Backend Credentials
// ----------------------------------------------------------------------------
const char* WIFI_SSID              = "Malith's A55";                              // <-- Your Wi-Fi SSID
const char* WIFI_PASSWORD          = "malith26";                                  // <-- Your Wi-Fi Password
const char* BACKEND_URL            = "https://<your-render-app>.onrender.com/api/readings"; // <-- Backend POST endpoint
const char* DEVICE_ID              = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";     // <-- Device UUID

// ----------------------------------------------------------------------------
// 2B. Wi-Fi Behaviour & Brownout Protection
// ----------------------------------------------------------------------------
const wifi_power_t WIFI_TX_POWER   = WIFI_POWER_11dBm;   // RF cap: ~11 dBm keeps peak current safe on SuperMini LDO
const unsigned long WIFI_TIMEOUT_MS  = 20000;             // 20 s max wait for initial Wi-Fi association
const unsigned long HTTP_TIMEOUT_MS  = 8000;              // 8 s HTTP response timeout (Render cold-start buffer)

// ----------------------------------------------------------------------------
// 2C. Telemetry Interval
// ----------------------------------------------------------------------------
const unsigned long TELEMETRY_INTERVAL_MS = 15000;        // POST interval: 15 s (minimum recommended for free Render tier)

// ----------------------------------------------------------------------------
// 2D. NTP / Time Configuration — Sri Lanka Standard Time (UTC+5:30, no DST)
// ----------------------------------------------------------------------------
const char* NTP_PRIMARY   = "pool.ntp.org";
const char* NTP_FALLBACK  = "time.google.com";
const long  GMT_OFFSET_SEC   = 19800;                     // UTC+5:30 → 5*3600 + 30*60 = 19800 seconds
const int   DAYLIGHT_OFFSET  = 0;                         // Sri Lanka has no daylight saving time
const unsigned long NTP_SYNC_TIMEOUT_MS = 10000;          // 10 s to wait for first NTP sync

// ----------------------------------------------------------------------------
// 2E. FC-28 Soil Moisture Sensor — Timing & ADC Endpoints
// ----------------------------------------------------------------------------
const unsigned long FC28_SETTLE_MS = 20;                  // 20 ms: RC filter stabilisation after probe power-on
const unsigned long FC28_RESET_MS  = 40;                  // 40 ms: probe capacitance discharge after power-off
const int FC28_DRY_RAW_ADC         = 400;                 // Calibrated dry air baseline (0 % moisture)
const int FC28_WET_RAW_ADC         = 4095;                // Calibrated saturated water baseline (100 % moisture)
const int FC28_ADC_SAMPLES         = 16;                  // Oversampling count per measurement cycle

// --- Linear Calibration: y = (FC28_CAL_A × rawAdc) + FC28_CAL_B
// ⚠️ Set your measured calibration constants here before deployment.
// Defaults are 0.0 (initial / uncalibrated state): raw ADC is passed through unchanged.
const float FC28_CAL_A             = 0.0f;                // Slope / gain  'a'  (User adjustable)
const float FC28_CAL_B             = 0.0f;                // Intercept 'b'       (User adjustable)

// ----------------------------------------------------------------------------
// 2F. DHT22 Temperature & Humidity — Validation Bounds
// ----------------------------------------------------------------------------
const float DHT22_TEMP_MIN         = -40.0f;              // °C — sensor rated range lower bound
const float DHT22_TEMP_MAX         =  80.0f;              // °C — sensor rated range upper bound
const float DHT22_HUM_MIN          =   0.0f;              // %RH
const float DHT22_HUM_MAX          = 100.0f;              // %RH

// ----------------------------------------------------------------------------
// 2G. BH1750 Ambient Light — Validation Bound
// ----------------------------------------------------------------------------
const float BH1750_LUX_MIN         = 0.0f;                // lx — reject negative sentinel values

// ----------------------------------------------------------------------------
// 2H. ESP32 Internal Temperature — Validation Bounds
// ----------------------------------------------------------------------------
const float ESP_TEMP_MIN           = -40.0f;              // °C
const float ESP_TEMP_MAX           = 125.0f;              // °C


// ============================================================================
// SECTION 3 — PIN ASSIGNMENTS  (do not change unless rewiring hardware)
// ============================================================================

const int PIN_SOIL_FC28_AO   = 1;    // GPIO1  → ADC1_CH1 → FC-28 Analog Output (ADC1 safe with Wi-Fi)
const int PIN_SOIL_POWER_GATE = 2;   // GPIO2  → FC-28 VCC power-gate (HIGH = probe ON, LOW = probe OFF)
const int PIN_DHT_DATA        = 3;   // GPIO3  → DHT22 single-wire data
const int PIN_BH1750_SDA      = 5;   // GPIO5  → BH1750 I2C SDA
const int PIN_BH1750_SCL      = 6;   // GPIO6  → BH1750 I2C SCL
const int PIN_STATUS_LED      = 8;   // GPIO8  → Onboard blue LED (active LOW)

#define DHTTYPE DHT22


// ============================================================================
// SECTION 4 — SENSOR INSTANCE DECLARATIONS
// ============================================================================

DHT    dht(PIN_DHT_DATA, DHTTYPE);
BH1750 lightMeter;


// ============================================================================
// SECTION 5 — DATA MODEL
// ============================================================================

struct SensorReading {
    // Soil Moisture
    int   soilRawAdc;           // Raw 12-bit ADC value (0–4095)
    float soilCalibratedAdc;    // After linear calibration y = ax + b
    float soilMoisturePercent;  // Final 0.0–100.0 %

    // Environmental (DHT22)
    float temperature;          // Ambient °C
    float humidity;             // %RH
    bool  dhtValid;             // false if DHT22 returned NaN

    // Light (BH1750)
    float lux;                  // Ambient illuminance in lx
    bool  luxValid;             // false if BH1750 returned negative

    // ESP32 Internal
    float espTemperature;       // On-die silicon junction °C
    bool  espTempValid;         // false if outside rated bounds

    // Network
    int   rssi;                 // Wi-Fi signal strength dBm
};


// ============================================================================
// SECTION 6 — UTILITY FUNCTIONS
// ============================================================================

// Pulses the onboard status LED for visual feedback
void pulseStatusLed(int durationMs = 40) {
    digitalWrite(PIN_STATUS_LED, LOW);    // ON  (active LOW)
    delay(durationMs);
    digitalWrite(PIN_STATUS_LED, HIGH);   // OFF
}

// Classifies ambient illuminance into a human-readable category
const char* classifyLux(float lux) {
    if (lux < 10.0f)     return "Dark / Night";
    if (lux < 200.0f)    return "Dim Indoor";
    if (lux < 1000.0f)   return "Bright Indoor";
    if (lux < 5000.0f)   return "Overcast / Shaded";
    return "Direct Sunlight";
}

// Converts RSSI dBm to signal quality label
const char* classifyRssi(int rssi) {
    if (rssi >= -55) return "Excellent";
    if (rssi >= -67) return "Good";
    if (rssi >= -75) return "Fair";
    if (rssi >= -85) return "Weak";
    return "Very Weak";
}


// ============================================================================
// SECTION 7 — WI-FI MODULE
// ============================================================================

// Connects to Wi-Fi with a timeout; applies brownout-safe TX power cap.
// Returns true if connected, false if timed out.
bool connectToWiFi() {
    Serial.printf("\n[WiFi] Connecting to \"%s\"", WIFI_SSID);

    WiFi.disconnect(true);
    delay(300);                         // Allow RF front-end to fully reset
    WiFi.mode(WIFI_STA);
    WiFi.setTxPower(WIFI_TX_POWER);     // ← Brownout protection: cap RF output power
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS) {
        digitalWrite(PIN_STATUS_LED, !digitalRead(PIN_STATUS_LED)); // Blink while waiting
        delay(350);
        Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
        WiFi.setTxPower(WIFI_TX_POWER); // Re-assert after stack re-negotiation
        digitalWrite(PIN_STATUS_LED, HIGH); // LED OFF = connected
        Serial.printf("\n[WiFi] ✅ Connected — IP: %s  RSSI: %d dBm (%s)\n",
                      WiFi.localIP().toString().c_str(),
                      WiFi.RSSI(),
                      classifyRssi(WiFi.RSSI()));
        return true;
    }

    digitalWrite(PIN_STATUS_LED, LOW); // LED ON = failed
    Serial.println("\n[WiFi] ❌ Connection timed out.");
    return false;
}

// Ensures Wi-Fi is connected; auto-reconnects if the link was lost.
// Returns true if connection is active after the call.
bool ensureWiFiConnected() {
    if (WiFi.status() == WL_CONNECTED) return true;
    Serial.println("[WiFi] ⚠️  Link lost — reconnecting...");
    return connectToWiFi();
}


// ============================================================================
// SECTION 8 — TIME MODULE
// ============================================================================

// Synchronises the ESP32 hardware RTC to NTP on first call.
// Uses Sri Lanka Standard Time (UTC+5:30, no DST).
void synchroniseNtp() {
    Serial.println("[NTP]  Synchronising with time servers...");
    configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET, NTP_PRIMARY, NTP_FALLBACK);

    struct tm timeinfo;
    unsigned long start = millis();
    while (!getLocalTime(&timeinfo) && millis() - start < NTP_SYNC_TIMEOUT_MS) {
        delay(500);
        Serial.print(".");
    }

    if (getLocalTime(&timeinfo)) {
        char buf[32];
        strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &timeinfo);
        Serial.printf("\n[NTP]  ✅ Synced — Current SLST: %s\n", buf);
    } else {
        Serial.println("\n[NTP]  ⚠️  Sync failed — server will timestamp readings.");
    }
}

// Builds an ISO 8601 UTC timestamp string (e.g. "2026-11-02T01:50:43Z").
// Returns an empty string if NTP has not yet resolved; backend will then
// fall back to its own server reception timestamp automatically.
String getIso8601Timestamp() {
    struct tm timeinfo;
    if (!getLocalTime(&timeinfo)) return "";

    // Convert SLST local time back to UTC for the ISO 8601 Z suffix
    time_t local = mktime(&timeinfo);
    time_t utc   = local - GMT_OFFSET_SEC;
    struct tm* utcTm = gmtime(&utc);

    char buf[32];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", utcTm);
    return String(buf);
}


// ============================================================================
// SECTION 9 — SENSOR MODULES
// ============================================================================

// ---------------------------------------------------------------------------
// 9A. FC-28 Soil Moisture
// ---------------------------------------------------------------------------

// Samples the ADC with warm-up transient discard and multi-sample averaging.
// Soil probe MUST be powered ON (PIN_SOIL_POWER_GATE HIGH) before calling.
int sampleSoilAdc() {
    // Discard initial transient readings to let the ADC input settle
    for (int i = 0; i < 4; i++) {
        (void)analogRead(PIN_SOIL_FC28_AO);
        delayMicroseconds(500);
    }
    // Accumulate oversampled readings
    long sum = 0;
    for (int i = 0; i < FC28_ADC_SAMPLES; i++) {
        sum += analogRead(PIN_SOIL_FC28_AO);
        delayMicroseconds(250);
    }
    return (int)(sum / FC28_ADC_SAMPLES);
}

// Applies linear calibration y = ax + b to the raw ADC value.
// When both a and b are 0.0 (default), raw ADC is returned unchanged.
float calibrateSoilAdc(int rawAdc) {
    if (FC28_CAL_A == 0.0f && FC28_CAL_B == 0.0f) return (float)rawAdc;
    float calibrated = (FC28_CAL_A * (float)rawAdc) + FC28_CAL_B;
    if (calibrated < 0.0f)    calibrated = 0.0f;
    if (calibrated > 4095.0f) calibrated = 4095.0f;
    return calibrated;
}

// Converts a calibrated ADC value to moisture percentage [0.0, 100.0].
float adcToMoisturePercent(float adcValue) {
    float span    = (float)(FC28_WET_RAW_ADC - FC28_DRY_RAW_ADC);
    float percent = ((adcValue - (float)FC28_DRY_RAW_ADC) / span) * 100.0f;
    if (percent < 0.0f)   percent = 0.0f;
    if (percent > 100.0f) percent = 100.0f;
    return percent;
}

// Full gated soil moisture read cycle.
// Powers probe ON → settle → sample ADC → power probe OFF → discharge.
// ⚠️  Returns immediately after probe power-off; caller must allow
//     FC28_RESET_MS before any Wi-Fi transmission to avoid current overlap.
void readSoilMoisture(SensorReading& r) {
    digitalWrite(PIN_SOIL_POWER_GATE, HIGH);   // Power ON probe
    delay(FC28_SETTLE_MS);                     // Wait for RC filter to settle

    r.soilRawAdc = sampleSoilAdc();

    digitalWrite(PIN_SOIL_POWER_GATE, LOW);    // Power OFF probe immediately
    delay(FC28_RESET_MS);                      // Allow probe to fully discharge

    r.soilCalibratedAdc    = calibrateSoilAdc(r.soilRawAdc);
    r.soilMoisturePercent  = adcToMoisturePercent(r.soilCalibratedAdc);
}

// ---------------------------------------------------------------------------
// 9B. DHT22 — Ambient Temperature & Humidity
// ---------------------------------------------------------------------------

void readDhtEnvironmental(SensorReading& r) {
    r.humidity    = dht.readHumidity();
    r.temperature = dht.readTemperature();

    bool inRange =
        !isnan(r.humidity)    && !isnan(r.temperature)    &&
        r.temperature >= DHT22_TEMP_MIN && r.temperature <= DHT22_TEMP_MAX &&
        r.humidity    >= DHT22_HUM_MIN  && r.humidity    <= DHT22_HUM_MAX;

    r.dhtValid = inRange;

    // Clamp to safe defaults on invalid read so JSON serialisation is clean
    if (!r.dhtValid) {
        r.temperature = 0.0f;
        r.humidity    = 0.0f;
    }
}

// ---------------------------------------------------------------------------
// 9C. BH1750 — Ambient Light
// ---------------------------------------------------------------------------

void readAmbientLight(SensorReading& r) {
    r.lux      = lightMeter.readLightLevel();
    r.luxValid = (r.lux >= BH1750_LUX_MIN);
    if (!r.luxValid) r.lux = 0.0f;
}

// ---------------------------------------------------------------------------
// 9D. ESP32 Internal Silicon Temperature
// ---------------------------------------------------------------------------

void readEspInternalTemp(SensorReading& r) {
    float t       = temperatureRead();
    r.espTempValid = (t >= ESP_TEMP_MIN && t <= ESP_TEMP_MAX);
    r.espTemperature = r.espTempValid ? t : 0.0f;
}

// ---------------------------------------------------------------------------
// 9E. Wi-Fi Metrics
// ---------------------------------------------------------------------------

void readWiFiMetrics(SensorReading& r) {
    r.rssi = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : 0;
}


// ============================================================================
// SECTION 10 — TELEMETRY SERIALISER & HTTP POST
// ============================================================================

// Serialises a SensorReading into the backend JSON schema and sends it.
// The soil probe is ALWAYS fully discharged before this function is called
// (enforced by the loop sequence), so there is no ADC–TX current overlap.
void postTelemetry(const SensorReading& r) {
    if (!ensureWiFiConnected()) {
        Serial.println("[HTTP] ⚠️  Skipping POST — no Wi-Fi.");
        return;
    }

    String timestamp = getIso8601Timestamp(); // "" if NTP not yet synced

    // Build JSON payload — 384 bytes is sufficient for this schema
    StaticJsonDocument<384> doc;
    doc["deviceId"]       = DEVICE_ID;
    doc["temperature"]    = serialized(String(r.temperature, 2));
    doc["humidity"]       = serialized(String(r.humidity, 2));
    doc["soilMoisture"]   = serialized(String(r.soilMoisturePercent, 1));
    doc["light"]          = serialized(String(r.lux, 1));
    doc["espTemperature"] = serialized(String(r.espTemperature, 2));
    doc["wifiSsid"]       = WiFi.SSID();

    if (timestamp.length() > 0) {
        doc["timestamp"]  = timestamp;  // Omit if NTP not synced; backend auto-timestamps
    }

    JsonObject metadata  = doc.createNestedObject("metadata");
    metadata["chip"]     = "esp32-c3-supermini";
    metadata["rssi"]     = r.rssi;
    metadata["soilRaw"]  = r.soilRawAdc;

    String payload;
    serializeJson(doc, payload);

    // Send HTTP POST
    HTTPClient http;
    http.begin(BACKEND_URL);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(HTTP_TIMEOUT_MS);

    int httpCode = http.POST(payload);

    if (httpCode > 0) {
        Serial.printf("[HTTP] ✅ POST %d — Payload sent (%d bytes)\n", httpCode, payload.length());
        if (httpCode != 201) {
            Serial.printf("[HTTP] Response: %s\n", http.getString().c_str());
        }
    } else {
        Serial.printf("[HTTP] ❌ POST failed: %s\n", http.errorToString(httpCode).c_str());
    }

    http.end();
}


// ============================================================================
// SECTION 11 — SERIAL TELEMETRY REPORT
// ============================================================================

// Prints a formatted dashboard of the current reading to the Serial Monitor.
void printTelemetryReport(const SensorReading& r, const String& timestamp) {
    Serial.println("┌─────────────────────────── TELEMETRY REPORT ───────────────────────────┐");

    // Timestamp
    Serial.printf("│ 🕐 Timestamp (SLST)        : %-44s│\n",
                  timestamp.length() > 0 ? timestamp.c_str() : "(awaiting NTP sync)");

    // Soil Moisture
    Serial.printf("│ 🌾 Soil Moisture (FC-28)   : %5.1f %%  (Raw: %4d | Cal: %6.1f / 4095)  │\n",
                  r.soilMoisturePercent, r.soilRawAdc, r.soilCalibratedAdc);

    // Environmental
    if (r.dhtValid) {
        Serial.printf("│ 🌡️  Temperature (DHT22)    : %5.2f °C                                     │\n",
                      r.temperature);
        Serial.printf("│ 💧 Humidity (DHT22)        : %5.2f %%                                      │\n",
                      r.humidity);
    } else {
        Serial.println("│ ⚠️  DHT22 Environmental     : Read Error / Out of Range (check GPIO 3)    │");
    }

    // Light
    if (r.luxValid) {
        Serial.printf("│ ☀️  Light (BH1750)          : %7.1f lx  [%-18s]           │\n",
                      r.lux, classifyLux(r.lux));
    } else {
        Serial.println("│ ⚠️  BH1750 Light             : Read Error (check GPIO 5/6 I2C)            │");
    }

    // ESP Core Temperature
    if (r.espTempValid) {
        Serial.printf("│ 🔥 ESP32 Core Temp         : %5.2f °C                                     │\n",
                      r.espTemperature);
    } else {
        Serial.println("│ ⚠️  ESP32 Core Temp         : Read Error / Out of Range                   │");
    }

    // Wi-Fi
    Serial.printf("│ 📶 Wi-Fi RSSI              : %d dBm  (%s)                           │\n",
                  r.rssi, classifyRssi(r.rssi));

    Serial.println("└────────────────────────────────────────────────────────────────────────┘\n");
}


// ============================================================================
// SECTION 12 — SYSTEM INITIALISATION (setup)
// ============================================================================

void setup() {
    Serial.begin(115200);
    delay(1500); // Allow USB-CDC to enumerate on host

    // --- GPIO Initialisation ---
    pinMode(PIN_STATUS_LED,       OUTPUT);
    digitalWrite(PIN_STATUS_LED,  HIGH);   // OFF initially (active LOW)

    pinMode(PIN_SOIL_POWER_GATE,  OUTPUT);
    digitalWrite(PIN_SOIL_POWER_GATE, LOW); // Probe de-energised at boot

    // --- ADC Configuration ---
    analogReadResolution(12);              // 12-bit: 0–4095
    analogSetAttenuation(ADC_11db);        // ~0–3.1 V input range

    // --- DHT22 Initialisation ---
    dht.begin();

    // --- BH1750 Initialisation (Hardware I2C) ---
    Wire.begin(PIN_BH1750_SDA, PIN_BH1750_SCL);
    bool bh1750Ok = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);

    // --- Boot Banner ---
    Serial.println("\n======================================================================");
    Serial.println("     🌿 GREEN NODE PRODUCTION FIRMWARE — FC-28 EDITION               ");
    Serial.println("======================================================================");
    Serial.println("HARDWARE CONFIGURATION:");
    Serial.println("  • FC-28 Soil Moisture (AO)   : GPIO 1 (ADC1_CH1 — safe with Wi-Fi)");
    Serial.println("  • Soil Probe VCC Power Gate  : GPIO 2 (Electrolysis / Brownout Guard)");
    Serial.println("  • DHT22 Temp & Humidity      : GPIO 3 (Single-Wire Digital)");
    Serial.println("  • BH1750 Ambient Light (SDA) : GPIO 5 (I2C SDA)");
    Serial.println("  • BH1750 Ambient Light (SCL) : GPIO 6 (I2C SCL)");
    Serial.println("  • Onboard Status LED         : GPIO 8 (Active LOW)");
    Serial.println("----------------------------------------------------------------------");
    Serial.printf("BH1750 Status              : %s\n",
                  bh1750Ok ? "✅ Online (0x23)" : "❌ Offline — check I2C wiring");
    Serial.printf("Wi-Fi TX Power Cap         : 11 dBm (brownout protection active)\n");
    Serial.printf("Telemetry Interval         : %lu ms\n", TELEMETRY_INTERVAL_MS);
    Serial.printf("Backend Endpoint           : %s\n", BACKEND_URL);
    Serial.printf("Device ID                  : %s\n", DEVICE_ID);
    Serial.printf("FC-28 Calibration          : a = %.4f, b = %.4f  %s\n",
                  FC28_CAL_A, FC28_CAL_B,
                  (FC28_CAL_A == 0.0f && FC28_CAL_B == 0.0f) ? "(uncalibrated — raw pass-through)" : "(linear active)");
    Serial.println("======================================================================\n");

    // --- Wi-Fi Connection (required before NTP sync) ---
    connectToWiFi();

    // --- NTP Time Synchronisation ---
    // Only attempt NTP if Wi-Fi is connected; otherwise time syncs on first reconnect.
    if (WiFi.status() == WL_CONNECTED) {
        synchroniseNtp();
    }

    delay(200);
}


// ============================================================================
// SECTION 13 — MAIN EXECUTION LOOP
// ============================================================================
//
// Execution sequence per cycle:
//   ① Read all sensors (soil probe gated — probe OFF before step ②)
//   ② Read ESP core temperature & Wi-Fi RSSI
//   ③ Print formatted telemetry report to Serial Monitor
//   ④ Flash status LED
//   ⑤ POST JSON payload to backend (Wi-Fi TX only after probe is OFF)
//   ⑥ Non-blocking interval delay
//
// ============================================================================

void loop() {
    SensorReading reading = {};

    // -------------------------------------------------------------------------
    // ① Sensor Acquisition Phase
    //    Order: Soil (gated) → DHT22 → BH1750
    //    After readSoilMoisture() returns, the probe is already de-energised
    //    and FC28_RESET_MS has elapsed — safe to proceed with network ops.
    // -------------------------------------------------------------------------
    readSoilMoisture(reading);       // Energise → sample → de-energise → discharge
    readDhtEnvironmental(reading);   // Blocking ~250 ms for DHT22 single-wire read
    readAmbientLight(reading);       // I2C read from BH1750

    // ② Peripheral Metrics
    readEspInternalTemp(reading);
    readWiFiMetrics(reading);

    // ③ Serial Dashboard
    String timestamp = getIso8601Timestamp();
    printTelemetryReport(reading, timestamp);

    // ④ Status LED Pulse
    pulseStatusLed(50);

    // ⑤ HTTP POST — soil probe is fully off before this call
    postTelemetry(reading);

    // ⑥ Wait for next telemetry interval
    delay(TELEMETRY_INTERVAL_MS);
}
