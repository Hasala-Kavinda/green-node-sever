# 🌿 Green Node - Smart Plant & Environmental Monitoring System

A complete end-to-end IoT system for greenhouse, hydroponics, and smart agriculture monitoring. The repository is partitioned into two dedicated modules:

1. **`esp code/`**: Embedded C++ firmware for the **ESP32-C3 SuperMini** microcontroller, including individual hardware unit tests, integration tests, and production single-sensor firmware.
2. **`full_stack_development/`**: Full-stack Node.js / Express backend, MongoDB database, real-time WebSocket server, and live HTML5 dashboard.

---

## 📁 Repository Architecture

```text
green-node-sever/
│
├── esp code/                                  <-- 1. Embedded ESP32-C3 Firmware & Tests
│   ├── README.md                              <-- Master embedded guide & pin specifications
│   ├── assets/                                <-- Board pinout diagrams & visual schematics
│   ├── unit_tests/                            <-- Standalone hardware sensor unit tests
│   │   ├── README.md
│   │   ├── bh1750/                            <-- BH1750 Ambient Light (Lux) test
│   │   ├── dht22/                             <-- DHT22 Temperature & Humidity test
│   │   ├── internal_temperature/              <-- In-built on-die SoC temperature test
│   │   ├── soil_moisture/                     <-- Dual sensor comparative benchmark
│   │   ├── soil_moisture_fc28/                <-- FC-28 standalone soil moisture test
│   │   ├── soil_moisture_md0869/              <-- MD0869 standalone soil moisture test
│   │   └── wifi_module_test/                  <-- Built-in 2.4GHz Wi-Fi transceiver test
│   ├── integrated_test/                       <-- Single-sensor local hardware integration test
│   │   ├── README.md
│   │   ├── integrated_test.ino
│   │   └── pin_diagram.md
│   └── final_code/                            <-- Production single-sensor integration sketches
│       ├── README.md
│       ├── md0869_integration/               <-- Final code for MD0869 reference soil probe
│       └── fc28_integration/                 <-- Final code for FC-28 standard soil probe
│
└── full_stack_development/                    <-- 2. Full-Stack Web & Backend Server
    ├── README.md                              <-- Server setup & REST API documentation
    ├── src/                                   <-- TypeScript backend source code
    │   ├── app.ts                             <-- Express application entry point
    │   ├── config/                            <-- Database & environment config
    │   ├── controllers/                       <-- REST API controllers
    │   ├── models/                            <-- MongoDB Mongoose schemas
    │   ├── public/                            <-- Live HTML5 / JS monitoring dashboard
    │   ├── routes/                            <-- Express API routes
    │   ├── schemas/                           <-- Zod validation schemas
    │   ├── services/                          <-- Business logic, Logger & WebSockets
    │   └── swagger/                           <-- OpenAPI Swagger UI documentation
    ├── scripts/                               <-- Simulation scripts (simulate_node.ts)
    ├── package.json                           <-- Node dependencies & scripts
    ├── tsconfig.json                          <-- TypeScript configuration
    └── docker-compose.yml                     <-- Containerized MongoDB setup
```

---

## 🚀 Quick Start Guide

### 1. Working on the Embedded ESP32 Code
Open any sketch in **Arduino IDE** from the [`esp code/`](./esp%20code/) folder:
* **Unit Testing**: Test individual sensors one by one under [`esp code/unit_tests/`](./esp%20code/unit_tests/).
* **Integrated Hardware Test**: Run all sensors together locally in [`esp code/integrated_test/`](./esp%20code/integrated_test/).
* **Production Code**: Flash [`esp code/final_code/md0869_integration/`](./esp%20code/final_code/md0869_integration/) (or `fc28_integration/`).

### 2. Working on Full-Stack Development
Navigate to [`full_stack_development/`](./full_stack_development/):
```bash
cd full_stack_development

# Install dependencies
npm install

# Start development server with hot-reload
npm run dev

# Run device simulator
npm run simulate
```

* **Live Dashboard**: [http://localhost:4000](http://localhost:4000)
* **API Documentation**: [http://localhost:4000/docs](http://localhost:4000/docs)
