// ============================================================================
// 1. ESP32-C3 SUPERMINI ONBOARD WIFI TEST - CONSTANTS & CONFIGURATION
// ============================================================================
#include <WiFi.h>

// ---> [WIFI NETWORK CREDENTIALS - CONFIGURE HERE] <---
const char* WIFI_SSID                         = "Malith's A55";     // <-- Enter your WiFi Network Name (SSID)
const char* WIFI_PASSWORD                     = "malith26";         // <-- Enter your WiFi Password

// --- Pin Assignments & Hardware Configuration ---
const int PIN_STATUS_LED                      = 8;                  // Onboard Blue Status LED (Active LOW on ESP32-C3)
const unsigned long WIFI_TIMEOUT_MS           = 20000;              // 20-second timeout for connection attempts
const unsigned long TERMINAL_REFRESH_DELAY_MS = 5000;               // 5-second (5000ms) gap between terminal status reports


// ============================================================================
// 2. HELPER & DIAGNOSTIC FUNCTIONS
// ============================================================================

// Blinks the onboard blue LED for visual activity indication
void pulseLed(int durationMs = 50) {
    digitalWrite(PIN_STATUS_LED, LOW);   // ON (active low)
    delay(durationMs);
    digitalWrite(PIN_STATUS_LED, HIGH);  // OFF
}

// Converts RSSI (dBm) to human-readable signal quality rating
const char* evaluateSignalStrength(int rssi) {
    if (rssi >= -55) return "📶 Excellent (-55 dBm or stronger)";
    if (rssi >= -67) return "📶 Good (Fast, reliable streaming)";
    if (rssi >= -75) return "📶 Fair (Usable, minor packet loss)";
    if (rssi >= -85) return "⚠️ Weak (High latency / low throughput)";
    return "❌ Very Weak / Disconnecting";
}

// Connects to WiFi network with timeout and visual LED feedback
bool connectToWiFi() {
    Serial.println("\n--------------------------------------------------");
    Serial.printf("Connecting to WiFi SSID: \"%s\"\n", WIFI_SSID);
    Serial.println("--------------------------------------------------");

    WiFi.disconnect(true);
    delay(500);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    unsigned long startAttempt = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < WIFI_TIMEOUT_MS) {
        digitalWrite(PIN_STATUS_LED, !digitalRead(PIN_STATUS_LED)); // Toggle LED while waiting
        delay(350);
        Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
        digitalWrite(PIN_STATUS_LED, HIGH); // Solid OFF when connected
        Serial.println("\n✅ WiFi connected successfully!");
        return true;
    } else {
        digitalWrite(PIN_STATUS_LED, LOW);  // Solid ON if connection failed
        Serial.println("\n❌ Connection timed out! Check SSID and Password.");
        return false;
    }
}


// ============================================================================
// 3. SYSTEM INITIALIZATION
// ============================================================================

void setup() {
    Serial.begin(115200);
    delay(1500); // Allow native USB-CDC to initialize

    pinMode(PIN_STATUS_LED, OUTPUT);
    digitalWrite(PIN_STATUS_LED, HIGH); // OFF initially

    Serial.println("======================================================================");
    Serial.println("         ESP32-C3 SUPERMINI BUILT-IN WIFI MODULE UNIT TEST            ");
    Serial.println("======================================================================");
    Serial.println("Hardware Architecture  : ESP32-C3 RISC-V SoC (Built-in 2.4GHz 802.11b/g/n)");
    Serial.print("Target Network (SSID)  : "); Serial.println(WIFI_SSID);
    Serial.print("Connection Timeout     : "); Serial.print(WIFI_TIMEOUT_MS / 1000); Serial.println(" seconds");
    Serial.print("Status Refresh Gap     : "); Serial.print(TERMINAL_REFRESH_DELAY_MS); Serial.println(" ms (5 sec)");
    Serial.println("======================================================================");

    // Initial connection attempt
    connectToWiFi();
}


// ============================================================================
// 4. MAIN EXECUTION LOOP (5-SECOND INTERVAL)
// ============================================================================

void loop() {
    // 1. Auto-reconnect if WiFi connection drops
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("⚠️ WiFi link lost! Reconnecting...");
        connectToWiFi();
    }

    // 2. Fetch current WiFi metrics
    bool isConnected     = (WiFi.status() == WL_CONNECTED);
    int rssi             = isConnected ? WiFi.RSSI() : 0;
    IPAddress ip         = isConnected ? WiFi.localIP() : IPAddress(0, 0, 0, 0);
    IPAddress gateway    = isConnected ? WiFi.gatewayIP() : IPAddress(0, 0, 0, 0);
    IPAddress subnet     = isConnected ? WiFi.subnetMask() : IPAddress(0, 0, 0, 0);
    IPAddress dns        = isConnected ? WiFi.dnsIP() : IPAddress(0, 0, 0, 0);
    String macAddress    = WiFi.macAddress();

    // 3. Pulse onboard LED to confirm active monitoring cycle
    pulseLed(40);

    // 4. Formatted diagnostic output
    Serial.println("┌─────────────────────────── WIFI STATUS REPORT ───────────────────────────┐");
    Serial.printf("│ Status              : %-50s │\n", isConnected ? "🟢 CONNECTED" : "🔴 DISCONNECTED");
    Serial.printf("│ Network Name (SSID) : %-50s │\n", WIFI_SSID);
    Serial.printf("│ Hardware MAC Addr   : %-50s │\n", macAddress.c_str());
    Serial.printf("│ Local IP Address    : %-50s │\n", ip.toString().c_str());
    Serial.printf("│ Subnet Mask         : %-50s │\n", subnet.toString().c_str());
    Serial.printf("│ Gateway IP          : %-50s │\n", gateway.toString().c_str());
    Serial.printf("│ Primary DNS Server  : %-50s │\n", dns.toString().c_str());
    Serial.printf("│ Signal Strength     : %d dBm (%s) │\n", rssi, evaluateSignalStrength(rssi));
    Serial.printf("│ Uptime              : %lu seconds                                          │\n", millis() / 1000);
    Serial.println("└──────────────────────────────────────────────────────────────────────────┘\n");

    // 5. Wait 5 seconds before next status report
    delay(TERMINAL_REFRESH_DELAY_MS);
}
