#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include "DHT.h"

// =========================================================================
//  🌿 Green Node - ESP32-C3 Super Mini Telemetry & Health Probe Firmware
//  Microcontroller: ESP32-C3 Super Mini (RISC-V)
//  Sensors: DHT22 (Temp & Humidity), FC-28 (Soil Moisture), LDR (Light)
// =========================================================================

// ---------- 1. WiFi Configuration ----------
const char* WIFI_SSID     = "Malith's A55";       // <-- Your WiFi SSID
const char* WIFI_PASSWORD = "malith26";           // <-- Your WiFi Password

// ---------- 2. Backend Server Configuration ----------
// Your PC's LAN IP on this WiFi network (Port 4000)
const char* SERVER_URL = "http://10.88.145.39:4000/api/readings";

// Standard UUID registered in MongoDB database for this physical node
const char* DEVICE_ID  = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

// Telemetry send interval (10000 = 10 seconds)
const unsigned long SEND_INTERVAL_MS = 10000;

// ---------- 3. ESP32-C3 Super Mini Pin Definitions ----------
// NOTE: Classic ESP32 pins 34 & 35 do NOT exist on ESP32-C3.
// ESP32-C3 requires ADC1 pins (GPIO 0-4) while WiFi is running.
#define FC28_PIN  0       // Soil Moisture Analog In (GPIO 0 - ADC1_CH0)
#define LDR_PIN   1       // Light Sensor Analog In  (GPIO 1 - ADC1_CH1)
#define DHTPIN    3       // DHT22 Digital Data Pin  (GPIO 3)
#define DHTTYPE   DHT22   // AM2302 / DHT22
#define LED_PIN   8       // Onboard Blue Status LED on C3 SuperMini (Active LOW)

DHT dht(DHTPIN, DHTTYPE);

// Soil moisture ADC calibration (ESP32-C3 12-bit ADC: 0 - 4095)
const int AIR_VALUE   = 4095;  // Dry sensor in air
const int WATER_VALUE = 1500;  // Submerged in water

// ---------- 4. Onboard Health WebServer (Port 80) ----------
WebServer healthServer(80);
unsigned long lastSendTime = 0;

// Helper to blink status LED
void blinkLed(int ms = 50) {
  digitalWrite(LED_PIN, LOW);   // ON (active low)
  delay(ms);
  digitalWrite(LED_PIN, HIGH);  // OFF
}

// Health route handler (backend pings GET http://<esp32-c3-ip>:80/health)
void handleHealthRoute() {
  blinkLed(30);
  char healthJson[256];
  snprintf(healthJson, sizeof(healthJson),
    "{\"status\":\"ok\",\"chip\":\"ESP32-C3\",\"deviceId\":\"%s\",\"uptimeMs\":%lu,\"freeHeap\":%u,\"wifiRssi\":%d}",
    DEVICE_ID,
    millis(),
    ESP.getFreeHeap(),
    WiFi.RSSI()
  );
  healthServer.send(200, "application/json", healthJson);
  Serial.println("📡 [Health Probe] Responded 200 OK to backend health check.");
}

void handleNotFound() {
  healthServer.send(404, "application/json", "{\"error\":\"Not found. Use /health\"}");
}

// ---------- 5. WiFi Helper ----------
void connectWiFi() {
  Serial.printf("\nConnecting to WiFi: %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    digitalWrite(LED_PIN, !digitalRead(LED_PIN)); // Toggle LED while connecting
    delay(400);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_PIN, HIGH); // Solid OFF when connected
    Serial.println("\n✅ WiFi connected successfully!");
    Serial.print("📍 ESP32-C3 IP: ");
    Serial.println(WiFi.localIP());
    Serial.printf("🩺 Onboard Health Route: http://%s:80/health\n\n", WiFi.localIP().toString().c_str());
  } else {
    digitalWrite(LED_PIN, LOW); // Stay ON if failed
    Serial.println("\n❌ WiFi connection failed. Will retry in loop().");
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

  char payload[384];
  snprintf(payload, sizeof(payload),
    "{"
      "\"deviceId\":\"%s\","
      "\"temperature\":%.2f,"
      "\"humidity\":%.2f,"
      "\"soilMoisture\":%.2f,"
      "\"light\":%.1f,"
      "\"metadata\":{\"chip\":\"esp32-c3-supermini\",\"soil_raw\":%d,\"light_raw\":%d,\"rssi\":%d}"
    "}",
    DEVICE_ID, temp, hum, soilPct, lightLux, soilRaw, lightRaw, WiFi.RSSI()
  );

  Serial.print("📤 POST → ");
  Serial.println(payload);

  int code = http.POST((uint8_t*)payload, strlen(payload));

  if (code > 0) {
    blinkLed(40); // Flash LED on successful transmission
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
  // ESP32-C3 uses native USB CDC
  Serial.begin(115200);
  delay(1000); // Give USB CDC time to initialize

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH); // Off initially

  Serial.println("\n=================================================");
  Serial.println("🌿 Green Node - ESP32-C3 Super Mini Telemetry");
  Serial.println("=================================================");

  // Initialize Sensors
  dht.begin();
  pinMode(FC28_PIN, INPUT);
  pinMode(LDR_PIN, INPUT);

  // Connect to WiFi
  connectWiFi();

  // Start Onboard Health Server on Port 80
  healthServer.on("/health", HTTP_GET, handleHealthRoute);
  healthServer.onNotFound(handleNotFound);
  healthServer.begin();
  Serial.println("🚀 Health WebServer running on port 80");
}

// ---------- 8. Main Loop ----------
void loop() {
  // Non-blocking health server listener
  healthServer.handleClient();

  // Reconnect WiFi if disconnected
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastWifiRetry = 0;
    if (millis() - lastWifiRetry > 10000) {
      lastWifiRetry = millis();
      connectWiFi();
    }
  }

  // Periodic sensor telemetry
  unsigned long currentMillis = millis();
  if (currentMillis - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = currentMillis;

    // --- 1. Read DHT22 (Temp & Humidity) ---
    float hum = dht.readHumidity();
    float tmp = dht.readTemperature();

    if (isnan(hum) || isnan(tmp)) {
      Serial.println("⚠️ DHT22 read failed — verify 3.3V/GND and GPIO 3 connection.");
      return;
    }

    // --- 2. Read Soil Moisture (FC-28 on GPIO 0) ---
    int soilRaw = analogRead(FC28_PIN);
    int soilPct = constrain(map(soilRaw, AIR_VALUE, WATER_VALUE, 0, 100), 0, 100);

    // --- 3. Read Ambient Light (LDR on GPIO 1) ---
    int lightRaw = analogRead(LDR_PIN);
    float lightLux = constrain(map(lightRaw, 0, 4095, 0, 1500), 0, 1500);

    Serial.printf("📊 [Sensors] Temp=%.2f°C | Hum=%.2f%% | SoilRaw=%d (%.1f%%) | LightRaw=%d (%.1f Lux)\n",
                  tmp, hum, soilRaw, (float)soilPct, lightRaw, lightLux);

    // --- 4. Send to Backend ---
    postReading(tmp, hum, (float)soilPct, lightLux, soilRaw, lightRaw);
  }

  delay(10); // CPU yield
}
