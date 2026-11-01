# 🌿 Green Node - Frontend Dashboard

Real-time IoT monitoring dashboard for greenhouse environment and soil telemetry.

---

## 🚀 Features
* **Real-time WebSocket Live Feed**: Instant push updates for sensor ingestion and device heartbeats.
* **Interactive Sensor Charts**: Visual 24-hour trends for temperature, humidity, soil moisture, and ambient light (Lux).
* **ESP32 Liveness & Device Hub**: Track physical device online/offline states, latency ping, and device registration.
* **Cross-Origin & Cloud Ready**: Runs standalone or deploys instantly to **Vercel**, **Netlify**, or **Render Static Sites**.

---

## 🛠️ Local Development

Open `index.html` directly in any web browser:
* Double-click `index.html` or run with VS Code Live Server / `npx serve .`.
* By default, it connects to local backend `http://localhost:4000`.

---

## ☁️ Deployment (Vercel / Render Static Site)

### Deploying to Vercel
1. In Vercel, import the repository and set the **Root Directory** to `green-node-web/frontend`.
2. Framework Preset: **Other**.
3. Deploy!

### Pointing to your Remote Backend (e.g. Render)
You can point the frontend to your remote backend in one of two easy ways:
1. **URL Query Parameter**:
   Append `?api=https://your-backend-app.onrender.com` when opening the site (saved automatically in localStorage).
   ```text
   https://green-node-dashboard.vercel.app/?api=https://your-backend-app.onrender.com
   ```
2. **Browser LocalStorage**:
   Open browser DevTools Console and run:
   ```js
   localStorage.setItem('green_node_api_url', 'https://your-backend-app.onrender.com');
   ```
