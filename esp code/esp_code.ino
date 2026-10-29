#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include "DHT.h"

// =========================================================================
//  🌿 Green Node - ESP32-C3 SuperMini Telemetry & Health Probe Firmware
//  Official Hardware Reference: ESP32-C3 SuperMini Datasheet
//  Chip: Espressif ESP32C3FN4 (32-bit RISC-V @ 160MHz, 4MB Flash, 400KB SRAM)
//  Sensors: DHT22 (Temp & Humidity), FC-28 (Soil Moisture), LDR (Light)
// =========================================================================

// ---------- 1. WiFi Configuration ----------
const char* WIFI_SSID     = "Malith's A55";       // <-- WiFi SSID
const char* WIFI_PASSWORD = "malith26";           // <-- WiFi Password

// ---------- 2. Backend Server Configuration ----------
// Target: Green Node Node.js/Express Backend running on port 4000
const char* SERVER_URL    = "http://10.88.145.39:4000/api/readings";

// Standard UUID registered in MongoDB database for this physical node
const char* DEVICE_ID     = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

// Periodic telemetry transmission interval (10000 ms = 10 seconds)
const unsigned long SEND_INTERVAL_MS = 10000;

// ---------- 3. ESP32-C3 SuperMini Pin Definitions ----------
// Reference: Datasheet "Product parameter" & "Pin use"
// - Total 11 Digital GPIOs (GPIO 0 - GPIO 10)
// - 4 Analog Inputs ADC1 (GPIO 0, 1, 2, 3) - Fully functional with active Wi-Fi!
//
// Left Header Pinout:
//   Pin 1: 5V   (Accepts 3.3V - 6V external supply; Do NOT plug USB and external 5V together!)
//   Pin 2: GND  (Common ground)
//   Pin 3: 3V3  (3.3V sensor supply)
//   Pin 4: GPIO 0 -> ADC1_CH0 -> FC-28 Soil Moisture Analog In
//   Pin 5: GPIO 1 -> ADC1_CH1 -> LDR Light Sensor Analog In
//   Pin 6: GPIO 2 -> ADC1_CH2
//   Pin 7: GPIO 3 -> ADC1_CH3 / GPIO 3 -> DHT22 Data Pin
//   Pin 8: GPIO 4 -> Digital Pin 4
//
// Right Header Pinout:
//   Pin 4: GPIO 8 -> Onboard Blue Status LED (Datasheet: HIGH = ON, LOW = OFF)

#define FC28_PIN  0       // Soil Moisture Analog In (GPIO 0 - ADC1_CH0)
#define LDR_PIN   1       // Light Sensor Analog In  (GPIO 1 - ADC1_CH1)
#define DHTPIN    3       // DHT22 Digital Data Pin  (GPIO 3)
#define DHTTYPE   DHT22   // AM2302 / DHT22 sensor type
#define LED_PIN   8       // Onboard Blue Status LED (Datasheet: GPIO 8)

DHT dht(DHTPIN, DHTTYPE);

// Soil moisture calibration for ESP32-C3 12-bit ADC (0 - 4095 range)
const int AIR_VALUE   = 4095;  // Dry sensor in air
const int WATER_VALUE = 1500;  // Submerged in water

// ---------- 4. Onboard Health WebServer (Port 80) ----------
WebServer healthServer(80);
unsigned long lastSendTime = 0;

// Helper: Blink onboard blue LED
// According to Datasheet page 4 & 10:
//   digitalWrite(led, HIGH); // turn the LED on
//   digitalWrite(led, LOW);  // turn the LED off
void blinkLed(int ms = 50) {
  digitalWrite(LED_PIN, HIGH); // ON (Datasheet specification)
  delay(ms);
  digitalWrite(LED_PIN, LOW);  // OFF
}

// Health route handler (Backend queries: GET http://<esp-ip>:80/health)
void handleHealthRoute() {
  blinkLed(30);
  char healthJson[280];
  snprintf(healthJson, sizeof(healthJson),
    "{"
      "\"status\":\"ok\","
      "\"chip\":\"ESP32C3FN4\","
      "\"board\":\"ESP32-C3 SuperMini\","
      "\"deviceId\":\"%s\","
      "\"uptimeMs\":%lu,"
      "\"freeHeap\":%u,"
      "\"wifiRssi\":%d"
    "}",
    DEVICE_ID,
    millis(),
    ESP.getFreeHeap(),
    WiFi.RSSI()
  );
  healthServer.send(200, "application/json", healthJson);
  Serial.println("📡 [Health Probe] Responded 200 OK to backend health ping.");
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
    delay(300);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_PIN, LOW); // LED OFF when normally connected
    Serial.println("\n✅ WiFi connected successfully!");
    Serial.print("📍 ESP32-C3 IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("📶 Signal (RSSI): ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    Serial.printf("🩺 Onboard Health Route: http://%s:80/health\n\n", WiFi.localIP().toString().c_str());
  } else {
    digitalWrite(LED_PIN, HIGH); // Solid LED ON to indicate connection failure
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

  char payload[400];
  snprintf(payload, sizeof(payload),
    "{"
      "\"deviceId\":\"%s\","
      "\"temperature\":%.2f,"
      "\"humidity\":%.2f,"
      "\"soilMoisture\":%.2f,"
      "\"light\":%.1f,"
      "\"metadata\":{"
        "\"chip\":\"ESP32C3FN4\","
        "\"board\":\"ESP32-C3 SuperMini\","
        "\"soil_raw\":%d,"
        "\"light_raw\":%d,"
        "\"rssi\":%d"
      "}"
    "}",
    DEVICE_ID, temp, hum, soilPct, lightLux, soilRaw, lightRaw, WiFi.RSSI()
  );

  Serial.print("📤 POST → ");
  Serial.println(payload);

  int code = http.POST((uint8_t*)payload, strlen(payload));

  if (code > 0) {
    blinkLed(40); // Flash LED on successful packet post
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
  // ESP32-C3 uses native USB-CDC.
  // Datasheet Note: Ensure "USB CDC On Boot: Enabled" in Arduino IDE Tools menu.
  Serial.begin(115200);
  delay(1000); // Give USB CDC time to enumerate

  // Configure Onboard LED (GPIO 8)
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW); // OFF initially

  Serial.println("\n=================================================");
  Serial.println("🌿 Green Node - ESP32-C3 SuperMini Telemetry");
  Serial.println("MCU: ESP32C3FN4 (RISC-V @ 160MHz, 4MB Flash)");
  Serial.println("=================================================");

  // Set ADC Resolution to 12-bit (0 - 4095)
  analogReadResolution(12);

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
  Serial.println("🚀 Health WebServer active on port 80");
}

// ---------- 8. Main Loop ----------
void loop() {
  // Non-blocking health server listener
  healthServer.handleClient();

  // Auto-reconnect WiFi if connection drops
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
      Serial.println("⚠️ DHT22 read failed — verify 3.3V/GND and GPIO 3 wiring.");
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

    // --- 4. Send Telemetry to Backend ---
    postReading(tmp, hum, (float)soilPct, lightLux, soilRaw, lightRaw);
  }

  delay(10); // Yield to background FreeRTOS tasks & WiFi stack
}
