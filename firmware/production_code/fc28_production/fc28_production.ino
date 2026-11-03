// ============================================================================
// 🌿 GREEN NODE - 24/7 PRODUCTION FIRMWARE (FC-28 SOIL SENSOR EDITION)
// Microcontroller : ESP32-C3 SuperMini (RISC-V)
// Sensors         : FC-28 Soil Moisture, DHT22 (Temp & Hum), BH1750 (Lux)
// Connectivity    : 2.4GHz Wi-Fi + Zero-RAM On-Demand Captive Portal
// Time Source     : Sri Lanka Standard Time (UTC+5:30) via NTP
// Backend Target  : HTTP/HTTPS POST /api/devices/:deviceId/readings
// ============================================================================

#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include "DHT.h"
#include <BH1750.h>
#include <time.h>
#include <math.h>
#include <esp_task_wdt.h>

// ============================================================================
// 1. USER CONFIGURATION & COMPILE-TIME FALLBACK DEFAULTS
// ============================================================================
// 💡 NOTE: Credentials load automatically from NVS flash memory at boot.
// If the board has never been provisioned, it starts "GreenNode-Setup" immediately.
// Hold the onboard BOOT button (GPIO 9) for 3 seconds at any time to re-launch
// the "GreenNode-Setup" Wi-Fi Captive Portal.

// --- Fallback Defaults (Used only when NVS profile has not been saved) ---
const char* DEFAULT_WIFI_SSID                       = "";
const char* DEFAULT_WIFI_PASSWORD                   = "";
const char* DEFAULT_BACKEND_BASE                    = "https://blue-circle.onrender.com";
const char* DEFAULT_DEVICE_ID                       = "";

// --- Active Runtime Configuration (Populated from NVS Preferences at boot) ---
char configWifiSsid[64]                             = "";
char configWifiPassword[64]                         = "";
char configBackendBase[128]                         = "https://blue-circle.onrender.com";
char configDeviceId[64]                             = "";
bool hasCustomNvsConfig                             = false;

// --- Hardware Pin Assignments (ESP32-C3 SuperMini - DO NOT MODIFY) ---
const int PIN_SOIL_FC28_AO                          = 1;       // GPIO1 (ADC1_CH1) -> Analog Output
const int PIN_SOIL_POWER_GATE                       = 2;       // GPIO2 -> Dedicated VCC Power-Gate
const int PIN_DHT_DATA                              = 3;       // GPIO3 -> Single-Wire Digital Data
const int PIN_BH1750_SDA                            = 5;       // GPIO5 -> Hardware I2C SDA
const int PIN_BH1750_SCL                            = 6;       // GPIO6 -> Hardware I2C SCL
const int PIN_STATUS_LED                            = 8;       // GPIO8 -> Onboard Blue LED (Active LOW)
const int PIN_BOOT_BUTTON                           = 9;       // GPIO9 -> Onboard BOOT Button (Active LOW)

// --- Telemetry & 24/7 Watchdog Timing Intervals ---
const unsigned long REFRESH_INTERVAL_MS             = 10000;   // Interval between telemetry transmissions (10 sec)
const unsigned long WIFI_TIMEOUT_MS                 = 15000;   // Max time to wait for Wi-Fi association (15 sec)
const unsigned long HTTP_TIMEOUT_MS                 = 12000;   // HTTP/HTTPS request timeout (12 sec)
const unsigned long PORTAL_TIMEOUT_MS               = 300000;  // 5-min auto-exit timeout for Captive Portal (24/7 safety)
const uint32_t      WDT_TIMEOUT_SEC                 = 45;      // Hardware Watchdog reset timer (45 sec)
const uint32_t      MIN_SAFE_FREE_HEAP              = 40960;   // 40 KB minimum heap guard for 24/7 TLS stability

// --- Time Service (Sri Lanka Standard Time: UTC+5:30, No DST) ---
const char* NTP_SERVER_PRIMARY                      = "pool.ntp.org";
const char* NTP_SERVER_FALLBACK                     = "time.google.com";
const long  GMT_OFFSET_SEC                          = 19800;   // UTC+5:30 (5.5 hours * 3600 = 19800 seconds)
const int   DAYLIGHT_OFFSET_SEC                     = 0;       // Sri Lanka has no Daylight Saving Time
const time_t MIN_VALID_EPOCH                        = 1700000000; // Sanity threshold (~Nov 2023) to verify NTP sync

