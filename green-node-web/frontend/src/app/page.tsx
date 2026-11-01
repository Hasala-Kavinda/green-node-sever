"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  fetchDevices,
  registerDevice,
  fetchLatestReading,
  fetchStats,
  fetchLogs,
  clearAllLogs,
  pingDevice,
  pingKeepAlive,
  sendTestReading,
  getWebSocketUrl,
  getBackendUrl,
  setBackendUrl,
  Device,
  Reading,
  SystemLog,
} from "@/lib/api";
import {
  Leaf,
  Thermometer,
  Droplets,
  Sprout,
  Sun,
  Activity,
  Radio,
  Plus,
  RefreshCw,
  LogOut,
  Settings,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Wifi,
  ExternalLink,
} from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function DashboardPage() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();

  // State
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
  const [latestReading, setLatestReading] = useState<Reading | null>(null);
  const [recentReadings, setRecentReadings] = useState<Reading[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [isEspOnline, setIsEspOnline] = useState<boolean>(false);
  const [espPingStatus, setEspPingStatus] = useState<string | null>(null);
  const [statsData, setStatsData] = useState<any>(null);
  const [backendStatus, setBackendStatus] = useState<"connected" | "sleeping" | "checking">("checking");
  const [backendLatency, setBackendLatency] = useState<number | null>(null);

  // Modals
  const [showRegisterModal, setShowRegisterModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [newDeviceName, setNewDeviceName] = useState<string>("");
  const [newDeviceLocation, setNewDeviceLocation] = useState<string>("");
  const [newDeviceId, setNewDeviceId] = useState<string>("");
  const [apiUrlInput, setApiUrlInput] = useState<string>("");
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const socketRef = useRef<WebSocket | null>(null);

  // Auth Protection
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Initial Data Load & Keep-Alive Ping
  useEffect(() => {
    if (!isAuthenticated) return;
    setApiUrlInput(getBackendUrl());
    checkBackendHealth();
    loadDevices();
    loadLogs();

    // Auto keep-alive ping every 10 minutes while dashboard is open (Render sleeps after 15m idle)
    const keepAliveTimer = setInterval(() => {
      checkBackendHealth();
    }, 10 * 60 * 1000);

    return () => clearInterval(keepAliveTimer);
  }, [isAuthenticated]);

  const checkBackendHealth = async () => {
    const startTime = Date.now();
    try {
      setBackendStatus((prev) => (prev === "connected" ? "connected" : "checking"));
      const data = await pingKeepAlive();
      if (data && (data.status === "awake" || data.status === "ok")) {
        setBackendLatency(Date.now() - startTime);
        setBackendStatus("connected");
      } else {
        setBackendStatus("sleeping");
      }
    } catch {
      setBackendStatus("sleeping");
      setBackendLatency(null);
    }
  };

  // Active Device Change
  useEffect(() => {
    if (!isAuthenticated || !activeDeviceId) return;
    loadDeviceData(activeDeviceId);
    initWebSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [activeDeviceId, isAuthenticated]);

  const loadDevices = async () => {
    try {
      const list = await fetchDevices();
      setDevices(list);
      if (list.length > 0 && !list.find((d) => d.deviceId === activeDeviceId)) {
        setActiveDeviceId(list[0].deviceId);
      }
    } catch {
      // Backend may be sleeping or offline
    }
  };

  const loadDeviceData = async (devId: string) => {
    try {
      const [reading, stats] = await Promise.all([
        fetchLatestReading(devId),
        fetchStats(devId, 24),
      ]);
      if (reading) {
        setLatestReading(reading);
        setRecentReadings((prev) => [reading, ...prev.filter((r) => r.timestamp !== reading.timestamp)].slice(0, 30));
      }
      setStatsData(stats);
      checkLiveness(devId);
    } catch (err) {
      console.error(err);
    }
  };

  const loadLogs = async () => {
    try {
      const list = await fetchLogs(30);
      setLogs(list);
    } catch {
      // ignore
    }
  };

  const checkLiveness = async (devId: string) => {
    try {
      const res = await pingDevice(devId);
      if (res.success && res.data) {
        setIsEspOnline(res.data.isOnline);
        setEspPingStatus(res.data.isOnline ? `Online (${res.data.ageSeconds ?? 0}s ago)` : "Offline");
      }
    } catch {
      setIsEspOnline(false);
      setEspPingStatus("Offline / Unreachable");
    }
  };

  // WebSocket Connection
  const initWebSocket = () => {
    const wsUrl = getWebSocketUrl();
    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.event === "new_reading" && payload.data) {
            const reading: Reading = payload.data;
            if (reading.deviceId === activeDeviceId) {
              setLatestReading(reading);
              setRecentReadings((prev) => [reading, ...prev].slice(0, 30));
              setIsEspOnline(true);
            }
          } else if (payload.event === "device_heartbeat") {
            if (payload.data?.deviceId === activeDeviceId) {
              setIsEspOnline(true);
            }
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
      };

      ws.onerror = () => {
        setWsConnected(false);
      };
    } catch {
      setWsConnected(false);
    }
  };

  const handleRegisterDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegistering(true);
    try {
      const dev = await registerDevice({
        deviceId: newDeviceId.trim() || undefined,
        name: newDeviceName.trim(),
        location: newDeviceLocation.trim() || undefined,
      });
      setShowRegisterModal(false);
      setNewDeviceName("");
      setNewDeviceLocation("");
      setNewDeviceId("");
      await loadDevices();
      setActiveDeviceId(dev.deviceId);
      setFeedbackMsg({ type: "success", text: `Node ${dev.name} registered successfully!` });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      alert(err.message || "Registration failed");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleSaveApiUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiUrlInput.trim()) {
      setBackendUrl(apiUrlInput.trim());
      setShowSettingsModal(false);
      window.location.reload();
    }
  };

  const handleSendSample = async () => {
    try {
      await sendTestReading({
        deviceId: activeDeviceId,
        temperature: parseFloat((23 + Math.random() * 5).toFixed(2)),
        humidity: parseFloat((55 + Math.random() * 15).toFixed(2)),
        soilMoisture: parseFloat((45 + Math.random() * 25).toFixed(2)),
        light: parseFloat((450 + Math.random() * 400).toFixed(1)),
        metadata: { chip: "esp32-c3-supermini", rssi: -62 },
      });
      loadDeviceData(activeDeviceId);
      loadLogs();
      setFeedbackMsg({ type: "success", text: "Sample telemetry sent to backend!" });
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (err: any) {
      alert("Failed to send sample: " + err.message);
    }
  };

  const handleClearLogs = async () => {
    if (!confirm("Are you sure you want to clear all database logs?")) return;
    await clearAllLogs();
    setLogs([]);
  };

  // Active Device Object
  const currentDevice = devices.find((d) => d.deviceId === activeDeviceId);

  // Chart configuration
  const chartLabels = recentReadings.slice(0, 15).reverse().map((r) => {
    const d = new Date(r.timestamp);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
  });

  const chartData = {
    labels: chartLabels.length > 0 ? chartLabels : ["00:00", "00:05", "00:10", "00:15"],
    datasets: [
      {
        label: "Temperature (°C)",
        data: recentReadings.slice(0, 15).reverse().map((r) => r.temperature),
        borderColor: "#10B981",
        backgroundColor: "rgba(16, 185, 129, 0.08)",
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        yAxisID: "y",
      },
      {
        label: "Humidity (% RH)",
        data: recentReadings.slice(0, 15).reverse().map((r) => r.humidity),
        borderColor: "#06B6D4",
        backgroundColor: "transparent",
        tension: 0.35,
        borderWidth: 2,
        yAxisID: "y",
      },
      {
        label: "Soil Moisture (%)",
        data: recentReadings.slice(0, 15).reverse().map((r) => r.soilMoisture),
        borderColor: "#8B5CF6",
        backgroundColor: "transparent",
        tension: 0.35,
        borderWidth: 2,
        yAxisID: "y",
      },
    ],
  };

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        position: "top",
        labels: { color: "#A1A1A6", font: { size: 11 } },
      },
      tooltip: {
        backgroundColor: "#1C1C20",
        titleColor: "#FFFFFF",
        bodyColor: "#A1A1A6",
        borderColor: "#282830",
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(255, 255, 255, 0.04)" },
        ticks: { color: "#6E6E73", font: { size: 10 } },
      },
      y: {
        grid: { color: "rgba(255, 255, 255, 0.04)" },
        ticks: { color: "#6E6E73", font: { size: 10 } },
      },
    },
  };

  if (isLoading || !isAuthenticated) {
    return null; // Auth effect redirects
  }

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex flex-col font-sans">
      {/* Feedback Toast */}
      {feedbackMsg && (
        <div className="fixed top-5 right-5 z-50 bg-[#141417] border border-[#282830] text-emerald-400 px-4 py-2.5 rounded-xl text-xs font-medium shadow-2xl flex items-center space-x-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="border-b border-[#202026] bg-[#0E0E12]/80 backdrop-blur-xl sticky top-0 z-30 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 ring-1 ring-white/10">
              <Leaf className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-white flex items-center space-x-2">
                <span>Green Node</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  ESP32-C3
                </span>
              </h1>
              <p className="text-xs text-[#8E8E93]">
                {currentDevice?.location || "Greenhouse Zone 1"} • {currentDevice?.name || "Primary Node"}
              </p>
            </div>
          </div>

          {/* Controls & Badges */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Device Selector */}
            {devices.length > 0 && (
              <select
                value={activeDeviceId}
                onChange={(e) => setActiveDeviceId(e.target.value)}
                className="bg-[#141417] border border-[#282830] text-xs text-[#F5F5F7] rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500/50"
              >
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.name} ({d.deviceId.slice(0, 8)}...)
                  </option>
                ))}
              </select>
            )}

            {/* Backend Server Status / Keep-Alive Badge */}
            <button
              onClick={checkBackendHealth}
              title="Click to ping backend or wake up Render instance"
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition cursor-pointer ${
                backendStatus === "connected"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                  : backendStatus === "checking"
                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  backendStatus === "connected"
                    ? "bg-emerald-400"
                    : backendStatus === "checking"
                    ? "bg-blue-400 animate-ping"
                    : "bg-amber-400"
                }`}
              />
              <span>
                {backendStatus === "connected"
                  ? `Backend: Live${backendLatency !== null ? ` (${backendLatency}ms)` : ""}`
                  : backendStatus === "checking"
                  ? "Backend: Checking..."
                  : "Backend: Sleeping / Offline"}
              </span>
            </button>

            {/* ESP Liveness Badge */}
            <div
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
                isEspOnline
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/20"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isEspOnline ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
              <span>{isEspOnline ? "ESP: Active" : "ESP: Offline"}</span>
            </div>

            {/* WebSocket Badge */}
            <div
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
                wsConnected
                  ? "bg-teal-500/10 text-teal-300 border-teal-500/20"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>{wsConnected ? "WS Live" : "WS Offline"}</span>
            </div>

            {/* Register Device Button */}
            <button
              onClick={() => setShowRegisterModal(true)}
              className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-lg text-xs font-medium shadow-md shadow-emerald-500/20 transition flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Node</span>
            </button>

            {/* Test Sample Reading */}
            <button
              onClick={handleSendSample}
              className="px-3 py-1.5 bg-[#1C1C20] hover:bg-[#282830] text-xs font-medium rounded-lg border border-[#282830] transition flex items-center space-x-1.5 text-[#A1A1A6] hover:text-white"
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Simulate</span>
            </button>

            {/* Settings Modal Button */}
            <button
              onClick={() => setShowSettingsModal(true)}
              title="Configure Backend API URL"
              className="p-1.5 bg-[#1C1C20] hover:bg-[#282830] text-[#A1A1A6] hover:text-white rounded-lg border border-[#282830] transition"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Logout */}
            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 bg-[#1C1C20] hover:bg-rose-500/10 hover:text-rose-400 text-[#A1A1A6] rounded-lg border border-[#282830] hover:border-rose-500/30 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 space-y-8">
        {/* Metric Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Temperature */}
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-5 shadow-sm hover:border-[#383842] transition">
            <div className="flex items-center justify-between text-[#8E8E93] text-xs font-medium mb-3">
              <span>Ambient Temperature</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                <Thermometer className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-semibold text-white tracking-tight">
                {latestReading ? latestReading.temperature.toFixed(1) : "--"}
              </span>
              <span className="text-sm font-medium text-[#8E8E93]">°C</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-[#8E8E93]">
              <span>
                {latestReading ? `${((latestReading.temperature * 9) / 5 + 32).toFixed(1)} °F` : "--"}
              </span>
              <span className="text-emerald-400 font-medium">DHT22 Digital</span>
            </div>
          </div>

          {/* 2. Humidity */}
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-5 shadow-sm hover:border-[#383842] transition">
            <div className="flex items-center justify-between text-[#8E8E93] text-xs font-medium mb-3">
              <span>Relative Humidity</span>
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                <Droplets className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-semibold text-white tracking-tight">
                {latestReading ? latestReading.humidity.toFixed(1) : "--"}
              </span>
              <span className="text-sm font-medium text-[#8E8E93]">% RH</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-[#8E8E93]">
              <span>Optimal: 40-70%</span>
              <span className="text-cyan-400 font-medium">Digital Bus</span>
            </div>
          </div>

          {/* 3. Soil Moisture */}
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-5 shadow-sm hover:border-[#383842] transition">
            <div className="flex items-center justify-between text-[#8E8E93] text-xs font-medium mb-3">
              <span>Soil Moisture</span>
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                <Sprout className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-semibold text-white tracking-tight">
                {latestReading ? latestReading.soilMoisture.toFixed(1) : "--"}
              </span>
              <span className="text-sm font-medium text-[#8E8E93]">%</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-[#8E8E93]">
              <span>
                {latestReading?.metadata?.soil_raw ? `ADC: ${latestReading.metadata.soil_raw}` : "MD0869"}
              </span>
              <span className="text-purple-400 font-medium">Power-Gated</span>
            </div>
          </div>

          {/* 4. Ambient Light */}
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-5 shadow-sm hover:border-[#383842] transition">
            <div className="flex items-center justify-between text-[#8E8E93] text-xs font-medium mb-3">
              <span>Ambient Illuminance</span>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                <Sun className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-semibold text-white tracking-tight">
                {latestReading ? latestReading.light.toFixed(0) : "--"}
              </span>
              <span className="text-sm font-medium text-[#8E8E93]">lx</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-[#8E8E93]">
              <span>
                {latestReading
                  ? latestReading.light > 1000
                    ? "☀️ Bright Daylight"
                    : latestReading.light > 200
                    ? "⛅ Ambient Indoor"
                    : "🌑 Dim Light"
                  : "--"}
              </span>
              <span className="text-amber-400 font-medium">BH1750 I2C</span>
            </div>
          </div>
        </div>

        {/* Real-Time Chart Section */}
        <div className="bg-[#141417] border border-[#282830] rounded-2xl p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-base font-medium text-white tracking-tight">
                Real-Time Environmental Dynamics
              </h2>
              <p className="text-xs text-[#8E8E93] mt-0.5">
                Streaming timeline for active device: {activeDeviceId}
              </p>
            </div>
            <div className="flex items-center space-x-2 text-xs text-[#8E8E93]">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live Ingestion Active</span>
            </div>
          </div>

          <div className="h-[280px] w-full">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Live Feed Table & Logs Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Live Ingestion Feed */}
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-white flex items-center space-x-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Live Ingestion Telemetry</span>
              </h3>
              <span className="text-[11px] text-[#8E8E93]">
                {recentReadings.length} Packets
              </span>
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#24242A] text-[#8E8E93]">
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Temp</th>
                    <th className="py-2.5 px-3">Humidity</th>
                    <th className="py-2.5 px-3">Soil</th>
                    <th className="py-2.5 px-3">Light</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#202026]">
                  {recentReadings.slice(0, 7).map((r, i) => (
                    <tr key={i} className="hover:bg-[#1A1A20] transition">
                      <td className="py-2.5 px-3 text-[#A1A1A6]">
                        {new Date(r.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 text-emerald-400 font-medium">
                        {r.temperature.toFixed(1)}°C
                      </td>
                      <td className="py-2.5 px-3 text-cyan-400 font-medium">
                        {r.humidity.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-purple-400 font-medium">
                        {r.soilMoisture.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-amber-400 font-medium">
                        {r.light.toFixed(0)} lx
                      </td>
                    </tr>
                  ))}
                  {recentReadings.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#6E6E73]">
                        No telemetry received yet. Click "Simulate" to test.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* System & Audit Logs */}
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-white flex items-center space-x-2">
                <Wifi className="w-4 h-4 text-cyan-400" />
                <span>System Activity Logs</span>
              </h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={loadLogs}
                  className="p-1 hover:text-white text-[#8E8E93] transition"
                  title="Refresh logs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleClearLogs}
                  className="p-1 hover:text-rose-400 text-[#8E8E93] transition"
                  title="Clear all logs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#24242A] text-[#8E8E93]">
                    <th className="py-2.5 px-3">Level</th>
                    <th className="py-2.5 px-3">Message</th>
                    <th className="py-2.5 px-3">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#202026]">
                  {logs.slice(0, 7).map((log, i) => (
                    <tr key={i} className="hover:bg-[#1A1A20] transition">
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            log.severity === "error" || log.severity === "critical"
                              ? "bg-rose-500/10 text-rose-400"
                              : log.severity === "warning"
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-emerald-500/10 text-emerald-400"
                          }`}
                        >
                          {log.severity}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[#A1A1A6] truncate max-w-[200px]" title={log.message}>
                        {log.message}
                      </td>
                      <td className="py-2.5 px-3 text-[#6E6E73] whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-[#6E6E73]">
                        No system logs recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#202026] bg-[#0A0A0C] py-5 px-6 text-center text-xs text-[#52525A]">
        Green Node IoT Monitoring Hub • Next.js Framework • Node.js Express REST & WebSockets
      </footer>

      {/* Register Device Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-1">Register New ESP Node</h3>
            <p className="text-xs text-[#8E8E93] mb-4">
              Register a physical ESP32-C3 SuperMini in the MongoDB database.
            </p>

            <form onSubmit={handleRegisterDevice} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                  Device Name
                </label>
                <input
                  type="text"
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  placeholder="e.g. Greenhouse Beta Node"
                  required
                  className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white placeholder-[#5A5A60] focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                  Zone / Location
                </label>
                <input
                  type="text"
                  value={newDeviceLocation}
                  onChange={(e) => setNewDeviceLocation(e.target.value)}
                  placeholder="e.g. Sector 4 - Hydroponic Tray"
                  className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white placeholder-[#5A5A60] focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                  Device UUID (Optional - Auto-generated if left blank)
                </label>
                <input
                  type="text"
                  value={newDeviceId}
                  onChange={(e) => setNewDeviceId(e.target.value)}
                  placeholder="e.g. a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
                  className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white placeholder-[#5A5A60] font-mono focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#8E8E93] hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRegistering}
                  className="px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-lg text-xs font-medium shadow-md shadow-emerald-500/20 transition disabled:opacity-50"
                >
                  {isRegistering ? "Saving..." : "Register Device"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Backend API Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-1">Backend Connection Settings</h3>
            <p className="text-xs text-[#8E8E93] mb-4">
              Configure where this Next.js frontend fetches telemetry and REST endpoints.
            </p>

            <form onSubmit={handleSaveApiUrl} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                  Backend API URL
                </label>
                <input
                  type="url"
                  value={apiUrlInput}
                  onChange={(e) => setApiUrlInput(e.target.value)}
                  placeholder="https://your-backend.onrender.com or http://localhost:4000"
                  required
                  className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white placeholder-[#5A5A60] font-mono focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="text-[11px] text-[#6E6E73] space-y-1">
                <p>• For local dev: <code className="text-[#A1A1A6]">http://localhost:4000</code></p>
                <p>• For Render backend: <code className="text-[#A1A1A6]">https://your-service.onrender.com</code></p>
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#8E8E93] hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-lg text-xs font-medium shadow-md shadow-emerald-500/20 transition"
                >
                  Save & Reload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
