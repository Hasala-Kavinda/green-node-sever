#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include "DHT.h"

// =========================================================================
//  🌿 Green Node - ESP32 Sensor Telemetry & Health Probe Firmware
//  Sensors: DHT22 (Temp & Humidity), FC-28 (Soil Moisture), LDR (Light)
// =========================================================================

// ---------- 1. WiFi Configuration ----------
const char* WIFI_SSID     = "Malith's A55";       // <-- Replace with your WiFi SSID
const char* WIFI_PASSWORD = "malith26";   // <-- Replace with your WiFi Password

// ---------- 2. Backend Server Configuration ----------
// Your PC's actual LAN IP on this WiFi network is 10.88.145.39 (Port 4000)
const char* SERVER_URL = "http://10.88.145.39:4000/api/readings";

// Standard UUID registered in your database for this physical node
const char* DEVICE_ID  = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

// Telemetry interval in milliseconds (e.g. 10000 = 10 seconds)
const unsigned long SEND_INTERVAL_MS = 10000;

// ---------- 3. Sensor Pins & Types ----------
#define DHTPIN    4       // DHT22 Data Pin (GPIO 4)
#define DHTTYPE   DHT22   // AM2302 / DHT22
#define FC28_PIN  34      // Soil Moisture Analog Pin (GPIO 34 - ADC1)
#define LDR_PIN   35      // Light Sensor / LDR Analog Pin (GPIO 35 - ADC1)

DHT dht(DHTPIN, DHTTYPE);

// Soil moisture ADC calibration (adjust according to your soil & probe)
const int AIR_VALUE   = 4095;  // Dry sensor in air
const int WATER_VALUE = 1500;  // Sensor submerged in water cup

// ---------- 4. Onboard Health WebServer (Port 80) ----------
// Responds to backend liveness checks: GET http://<esp-ip>:80/health
WebServer healthServer(80);

unsigned long lastSendTime = 0;

// Health route handler called when backend checks if ESP is ON
void handleHealthRoute() {
  char healthJson[256];
  snprintf(healthJson, sizeof(healthJson),
    "{\"status\":\"ok\",\"deviceId\":\"%s\",\"uptimeMs\":%lu,\"freeHeap\":%u,\"wifiRssi\":%d}",
    DEVICE_ID,
    millis(),
    ESP.getFreeHeap(),
    WiFi.RSSI()
  );
  healthServer.send(200, "application/json", healthJson);
  Serial.println("📡 [Health Probe] Responded 200 OK to backend health check.");
}

// 404 Handler for health server
void handleNotFound() {
  healthServer.send(404, "application/json", "{\"error\":\"Route not found. Use /health\"}");
}

// ---------- 5. WiFi Helper ----------
void connectWiFi() {
  Serial.printf("\nConnecting to WiFi: %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi connected successfully!");
    Serial.print("📍 ESP32 IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.printf("🩺 Onboard Health Route: http://%s:80/health\n\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n❌ WiFi connection FAILED. Will retry in loop().");
  }
}

// ---------- 6. HTTP POST Helper ----------
bool postReading(float temp, float hum, float soilPct, float lightLux, int soilRaw, int lightRaw) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ HTTP POST skipped: WiFi not connected.");
    return false;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  // Build JSON payload matching the backend schema
  // Sends: deviceId (UUID), temperature, humidity, soilMoisture, light + raw metadata
  char payload[384];
  snprintf(payload, sizeof(payload),
    "{"
      "\"deviceId\":\"%s\","
      "\"temperature\":%.2f,"
      "\"humidity\":%.2f,"
      "\"soilMoisture\":%.2f,"
      "\"light\":%.1f,"
      "\"metadata\":{\"soil_raw\":%d,\"light_raw\":%d,\"rssi\":%d}"
    "}",
    DEVICE_ID, temp, hum, soilPct, lightLux, soilRaw, lightRaw, WiFi.RSSI()
  );

  Serial.print("📤 POST → ");
  Serial.println(payload);

  int code = http.POST((uint8_t*)payload, strlen(payload));

  if (code > 0) {
    String body = http.getString();
    Serial.printf("📥 HTTP %d | Response: %s\n\n", code, body.c_str());
  } else {
    Serial.printf("❌ POST failed, error: %s\n\n", http.errorToString(code).c_str());
  }

  http.end();
  return (code >= 200 && code < 300);
}

// ---------- 7. Setup ----------
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=============================================");
  Serial.println("🌿 Green Node ESP32 Telemetry & Health Probe");
  Serial.println("=============================================");

  // Initialize Sensors
  dht.begin();
  pinMode(FC28_PIN, INPUT);
  pinMode(LDR_PIN, INPUT);

  // Connect to WiFi
  connectWiFi();

  // Setup Onboard HTTP Health Server on port 80
  healthServer.on("/health", HTTP_GET, handleHealthRoute);
  healthServer.onNotFound(handleNotFound);
  healthServer.begin();
  Serial.println("🚀 Health WebServer started on port 80 (handles /health)");
}

// ---------- 8. Main Loop ----------
void loop() {
  // Always listen for backend health probes (must be fast and non-blocking)
  healthServer.handleClient();

  // Ensure WiFi connection is maintained
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastWifiRetry = 0;
    if (millis() - lastWifiRetry > 10000) {
      lastWifiRetry = millis();
      connectWiFi();
    }
  }

  // Non-blocking timed interval for sensor readings
  unsigned long currentMillis = millis();
  if (currentMillis - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = currentMillis;

    // --- 1. Read Temperature & Humidity from DHT22 ---
    float hum = dht.readHumidity();
    float tmp = dht.readTemperature();

    if (isnan(hum) || isnan(tmp)) {
      Serial.println("⚠️ DHT22 read failed — check wiring on GPIO 4!");
      return;
    }

    // --- 2. Read Soil Moisture from FC-28 ---
    int soilRaw = analogRead(FC28_PIN);
    int soilPct = constrain(map(soilRaw, AIR_VALUE, WATER_VALUE, 0, 100), 0, 100);

    // --- 3. Read Ambient Light from LDR ---
    // (If no LDR is connected yet, lightRaw will read near 0 and lightLux will be 0)
    int lightRaw = analogRead(LDR_PIN);
    float lightLux = constrain(map(lightRaw, 0, 4095, 0, 1500), 0, 1500);

    Serial.printf("📊 [Sensors] Temp=%.2f°C | Hum=%.2f%% | SoilRaw=%d (%.1f%%) | LightRaw=%d (%.1f Lux)\n",
                  tmp, hum, soilRaw, (float)soilPct, lightRaw, lightLux);

    // --- 4. Send Telemetry to Server ---
    postReading(tmp, hum, (float)soilPct, lightLux, soilRaw, lightRaw);
  }

  // Small delay for watchdog and CPU yield
  delay(10);
}
