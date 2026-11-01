# 🌐 Green Node - Web & Cloud Application Suite

This directory contains the web applications for the Green Node IoT platform, separated into independent backend and frontend services:

```text
green-node-web/
├── backend/                                   <-- Express REST API, MongoDB & WebSockets (Render)
│   ├── README.md                              <-- Backend setup, MongoDB & API docs
│   ├── package.json
│   ├── tsconfig.json
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── scripts/                               <-- Telemetry node simulator (simulate_node.ts)
│   └── src/                                   <-- Server entry, schemas, models & routes
│
└── frontend/                                  <-- Next.js 14 Telemetry Dashboard (Vercel)
    ├── README.md                              <-- Next.js setup & Vercel deployment guide
    ├── package.json
    ├── tailwind.config.ts
    ├── .env.example
    ├── .env.local
    └── src/                                   <-- Next.js App Router, AuthContext, & Apple-style UI
```

---

## 🚀 Live Cloud Deployments

* **Backend API & Swagger Docs**: [https://blue-circle.onrender.com](https://blue-circle.onrender.com)
  * **Health Check**: `GET https://blue-circle.onrender.com/api/health`
  * **Telemetry Endpoint**: `POST https://blue-circle.onrender.com/api/readings`
  * **Swagger Documentation**: [https://blue-circle.onrender.com/docs](https://blue-circle.onrender.com/docs)
* **Frontend**: Next.js 14 dashboard deploying to Vercel.

---

## 🛠️ Deployment Guide

### 1. Backend (`backend/`) $\rightarrow$ Deploy to Render
* **Service Type**: **Web Service**
* **Build Command**: `npm install && npm run build`
* **Start Command**: `npm start`
* **Environment Variables**:
  * `PORT=4000`
  * `NODE_ENV=production`
  * `MONGODB_URI=<your_mongodb_atlas_connection_string>`
  * `FRONTEND_URL=<your_vercel_app_url>`
  * `CORS_ORIGIN=*`

### 2. Frontend (`frontend/`) $\rightarrow$ Deploy to Vercel
* **Framework Preset**: `Next.js`
* **Root Directory**: `green-node-web/frontend`
* **Build Command**: `npm run build`
* **Environment Variables**:
  * `NEXT_PUBLIC_API_URL=https://blue-circle.onrender.com`
