# 🌿 Green Node - Next.js Telemetry Frontend

A modern, Apple-inspired Next.js application for real-time greenhouse and environmental monitoring with authentication.

---

## 🔐 Authentication
* **Login Route**: `/login`
* **Protected Dashboard**: `/`
* **Default Credentials**:
  * **Username**: `admin`
  * **Password**: `admin`

---

## 🛠️ Local Development

```bash
# Navigate to frontend
cd green-node-web/frontend

# Install dependencies (if not already installed)
npm install

# Start Next.js development server on port 3000
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ Deployment on Vercel

1. Push your repository to GitHub.
2. In the **Vercel Dashboard**, click **New Project** and select this repository.
3. Configure the project:
   * **Framework Preset**: `Next.js`
   * **Root Directory**: `green-node-web/frontend`
4. Set Environment Variables (Optional):
   * `NEXT_PUBLIC_API_URL`: Your Render backend URL (e.g. `https://your-backend.onrender.com`).
   * *Note*: If not provided during build, you can also change the backend URL directly in the web UI using the top-right Settings icon (`⚙️`).
5. Click **Deploy**.

---

## 📦 Tech Stack
* **Framework**: Next.js 14 (App Router)
* **Language**: TypeScript
* **Styling**: Tailwind CSS (Apple-style dark mode palette)
* **Icons**: Lucide React
* **Charts**: Chart.js & React-Chartjs-2
* **Real-Time Feed**: Native WebSockets (`/ws`)