// --- FC-28 Soil Moisture Sensor Hardware & Timing ---
const unsigned long FC28_SETTLE_MS                  = 20;      // 20ms probe settling after power-on
const unsigned long FC28_RESET_MS                   = 40;      // 40ms probe discharge after power-off
const int FC28_DRY_ADC                              = 400;     // Raw ADC at 0% moisture
const int FC28_WET_ADC                              = 4095;    // Raw ADC at 100% moisture
const int ADC_SAMPLE_COUNT                          = 16;      // Oversampling filter count

// --- Linear Calibration Constants (y = ax + b) ---
const float FC28_CAL_A                              = 0.0f;    // Slope 'a'
const float FC28_CAL_B                              = 0.0f;    // Offset 'b'

// --- Captive Portal Settings ---
const char* AP_SSID                                 = "GreenNode-Setup";
const byte  DNS_PORT                                = 53;
const char* NVS_NAMESPACE                           = "greennode";

// ============================================================================
// 2. HARDWARE INSTANCES & DATA STRUCTURES
// ============================================================================

#define DHTTYPE DHT22
DHT dht(PIN_DHT_DATA, DHTTYPE);
BH1750 lightMeter;

bool bh1750Initialized = false;
unsigned long lastTelemetryMillis = 0;
int failedWifiAttempts = 0;

struct SensorTelemetry {
    int   soilRaw;
    float soilCalibrated;
    float soilMoisture;
    float temperature;
    float humidity;
    bool  dhtValid;
    float lightLux;
    bool  lightValid;
    float espTemperature;
    int   rssi;
    char  wifiSsid[33];
    char  timestamp[25];
};

void startCaptivePortal();

// ============================================================================
// 3. NVS PREFERENCES & CONFIGURATION MANAGEMENT
// ============================================================================

void loadConfiguration() {
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, true); // Read-only

    hasCustomNvsConfig = prefs.isKey("ssid") && prefs.isKey("dev_id");
    String sSsid       = prefs.getString("ssid", DEFAULT_WIFI_SSID);
    String sPass       = prefs.getString("pass", DEFAULT_WIFI_PASSWORD);
    String sBackend    = prefs.getString("backend", DEFAULT_BACKEND_BASE);
    String sDevId      = prefs.getString("dev_id", DEFAULT_DEVICE_ID);
    prefs.end();

    strncpy(configWifiSsid,     sSsid.c_str(),    sizeof(configWifiSsid) - 1);
    strncpy(configWifiPassword, sPass.c_str(),    sizeof(configWifiPassword) - 1);
    strncpy(configBackendBase,  sBackend.c_str(), sizeof(configBackendBase) - 1);
    strncpy(configDeviceId,     sDevId.c_str(),   sizeof(configDeviceId) - 1);

    configWifiSsid[sizeof(configWifiSsid) - 1]         = '\0';
    configWifiPassword[sizeof(configWifiPassword) - 1] = '\0';
    configBackendBase[sizeof(configBackendBase) - 1]   = '\0';
    configDeviceId[sizeof(configDeviceId) - 1]         = '\0';

    Serial.printf("[NVS] Configuration status: %s\n", hasCustomNvsConfig ? "SAVED PROFILE PRESENT" : "NOT PROVISIONED");
    if (hasCustomNvsConfig) {
        Serial.printf("      Wi-Fi SSID  : %s\n", configWifiSsid);
        Serial.printf("      Device UUID : %s\n", configDeviceId);
        Serial.printf("      Backend Host: %s\n", configBackendBase);
    }
}

void saveConfiguration(const char* ssid, const char* pass, const char* backend, const char* devId) {
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, false); // Read-write
    prefs.putString("ssid", ssid);
    prefs.putString("pass", pass);
    prefs.putString("backend", backend);
    prefs.putString("dev_id", devId);
    prefs.end();
    Serial.println("[NVS] ✅ New configuration saved to flash memory.");
}

// ============================================================================
// 4. ON-DEMAND CAPTIVE PORTAL (Zero RAM Footprint During Normal 24/7 Run)
// ============================================================================

