# 🌿 Green Node - Smart Plant & Environmental Monitoring System

A complete end-to-end IoT system for greenhouse, hydroponics, and smart agriculture monitoring. The repository is partitioned into two dedicated modules:

1. **`firmware/`**: Embedded C++ firmware for the **ESP32-C3 SuperMini** microcontroller, including individual hardware unit tests, integration tests, and cloud-connected production telemetry firmware.
2. **`green-node-web/`**: Full-stack Node.js / Express backend with MongoDB and WebSockets (deployed on Render at `https://blue-circle.onrender.com`), plus a modern Apple-inspired Next.js 14 frontend.

---

## 📁 Repository Architecture

```text
green-node-sever/
│
├── firmware/                                  <-- 1. Embedded ESP32-C3 Firmware & Tests
│   ├── README.md                              <-- Master embedded guide & pin specifications
│   ├── assets/                                <-- Board pinout diagrams & visual schematics
│   │
│   ├── unit_tests/                            <-- Standalone hardware sensor unit tests
│   │   ├── README.md
│   │   ├── bh1750/                            <-- BH1750 Ambient Light (Lux) test
│   │   ├── dht22/                             <-- DHT22 Temperature & Humidity test
│   │   ├── internal_temperature/              <-- In-built on-die SoC temperature test
│   │   ├── soil_moisture/                     <-- Dual sensor comparative benchmark
│   │   ├── soil_moisture_fc28/                <-- FC-28 standalone soil test (with linear calibrator)
│   │   ├── soil_moisture_md0869/              <-- MD0869 standalone soil moisture test
│   │   └── wifi_module_test/                  <-- Built-in 2.4GHz Wi-Fi transceiver test
│   │
│   ├── integrated_test/                       <-- Single-sensor local hardware integration test
│   │   ├── README.md
│   │   ├── integrated_test.ino
│   │   └── pin_diagram.md
│   │
│   ├── final_code/                            <-- Offline single-sensor integration sketches
│   │   ├── README.md
│   │   ├── md0869_integration/               <-- Offline code for MD0869 reference soil probe
│   │   └── fc28_integration/                 <-- Offline code for FC-28 standard soil probe
│   │
│   └── production_code/                       <-- Cloud-Connected Production Telemetry Firmware
│       ├── README.md                          <-- Brownout guard, TLS & deployment guide
│       ├── fc28_production/                   <-- Production firmware for FC-28 probe (WiFi + NTP + HTTPS)
│       └── md0869_production/                 <-- Production firmware for MD0869 probe (WiFi + NTP + HTTPS)
│
└── green-node-web/                            <-- 2. Web & Cloud Application Suite
    ├── README.md                              <-- Architecture & deployment guide
    │
    ├── backend/                               <-- Express REST API, MongoDB & WebSockets (Render: blue-circle.onrender.com)
    │   ├── README.md                          <-- API docs & local setup
    │   ├── package.json                       <-- Node dependencies & scripts
    │   ├── tsconfig.json                      <-- TypeScript configuration
    │   ├── docker-compose.yml                 <-- Local MongoDB container
    │   ├── scripts/                           <-- Simulation scripts (simulate_node.ts)
    │   └── src/                               <-- Express backend source code
    │       ├── app.ts                         <-- Server entry point
    │       ├── config/                        <-- Database & environment config
    │       ├── controllers/                   <-- REST API controllers
    │       ├── models/                        <-- MongoDB Mongoose schemas
    │       ├── routes/                        <-- Express API routes
    │       ├── schemas/                       <-- Zod validation schemas
    │       ├── services/                      <-- Business logic, Logger & WebSockets
    │       └── swagger/                       <-- OpenAPI Swagger UI documentation
    │
    └── frontend/                              <-- Real-time Monitoring Dashboard (Next.js 14 / Vercel)
        ├── README.md                          <-- Next.js setup & Vercel deployment guide
        ├── package.json
        ├── tailwind.config.ts
        └── src/                               <-- Next.js App Router, AuthContext, & Apple-style UI
```

---

## 🚀 Quick Start Guide

### 1. Flashing the Embedded ESP32-C3 Firmware
Open your preferred sketch in **Arduino IDE**:
* **Hardware Unit Testing**: Test individual sensors independently under [`firmware/unit_tests/`](./firmware/unit_tests/).
* **Local Offline Integration**: Verify all sensors running simultaneously in [`firmware/integrated_test/`](./firmware/integrated_test/).
* **Cloud Production Deployment**: Flash [`firmware/production_code/fc28_production/`](./firmware/production_code/fc28_production/) (or `md0869_production/`) to send real-time encrypted telemetry via HTTPS to `https://blue-circle.onrender.com/api/readings`.

### 2. Running Backend & Web Dashboard Locally
Navigate to [`green-node-web/backend/`](./green-node-web/backend/):
```bash
cd green-node-web/backend
npm install
npm run dev
```

Navigate to [`green-node-web/frontend/`](./green-node-web/frontend/):
```bash
cd green-node-web/frontend
npm install
npm run dev
```

* **Live Cloud Backend**: [https://blue-circle.onrender.com](https://blue-circle.onrender.com)
* **API Documentation**: [https://blue-circle.onrender.com/docs](https://blue-circle.onrender.com/docs)
* **Frontend Web Dashboard**: [http://localhost:3000](http://localhost:3000)
