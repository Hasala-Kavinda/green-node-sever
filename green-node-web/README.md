# 🌐 Green Node - Web & Cloud Application Suite

This directory contains the web applications for the Green Node IoT platform, separated into independent backend and frontend services:

```text
green-node-web/
├── backend/                                   <-- Express REST API, MongoDB & WebSockets (Deploy to Render)
│   ├── README.md                              <-- Backend setup, MongoDB & API docs
│   ├── package.json
│   ├── tsconfig.json
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── scripts/
│   └── src/
│
└── frontend/                                  <-- Real-time Monitoring Dashboard (Deploy to Vercel)
    ├── README.md                              <-- Frontend deployment & configuration guide
    └── index.html                             <-- Real-time Tailwind & Chart.js dashboard
```

---

## 🚀 Quick Deployment Guide

### 1. Backend (`backend/`) $\rightarrow$ Deploy to Render
* **Service Type**: **Web Service**
* **Build Command**: `npm install && npm run build`
* **Start Command**: `npm start`
* **Environment Variables**:
  * `PORT=4000`
  * `NODE_ENV=production`
  * `MONGODB_URI=<your_mongodb_atlas_connection_string>`
  * `CORS_ORIGIN=*`

### 2. Frontend (`frontend/`) $\rightarrow$ Deploy to Vercel
* **Framework Preset**: `Other`
* **Root Directory**: `green-node-web/frontend`
* **Build Command**: None (Static HTML/JS)
* **Output Directory**: `.`