static const char PORTAL_HTML_HEAD[] PROGMEM = R"html(<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Green Node Provisioning</title>
<style>
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
body { background: #0f172a; color: #f8fafc; margin: 0; padding: 20px 12px; display: flex; justify-content: center; }
.card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 24px; max-width: 440px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
.header { text-align: center; margin-bottom: 20px; }
.logo { font-size: 34px; margin-bottom: 6px; }
h1 { margin: 0; font-size: 22px; color: #10b981; font-weight: 700; }
p.sub { margin: 6px 0 0; font-size: 13px; color: #94a3b8; }
.badge { display: inline-block; background: #064e3b; color: #34d399; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 9999px; margin-top: 8px; }
.form-group { margin-bottom: 16px; }
label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #e2e8f0; }
select, input[type="text"], input[type="password"] {
  width: 100%; padding: 11px 12px; border-radius: 8px; border: 1px solid #475569;
  background: #0f172a; color: #fff; font-size: 14px; outline: none; transition: border 0.2s;
}
select:focus, input:focus { border-color: #10b981; }
.hint { font-size: 11px; color: #94a3b8; margin-top: 4px; line-height: 1.4; }
.hint code { background: #0f172a; padding: 2px 4px; border-radius: 4px; color: #38bdf8; }
.btn {
  display: block; width: 100%; padding: 12px; border: none; border-radius: 8px;
  background: #10b981; color: #022c22; font-size: 15px; font-weight: 700;
  cursor: pointer; transition: background 0.2s; margin-top: 20px;
}
.btn:hover { background: #059669; }
.pw-wrap { position: relative; }
.pw-toggle {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  background: transparent; border: none; color: #94a3b8; font-size: 12px; cursor: pointer; padding: 4px;
}
.footer { text-align: center; margin-top: 20px; font-size: 11px; color: #64748b; line-height: 1.5; }
</style>
<script>
function onSelectNet(val) { if (val) document.getElementById('ssid').value = val; }
function togglePw() {
  var p = document.getElementById('pass'), b = document.getElementById('pwBtn');
  if (p.type === 'password') { p.type = 'text'; b.textContent = 'Hide'; }
  else { p.type = 'password'; b.textContent = 'Show'; }
}
</script>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="logo">🌿</div>
    <h1>Green Node Setup</h1>
    <p class="sub">Sensor Module Wi-Fi &amp; UUID Provisioning</p>
    <div class="badge">FC-28 EDITION</div>
  </div>
  <form method="POST" action="/save">
    <div class="form-group">
      <label for="scannedNet">Detected Wi-Fi Networks</label>
      <select id="scannedNet" onchange="onSelectNet(this.value)">
        <option value="">-- Select a nearby Wi-Fi network --</option>
)html";

void startCaptivePortal() {
    Serial.println("\n======================================================================");
    Serial.println("     🌿 GREEN NODE — ONBOARD PROVISIONING PORTAL ACTIVATED            ");
    Serial.println("======================================================================");
    Serial.println("1. Connect your phone / laptop to Wi-Fi: \"GreenNode-Setup\" (Open AP)");
    Serial.println("2. Setup page opens automatically (or browse to http://192.168.4.1)");
    Serial.println("3. Portal auto-exits after 5 minutes of inactivity for 24/7 safety.");
    Serial.println("======================================================================\n");

    // 1. Scan available Wi-Fi networks in STA mode FIRST so user can pick from dropdown
    WiFi.disconnect(true);
    delay(100);
    WiFi.mode(WIFI_STA);
    delay(100);
    Serial.println("[PORTAL] Scanning nearby Wi-Fi networks...");
    int n = WiFi.scanNetworks(false, false);
    Serial.printf("[PORTAL] Scan complete. Found %d networks.\n", n);

    String cachedNetworkOptions = "";
    for (int i = 0; i < n; i++) {
        String ssidName = WiFi.SSID(i);
        if (ssidName.length() > 0) {
            cachedNetworkOptions += "<option value=\"" + ssidName + "\">" + ssidName + " (" + String(WiFi.RSSI(i)) + " dBm)</option>\n";
        }
    }
    WiFi.scanDelete(); // Free scan buffer from RAM immediately

    // 2. Switch cleanly to dedicated SoftAP mode (Channel 1, broadcast active)
    WiFi.disconnect(true);
    delay(100);
    WiFi.mode(WIFI_AP);
    delay(100);

    IPAddress apIP(192, 168, 4, 1);
    IPAddress netMsk(255, 255, 255, 0);
    WiFi.softAPConfig(apIP, apIP, netMsk);

    // Channel 1, open network, max 4 clients
    bool apStarted = WiFi.softAP(AP_SSID, NULL, 1, 0, 4);
    WiFi.setTxPower(WIFI_POWER_15dBm); // Solid RF power so phone easily discovers SSID

    if (apStarted) {
        Serial.printf("[PORTAL] ✅ SoftAP \"%s\" ACTIVE!\n", AP_SSID);
        Serial.printf("         IP: %s | Channel: 1 | MAC: %s\n",
                      WiFi.softAPIP().toString().c_str(), WiFi.softAPmacAddress().c_str());
    } else {
        Serial.println("[PORTAL] ❌ Initial SoftAP start failed, retrying...");
        delay(300);
        WiFi.softAP(AP_SSID);
    }

    // 3. Start Captive DNS Server (wildcard redirect to 192.168.4.1)
    DNSServer dnsServer;
    dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
    dnsServer.start(DNS_PORT, "*", apIP);

    // 4. Start WebServer on port 80
    WebServer portalServer(80);
    unsigned long portalActivityTimer = millis();

    auto sendPortalPage = [&]() {
        portalActivityTimer = millis();
        String html = FPSTR(PORTAL_HTML_HEAD);
        html += cachedNetworkOptions;
        html += R"html(
      </select>
    </div>
    <div class="form-group">
      <label for="ssid">Wi-Fi Network Name (SSID) *</label>
      <input type="text" id="ssid" name="ssid" value=")html" + String(configWifiSsid) + R"html(" required placeholder="e.g. Greenhouse_WiFi">
    </div>
    <div class="form-group">
      <label for="pass">Wi-Fi Password</label>
      <div class="pw-wrap">
        <input type="password" id="pass" name="password" value=")html" + String(configWifiPassword) + R"html(" placeholder="Network Password">
        <button type="button" id="pwBtn" class="pw-toggle" onclick="togglePw()">Show</button>
      </div>
    </div>
    <div class="form-group">
      <label for="device_id">Sensor Module Device UUID *</label>
      <input type="text" id="device_id" name="device_id" value=")html" + String(configDeviceId) + R"html(" required placeholder="e.g. a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11">
      <div class="hint">⚠️ Registered from Green Node Web Dashboard under your Greenhouse. Unregistered UUIDs receive <code>403 Forbidden</code>.</div>
    </div>
    <div class="form-group">
      <label for="backend">Backend Server URL *</label>
      <input type="text" id="backend" name="backend" value=")html" + String(configBackendBase) + R"html(" required placeholder="https://blue-circle.onrender.com">
      <div class="hint">Production: <code>https://blue-circle.onrender.com</code> &bull; Local test: <code>http://192.168.x.x:4000</code></div>
    </div>
    <button type="submit" class="btn">💾 Save &amp; Connect</button>
  </form>
  <div class="footer">
    ESP32-C3 SuperMini Node &bull; Sri Lanka Time (UTC+5:30)<br>
    To reconfigure later: hold the onboard BOOT button (GPIO 9) for 3 seconds.
  </div>
</div>
</body>
</html>)html";
        portalServer.send(200, "text/html", html);
    };

    portalServer.on("/", HTTP_GET, sendPortalPage);
    portalServer.on("/generate_204", HTTP_GET, sendPortalPage);
    portalServer.on("/hotspot-detect.html", HTTP_GET, sendPortalPage);
    portalServer.on("/canonical.html", HTTP_GET, sendPortalPage);
    portalServer.on("/connecttest.txt", HTTP_GET, sendPortalPage);
    portalServer.on("/ncsi.txt", HTTP_GET, sendPortalPage);

    portalServer.on("/save", HTTP_POST, [&]() {
        portalActivityTimer = millis();
        String newSsid    = portalServer.arg("ssid");
        String newPass    = portalServer.arg("password");
        String newDevId   = portalServer.arg("device_id");
        String newBackend = portalServer.arg("backend");

        newSsid.trim();
        newPass.trim();
        newDevId.trim();
        newBackend.trim();

        if (newSsid.length() == 0 || newDevId.length() == 0) {
            portalServer.send(400, "text/html", "<h3>Error: Wi-Fi SSID and Device UUID are mandatory.</h3><p><a href='/'>Go back</a></p>");
            return;
        }

        if (newBackend.length() == 0) {
            newBackend = "https://blue-circle.onrender.com";
        }
        while (newBackend.endsWith("/")) {
            newBackend.remove(newBackend.length() - 1);
        }

        saveConfiguration(newSsid.c_str(), newPass.c_str(), newBackend.c_str(), newDevId.c_str());

        String responseHtml = R"html(<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Settings Saved</title>
<style>
body { font-family: -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
.card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px; max-width: 420px; width: 100%; text-align: center; }
.badge { background: #064e3b; color: #34d399; padding: 6px 14px; border-radius: 9999px; font-weight: 600; font-size: 13px; display: inline-block; margin-bottom: 16px; }
h2 { margin: 0 0 12px; color: #fff; font-size: 22px; }
p { color: #94a3b8; font-size: 14px; line-height: 1.5; margin: 8px 0; }
.mono { font-family: monospace; background: #0f172a; padding: 4px 8px; border-radius: 6px; color: #38bdf8; word-break: break-all; }
.spinner { width: 36px; height: 36px; border: 3px solid #334155; border-top-color: #10b981; border-radius: 50%; animation: spin 1s linear infinite; margin: 24px auto 8px; }
@keyframes spin { to { transform: rotate(360deg); } }
</style></head><body>
<div class="card">
  <div class="badge">✅ SAVED TO FLASH</div>
  <h2>Rebooting Node</h2>
  <p>Connecting to Wi-Fi:<br><strong style="color:#fff;">)html" + newSsid + R"html(</strong></p>
  <p>Sensor Module UUID:<br><span class="mono">)html" + newDevId + R"html(</span></p>
  <div class="spinner"></div>
  <p style="font-size:12px; color:#64748b; margin-top:16px;">Rebooting in 2 seconds to start streaming telemetry...</p>
</div></body></html>)html";

        portalServer.send(200, "text/html", responseHtml);

        // Flush HTTP response cleanly before rebooting
        unsigned long flushStart = millis();
        while (millis() - flushStart < 1500) {
            portalServer.handleClient();
            delay(10);
        }
        ESP.restart();
    });

    portalServer.onNotFound([&]() {
        portalServer.sendHeader("Location", "http://192.168.4.1/", true);
        portalServer.send(302, "text/plain", "");
    });

    portalServer.begin();

    unsigned long lastBlink = 0;
    bool ledState = false;

    // Run portal until user saves OR 5-minute safety timeout elapses
    while (millis() - portalActivityTimer < PORTAL_TIMEOUT_MS) {
        dnsServer.processNextRequest();
        portalServer.handleClient();

        // Fast 200ms blink indicates Setup Mode
        if (millis() - lastBlink > 200) {
            lastBlink = millis();
            ledState = !ledState;
            digitalWrite(PIN_STATUS_LED, ledState ? LOW : HIGH);
        }
        delay(5);
    }

    Serial.println("[PORTAL] ⏱️ 5-minute inactivity timeout reached. Rebooting...");
    delay(200);
    ESP.restart();
}

// ============================================================================
// 5. UTILITY & HARDWARE HELPER FUNCTIONS
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

double roundToDp(float value, int decimals) {
    double factor = pow(10.0, decimals);
    return round((double)value * factor) / factor;
}

// Checks if BOOT button (GPIO 9) is held for 3 seconds
void checkBootButtonHold() {
    if (digitalRead(PIN_BOOT_BUTTON) == LOW) {
        unsigned long pressStart = millis();
        while (digitalRead(PIN_BOOT_BUTTON) == LOW) {
            digitalWrite(PIN_STATUS_LED, LOW);  delay(50);
            digitalWrite(PIN_STATUS_LED, HIGH); delay(50);
            if (millis() - pressStart >= 3000) {
                Serial.println("\n[SETUP] 🔘 BOOT button held for 3s! Launching Captive Portal...");
                startCaptivePortal();
                return;
            }
        }
    }
}

// ============================================================================
// 6. SENSOR ACQUISITION MODULES
// ============================================================================

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

float calibrateSoilAdc(int rawAdc) {
    if (FC28_CAL_A == 0.0f && FC28_CAL_B == 0.0f) {
        return (float)rawAdc;
    }
    float calibrated = (FC28_CAL_A * (float)rawAdc) + FC28_CAL_B;
    return constrain(calibrated, 0.0f, 4095.0f);
}

float calculateMoisturePercent(float adcValue) {
    float span = (float)(FC28_WET_ADC - FC28_DRY_ADC);
    if (fabs(span) < 1e-5f) return 0.0f;
    float percent = ((adcValue - (float)FC28_DRY_ADC) / span) * 100.0f;
    return constrain(percent, 0.0f, 100.0f);
}

void sampleSoilSensor(SensorTelemetry& data) {
    // 1. Energize probe
    digitalWrite(PIN_SOIL_POWER_GATE, HIGH);
    delay(FC28_SETTLE_MS);

    // 2. Read ADC
    data.soilRaw = readSoilAdcAveraged(PIN_SOIL_FC28_AO);

    // 3. De-energize immediately to prevent electrolysis and save power
    digitalWrite(PIN_SOIL_POWER_GATE, LOW);
    delay(FC28_RESET_MS);

    // 4. Calculate calibrated ADC and percentage
    data.soilCalibrated = calibrateSoilAdc(data.soilRaw);
    data.soilMoisture   = calculateMoisturePercent(data.soilCalibrated);
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
    if (!bh1750Initialized) {
        bh1750Initialized = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);
    }

    if (bh1750Initialized) {
        data.lightLux   = lightMeter.readLightLevel();
        data.lightValid = (data.lightLux >= 0.0f);
    } else {
        data.lightValid = false;
    }

    if (!data.lightValid) {
        data.lightLux = 0.0f;
    }
}

void sampleInternalMetrics(SensorTelemetry& data) {
    data.espTemperature = temperatureRead();
    if (WiFi.status() == WL_CONNECTED) {
        data.rssi = WiFi.RSSI();
        strncpy(data.wifiSsid, WiFi.SSID().c_str(), sizeof(data.wifiSsid) - 1);
        data.wifiSsid[sizeof(data.wifiSsid) - 1] = '\0';
    } else {
        data.rssi = 0;
        data.wifiSsid[0] = '\0';
    }
}

// ============================================================================
// 7. WI-FI & TIME SERVICES
// ============================================================================

bool connectToWiFi() {
    if (strlen(configWifiSsid) == 0) {
        Serial.println("[WiFi] ⚠️ No Wi-Fi SSID configured. Launching Captive Portal...");
        startCaptivePortal();
        return false;
    }

    Serial.printf("\n[WiFi] Connecting to \"%s\" (Device UUID: %s)...\n", configWifiSsid, configDeviceId);

    WiFi.disconnect(true);
    delay(200);
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.persistent(false);
    WiFi.begin(configWifiSsid, configWifiPassword);

    // Cap RF TX power AFTER WiFi.begin to prevent brownout spikes on ESP32-C3 SuperMini
    WiFi.setTxPower(WIFI_POWER_11dBm);

    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - start < WIFI_TIMEOUT_MS)) {
        digitalWrite(PIN_STATUS_LED, !digitalRead(PIN_STATUS_LED));
        delay(300);
        Serial.print(".");
        checkBootButtonHold();
    }

    if (WiFi.status() == WL_CONNECTED) {
        digitalWrite(PIN_STATUS_LED, HIGH); // OFF when connected
        Serial.printf("\n[WiFi] ✅ Connected! IP: %s | RSSI: %d dBm\n",
                      WiFi.localIP().toString().c_str(), WiFi.RSSI());
        failedWifiAttempts = 0;
        return true;
    } else {
        digitalWrite(PIN_STATUS_LED, LOW);  // ON if failed
        failedWifiAttempts++;
        Serial.printf("\n[WiFi] ❌ Connection timed out (Attempt %d).\n", failedWifiAttempts);

        if (!hasCustomNvsConfig && failedWifiAttempts >= 2) {
            Serial.println("[WiFi] ⚠️ Unconfigured node failed to connect. Opening Provisioning Portal...");
            startCaptivePortal();
        } else if (failedWifiAttempts >= 20) {
            Serial.println("[WiFi] 🔄 Router unreachable for 5 minutes. Rebooting RF stack cleanly...");
            delay(200);
            ESP.restart();
        }
        return false;
    }
}

void initTimeService() {
    Serial.println("[NTP]  Initialising time sync for Sri Lanka (UTC+5:30)...");
    configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER_PRIMARY, NTP_SERVER_FALLBACK);
}

void populateIso8601Timestamp(char* outBuffer, size_t bufferSize) {
    time_t now;
    time(&now);
    if (now < MIN_VALID_EPOCH) {
        outBuffer[0] = '\0';
        return;
    }
    struct tm utcTm;
    gmtime_r(&now, &utcTm);
    strftime(outBuffer, bufferSize, "%Y-%m-%dT%H:%M:%SZ", &utcTm);
}

// ============================================================================
// 8. HTTP TELEMETRY DISPATCH (TARGET: /api/devices/:deviceId/readings)
// ============================================================================

void sendTelemetryHttp(const SensorTelemetry& data) {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[HTTP] ⚠️ WiFi disconnected. Skipping POST.");
        return;
    }

    if (ESP.getFreeHeap() < MIN_SAFE_FREE_HEAP) {
        Serial.printf("[SYS] ⚠️ Low heap detected (%u bytes). Performing preventive reboot...\n", ESP.getFreeHeap());
        delay(100);
        ESP.restart();
    }

    char targetUrl[220];
    snprintf(targetUrl, sizeof(targetUrl), "%s/api/devices/%s/readings", configBackendBase, configDeviceId);

#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument doc;
#else
    StaticJsonDocument<512> doc;
#endif

    doc["temperature"]    = roundToDp(data.temperature, 2);
    doc["humidity"]       = roundToDp(data.humidity, 2);
    doc["soilMoisture"]   = roundToDp(data.soilMoisture, 1);
    doc["light"]          = roundToDp(data.lightLux, 1);
    doc["espTemperature"] = roundToDp(data.espTemperature, 2);
    doc["wifiSsid"]       = data.wifiSsid;

    if (data.timestamp[0] != '\0') {
        doc["timestamp"]  = data.timestamp;
    }

#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonObject metadata   = doc["metadata"].to<JsonObject>();
#else
    JsonObject metadata   = doc.createNestedObject("metadata");
#endif
    metadata["chip"]      = "esp32-c3-supermini";
    metadata["rssi"]      = data.rssi;
    metadata["soilRaw"]   = data.soilRaw;

    char jsonPayload[384];
    size_t payloadLen = serializeJson(doc, jsonPayload, sizeof(jsonPayload));

    bool isHttps = (strncmp(configBackendBase, "https://", 8) == 0);
    HTTPClient http;
    http.setReuse(false);
    http.setTimeout(HTTP_TIMEOUT_MS);

    static WiFiClientSecure secureClient;
    static WiFiClient plainClient;

    int httpCode = 0;
    if (isHttps) {
        secureClient.setInsecure();
        secureClient.setTimeout(HTTP_TIMEOUT_MS / 1000);
        if (!http.begin(secureClient, targetUrl)) {
            Serial.println("[HTTP] ❌ Unable to initialize HTTPS client.");
            return;
        }
        http.addHeader("Content-Type", "application/json");
        httpCode = http.POST((uint8_t*)jsonPayload, payloadLen);
    } else {
        plainClient.setTimeout(HTTP_TIMEOUT_MS / 1000);
        if (!http.begin(plainClient, targetUrl)) {
            Serial.println("[HTTP] ❌ Unable to initialize HTTP client.");
            return;
        }
        http.addHeader("Content-Type", "application/json");
        httpCode = http.POST((uint8_t*)jsonPayload, payloadLen);
    }

    if (httpCode == 201 || httpCode == 200) {
        Serial.printf("[HTTP] ✅ INGESTED (HTTP %d) | Payload: %u bytes | Free Heap: %u B\n",
                      httpCode, (unsigned int)payloadLen, ESP.getFreeHeap());
        pulseStatusLed(40);
    } else if (httpCode == 403) {
        String resp = http.getString();
        Serial.println("\n[HTTP] 🛑 403 FORBIDDEN - REJECTED BY BACKEND GATEKEEPER!");
        Serial.printf("       DEVICE_ID \"%s\" is not registered in Web Dashboard.\n", configDeviceId);
        Serial.printf("       Server response: %s\n\n", resp.c_str());
        for (int i = 0; i < 3; i++) {
            digitalWrite(PIN_STATUS_LED, LOW);  delay(70);
            digitalWrite(PIN_STATUS_LED, HIGH); delay(70);
        }
    } else if (httpCode > 0) {
        Serial.printf("[HTTP] ⚠️ POST returned HTTP %d\n", httpCode);
    } else {
        Serial.printf("[HTTP] ❌ POST Failed (%d): %s\n", httpCode, http.errorToString(httpCode).c_str());
    }
    http.end();
}

// ============================================================================
// 9. SYSTEM INITIALIZATION (setup)
// ============================================================================

void setup() {
    Serial.begin(115200);
    delay(1500);

    unsigned long startSerialWait = millis();
    while (!Serial && (millis() - startSerialWait < 3000)) {
        delay(10);
    }

    // Initialize Onboard Status LED & BOOT Button
    pinMode(PIN_STATUS_LED, OUTPUT);
    digitalWrite(PIN_STATUS_LED, HIGH); // OFF initially
    pinMode(PIN_BOOT_BUTTON, INPUT_PULLUP);

    // Initialize Soil Power-Gate (De-energized at boot)
    digitalWrite(PIN_SOIL_POWER_GATE, LOW);
    pinMode(PIN_SOIL_POWER_GATE, OUTPUT);

    // Configure 12-bit ADC (0 - 4095) with 11dB attenuation
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    analogSetPinAttenuation(PIN_SOIL_FC28_AO, ADC_11db);

    // Initialize DHT22
    dht.begin();

    // Initialize BH1750 I2C
    Wire.begin(PIN_BH1750_SDA, PIN_BH1750_SCL);
    bh1750Initialized = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);

    Serial.println("\n======================================================================");
    Serial.println("     🌿 GREEN NODE PRODUCTION FIRMWARE - FC-28 SOIL EDITION            ");
    Serial.println("======================================================================");
    Serial.println("HARDWARE PIN ASSIGNMENTS:");
    Serial.println("  • FC-28 Soil Moisture (AO)   : GPIO 1 (ADC1_CH1 - Safe with WiFi)");
    Serial.println("  • Soil VCC Power Gate        : GPIO 2 (Electrolysis & Brownout Guard)");
    Serial.println("  • DHT22 Temp & Humidity      : GPIO 3 (Digital Single-Wire)");
    Serial.println("  • BH1750 Ambient Light (SDA) : GPIO 5 (I2C SDA)");
    Serial.println("  • BH1750 Ambient Light (SCL) : GPIO 6 (I2C SCL)");
    Serial.println("  • Onboard Status Indicator   : GPIO 8 (Active LOW)");
    Serial.println("  • Onboard BOOT Button        : GPIO 9 (Hold 3s to trigger Setup Portal)");
    Serial.println("----------------------------------------------------------------------");
    Serial.print("BH1750 Sensor Status         : ");
    Serial.println(bh1750Initialized ? "✅ ONLINE (Address 0x23)" : "❌ OFFLINE (Check wiring)");
    Serial.printf("Linear Calibration           : a = %.4f, b = %.4f %s\n",
                  FC28_CAL_A, FC28_CAL_B,
                  (FC28_CAL_A == 0.0f && FC28_CAL_B == 0.0f) ? "(Uncalibrated - Raw pass-through)" : "(Active)");
    Serial.println("======================================================================\n");

    // Load active configuration from NVS flash memory
    loadConfiguration();

    // Check if BOOT button is held at boot to force Captive Portal
    checkBootButtonHold();

    // If node has NEVER been configured via NVS, launch Captive Portal IMMEDIATELY!
    if (!hasCustomNvsConfig || strlen(configWifiSsid) == 0 || strlen(configDeviceId) == 0) {
        Serial.println("[SETUP] 🚀 Unconfigured node detected! Launching \"GreenNode-Setup\" Portal immediately...");
        startCaptivePortal();
    }

    // Connect to Wi-Fi
    connectToWiFi();

    // Start NTP background time sync
    initTimeService();

    // Trigger first telemetry cycle immediately on entering loop()
    lastTelemetryMillis = millis() - REFRESH_INTERVAL_MS;
}

// ============================================================================
// 10. MAIN EXECUTION LOOP
// ============================================================================

void loop() {
    // 1. Monitor BOOT button during normal runtime: holding for 3s opens setup portal
    checkBootButtonHold();

    unsigned long currentMillis = millis();

    // 2. Non-blocking drift-free interval scheduler
    if (currentMillis - lastTelemetryMillis >= REFRESH_INTERVAL_MS) {
        lastTelemetryMillis = currentMillis;

        // Maintain Wi-Fi connectivity
        if (WiFi.status() != WL_CONNECTED) {
            connectToWiFi();
        }

        // Sample all sensors sequentially
        SensorTelemetry data;
        sampleSoilSensor(data);             // Gated reading: probe is turned OFF before Wi-Fi TX
        sampleEnvironmentalSensor(data);
        sampleLightSensor(data);
        sampleInternalMetrics(data);
        populateIso8601Timestamp(data.timestamp, sizeof(data.timestamp));

        // Visual feedback
        pulseStatusLed(40);

        // Formatted Terminal Dashboard
        Serial.println("┌─────────────────────────── TELEMETRY REPORT ───────────────────────────┐");
        Serial.printf("│ 🕐 Timestamp (UTC ISO)     : %-42s│\n",
                      data.timestamp[0] != '\0' ? data.timestamp : "(Syncing with NTP...)");
        Serial.printf("│ 🌾 Soil Moisture (FC-28)   : %5.1f %%  (Raw: %4d | Cal: %6.1f / 4095) │\n",
                      data.soilMoisture, data.soilRaw, data.soilCalibrated);
        if (data.dhtValid) {
            Serial.printf("│ 🌡️  Temperature            : %5.2f °C                                  │\n", data.temperature);
            Serial.printf("│ 💧 Relative Humidity       : %5.2f %%                                   │\n", data.humidity);
        } else {
            Serial.println("│ ⚠️  DHT22 Environmental    : Read Error (NaN) Check GPIO 3 wiring      │");
        }
        if (data.lightValid) {
            Serial.printf("│ ☀️  Ambient Light (BH1750) : %7.1f lx  [%-18s]          │\n", data.lightLux, classifyLux(data.lightLux));
        } else {
            Serial.println("│ ⚠️  BH1750 Light Sensor    : Read Error Check GPIO 5/6 I2C             │");
        }
        Serial.printf("│ 🔥 ESP32 Internal Temp     : %5.2f °C                                  │\n", data.espTemperature);
        Serial.printf("│ 📶 Wi-Fi Signal (RSSI)     : %4d dBm (SSID: %-25s)│\n",
                      data.rssi, data.wifiSsid[0] != '\0' ? data.wifiSsid : "Disconnected");
        Serial.println("└────────────────────────────────────────────────────────────────────────┘\n");

        // Send JSON to backend (probe is guaranteed OFF, safe from brownout)
        sendTelemetryHttp(data);
    }

    // Yield to RTOS / Wi-Fi background tasks without blocking
    delay(10);
}
