"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  fetchGreenhouses,
  fetchGreenhouseOverview,
  createGreenhouse,
  assignDeviceToGreenhouse,
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
  Greenhouse,
  Device,
  Reading,
  SystemLog,
} from "@/lib/api";
import {
  Leaf,
  Cpu,
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
  Building2,
  Warehouse,
  Copy,
  Check,
  ShieldCheck,
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

  // Hierarchy State
  const [greenhouses, setGreenhouses] = useState<Greenhouse[]>([]);
  const [activeGreenhouseId, setActiveGreenhouseId] = useState<string>("greenhouse-01");
  const [activeGreenhouse, setActiveGreenhouse] = useState<Greenhouse | null>(null);
  const [greenhouseDevices, setGreenhouseDevices] = useState<Device[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("all");

  // Active Device Drilldown (Optional focus on a specific node within greenhouse)
  const [focusedDeviceId, setFocusedDeviceId] = useState<string | null>(null);
  const [focusedLatestReading, setFocusedLatestReading] = useState<Reading | null>(null);
  const [recentReadings, setRecentReadings] = useState<Reading[]>([]);
  const [statsData, setStatsData] = useState<any>(null);

  // System & Connection State
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [backendStatus, setBackendStatus] = useState<"connected" | "sleeping" | "checking">("checking");
  const [backendLatency, setBackendLatency] = useState<number | null>(null);

  // Modals
  const [showRegisterModal, setShowRegisterModal] = useState<boolean>(false);
  const [showNewGreenhouseModal, setShowNewGreenhouseModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showProvisionedSuccess, setShowProvisionedSuccess] = useState<{
    deviceId: string;
    name: string;
    greenhouseName: string;
    companyLocation: string;
  } | null>(null);

  // Form inputs for Device Registration
  const [newDeviceName, setNewDeviceName] = useState<string>("");
  const [newDeviceCompany, setNewDeviceCompany] = useState<string>("Colombo Agri Facility");
  const [newDeviceGreenhouseId, setNewDeviceGreenhouseId] = useState<string>("greenhouse-01");
  const [newDeviceLocation, setNewDeviceLocation] = useState<string>("Zone 1 - Main Bed");
  const [newDeviceSensorType, setNewDeviceSensorType] = useState<string>("fc28");
  const [newDeviceId, setNewDeviceId] = useState<string>("");
  const [isRegistering, setIsRegistering] = useState<boolean>(false);

  // Form inputs for Greenhouse Creation
  const [newGhName, setNewGhName] = useState<string>("");
  const [newGhCompany, setNewGhCompany] = useState<string>("Colombo Agri Facility");
  const [newGhDescription, setNewGhDescription] = useState<string>("");
  const [isCreatingGh, setIsCreatingGh] = useState<boolean>(false);

  // Settings & Utilities
  const [apiUrlInput, setApiUrlInput] = useState<string>("");
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copiedUuid, setCopiedUuid] = useState<boolean>(false);

  const socketRef = useRef<WebSocket | null>(null);

  // Auth Protection
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Initial Data Load
  useEffect(() => {
    if (!isAuthenticated) return;
    setApiUrlInput(getBackendUrl());
    checkBackendHealth();
    loadGreenhouses();
    loadLogs();

    const keepAliveTimer = setInterval(() => {
      checkBackendHealth();
    }, 10 * 60 * 1000);

    return () => clearInterval(keepAliveTimer);
  }, [isAuthenticated]);

  // Load Greenhouses from Backend
  const loadGreenhouses = async () => {
    try {
      const list = await fetchGreenhouses();
      setGreenhouses(list);
      if (list.length > 0) {
        const found = list.find((g) => g.greenhouseId === activeGreenhouseId);
        if (!found) {
          setActiveGreenhouseId(list[0].greenhouseId);
        }
      }
    } catch {
      // Backend may be sleeping
    }
  };

  // Reload Greenhouse Details & Assigned Devices whenever activeGreenhouseId changes
  useEffect(() => {
    if (!isAuthenticated || !activeGreenhouseId) return;
    loadGreenhouseData(activeGreenhouseId);
    initWebSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [activeGreenhouseId, isAuthenticated]);

  const loadGreenhouseData = async (ghId: string) => {
    try {
      const overview = await fetchGreenhouseOverview(ghId);
      if (overview) {
        setActiveGreenhouse(overview);
        setGreenhouseDevices(overview.devices || []);

        // Default focused device to first device in greenhouse
        if (overview.devices && overview.devices.length > 0) {
          const firstDev = overview.devices[0];
          setFocusedDeviceId(firstDev.deviceId);
          loadFocusedNodeData(firstDev.deviceId);
        } else {
          setFocusedDeviceId(null);
          setFocusedLatestReading(null);
          setRecentReadings([]);
        }
      }
    } catch (err) {
      console.error("Failed to load greenhouse data:", err);
    }
  };

  const loadFocusedNodeData = async (devId: string) => {
    try {
      const [reading, stats] = await Promise.all([
        fetchLatestReading(devId),
        fetchStats(devId, 24, activeGreenhouseId),
      ]);
      if (reading) {
        setFocusedLatestReading(reading);
        setRecentReadings((prev) => [reading, ...prev.filter((r) => r.timestamp !== reading.timestamp)].slice(0, 30));
      }
      setStatsData(stats);
    } catch (err) {
      console.error("Error loading node telemetry:", err);
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

  // WebSocket Connection with Greenhouse Filtering
  const initWebSocket = () => {
    const wsUrl = getWebSocketUrl();
    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => setWsConnected(true);

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.event === "new_reading" && payload.data) {
            const reading: Reading = payload.data;

            // Only update if reading belongs to current greenhouse
            if (reading.greenhouseId === activeGreenhouseId) {
              setGreenhouseDevices((prev) =>
                prev.map((dev) =>
                  dev.deviceId === reading.deviceId
                    ? {
                        ...dev,
                        status: "online",
                        isOnline: true,
                        lastSeen: reading.timestamp,
                        latestReading: {
                          temperature: reading.temperature,
                          humidity: reading.humidity,
                          soilMoisture: reading.soilMoisture,
                          light: reading.light,
                          espTemperature: reading.espTemperature,
                          wifiSsid: reading.wifiSsid,
                          timestamp: reading.timestamp,
                        },
                      }
                    : dev
                )
              );

              // Update focused node if matched
              if (!focusedDeviceId || reading.deviceId === focusedDeviceId) {
                setFocusedLatestReading(reading);
                setRecentReadings((prev) => [reading, ...prev].slice(0, 30));
              }
            }
          } else if (payload.event === "device_heartbeat") {
            if (payload.data?.greenhouseId === activeGreenhouseId) {
              setGreenhouseDevices((prev) =>
                prev.map((dev) =>
                  dev.deviceId === payload.data.deviceId
                    ? { ...dev, status: "online", isOnline: true, lastSeen: payload.data.lastSeen }
                    : dev
                )
              );
            }
          }
        } catch {
          // ignore parsing error
        }
      };

      ws.onclose = () => setWsConnected(false);
      ws.onerror = () => setWsConnected(false);
    } catch {
      setWsConnected(false);
    }
  };

  // Handle Registering a New ESP Node
  const handleRegisterDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegistering(true);
    try {
      const selectedGh = greenhouses.find((g) => g.greenhouseId === newDeviceGreenhouseId);
      const company = selectedGh?.companyLocation || newDeviceCompany;
      const ghName = selectedGh?.name || "Greenhouse";

      const dev = await registerDevice({
        deviceId: newDeviceId.trim() || undefined,
        name: newDeviceName.trim(),
        companyLocation: company,
        greenhouseId: newDeviceGreenhouseId,
        greenhouseName: ghName,
        sensorType: newDeviceSensorType,
        location: newDeviceLocation.trim() || "Zone 1",
      });

      setShowRegisterModal(false);
      setNewDeviceName("");
      setNewDeviceId("");
      setNewDeviceLocation("Zone 1 - Main Bed");

      await loadGreenhouses();
      await loadGreenhouseData(newDeviceGreenhouseId);
      setActiveGreenhouseId(newDeviceGreenhouseId);
      setFocusedDeviceId(dev.deviceId);

      // Open Success & Provisioning Code Card
      setShowProvisionedSuccess({
        deviceId: dev.deviceId,
        name: dev.name,
        greenhouseName: ghName,
        companyLocation: company,
      });

      setFeedbackMsg({
        type: "success",
        text: `Sensor Module "${dev.name}" registered to ${ghName}!`,
      });
      setTimeout(() => setFeedbackMsg(null), 5000);
    } catch (err: any) {
      alert(err.message || "Registration failed");
    } finally {
      setIsRegistering(false);
    }
  };

  // Handle Creating a New Greenhouse
  const handleCreateGreenhouse = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingGh(true);
    try {
      const gh = await createGreenhouse({
        name: newGhName.trim(),
        companyLocation: newGhCompany.trim(),
        description: newGhDescription.trim() || undefined,
      });
      setShowNewGreenhouseModal(false);
      setNewGhName("");
      setNewGhDescription("");
      await loadGreenhouses();
      setActiveGreenhouseId(gh.greenhouseId);
      setFeedbackMsg({
        type: "success",
        text: `Greenhouse "${gh.name}" created at ${gh.companyLocation}!`,
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      alert(err.message || "Failed to create greenhouse");
    } finally {
      setIsCreatingGh(false);
    }
  };

  const handleCopyUuid = (uuid: string) => {
    navigator.clipboard.writeText(uuid);
    setCopiedUuid(true);
    setTimeout(() => setCopiedUuid(false), 2500);
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
    if (!focusedDeviceId) {
      alert("Please register or select an ESP node in this greenhouse first.");
      return;
    }
    try {
      await sendTestReading({
        deviceId: focusedDeviceId,
        temperature: parseFloat((23 + Math.random() * 5).toFixed(2)),
        humidity: parseFloat((55 + Math.random() * 15).toFixed(2)),
        soilMoisture: parseFloat((45 + Math.random() * 25).toFixed(2)),
        light: parseFloat((450 + Math.random() * 400).toFixed(1)),
        espTemperature: parseFloat((37 + Math.random() * 8).toFixed(2)),
        wifiSsid: "Greenhouse_IoT_2.4G",
        timestamp: new Date().toISOString(),
        metadata: { chip: "esp32-c3-supermini", rssi: -62 },
      });
      loadGreenhouseData(activeGreenhouseId);
      loadLogs();
      setFeedbackMsg({ type: "success", text: "Sample telemetry ingested & verified!" });
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (err: any) {
      alert("Telemetry rejected: " + err.message);
    }
  };

  const handleClearLogs = async () => {
    if (!confirm("Are you sure you want to clear all database logs?")) return;
    await clearAllLogs();
    setLogs([]);
  };

  // Distinct company locations for filtering
  const companyLocations = Array.from(new Set(greenhouses.map((g) => g.companyLocation)));
  const filteredGreenhouses =
    selectedLocation === "all"
      ? greenhouses
      : greenhouses.filter((g) => g.companyLocation === selectedLocation);

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
      {
        label: "ESP32 SoC Temp (°C)",
        data: recentReadings.slice(0, 15).reverse().map((r) => r.espTemperature ?? null),
        borderColor: "#F97316",
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
    return null;
  }

  const focusedDevice = greenhouseDevices.find((d) => d.deviceId === focusedDeviceId);

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex flex-col font-sans">
      {/* Feedback Toast */}
      {feedbackMsg && (
        <div className="fixed top-5 right-5 z-50 bg-[#141417] border border-[#282830] text-emerald-400 px-4 py-2.5 rounded-xl text-xs font-medium shadow-2xl flex items-center space-x-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Top Navbar with Location & Greenhouse Hierarchy */}
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
                  Cluster Edition
                </span>
              </h1>
              <p className="text-xs text-[#8E8E93] flex items-center space-x-1.5">
                <Building2 className="w-3 h-3 text-emerald-400" />
                <span>{activeGreenhouse?.companyLocation || "Company Location"}</span>
                <span>•</span>
                <Warehouse className="w-3 h-3 text-teal-400" />
                <span className="text-white font-medium">{activeGreenhouse?.name || "Greenhouse"}</span>
              </p>
            </div>
          </div>

          {/* Hierarchy Selectors & Navigation */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* 1. Company Location Filter */}
            {companyLocations.length > 1 && (
              <div className="flex items-center space-x-1.5 bg-[#141417] border border-[#282830] rounded-lg px-2.5 py-1 text-xs text-[#A1A1A6]">
                <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
                >
                  <option value="all">All Facilities</option>
                  {companyLocations.map((loc) => (
                    <option key={loc} value={loc} className="bg-[#141417]">
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 2. Greenhouse Selector */}
            <div className="flex items-center space-x-1.5 bg-[#141417] border border-[#282830] rounded-lg px-2.5 py-1 text-xs text-[#A1A1A6]">
              <Warehouse className="w-3.5 h-3.5 text-teal-400" />
              <select
                value={activeGreenhouseId}
                onChange={(e) => setActiveGreenhouseId(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none cursor-pointer font-medium"
              >
                {filteredGreenhouses.map((g) => (
                  <option key={g.greenhouseId} value={g.greenhouseId} className="bg-[#141417]">
                    {g.name} ({g.assignedDeviceIds?.length || 0} ESPs)
                  </option>
                ))}
              </select>
            </div>

            {/* Add Greenhouse Button */}
            <button
              onClick={() => setShowNewGreenhouseModal(true)}
              title="Create a new greenhouse"
              className="px-2.5 py-1.5 bg-[#1C1C20] hover:bg-[#282830] text-xs font-medium rounded-lg border border-[#282830] transition flex items-center space-x-1 text-[#A1A1A6] hover:text-white"
            >
              <Warehouse className="w-3.5 h-3.5 text-teal-400" />
              <span>+ Greenhouse</span>
            </button>

            {/* Register Sensor Module Button */}
            <button
              onClick={() => {
                setNewDeviceGreenhouseId(activeGreenhouseId);
                setShowRegisterModal(true);
              }}
              className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-lg text-xs font-medium shadow-md shadow-emerald-500/20 transition flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Sensor Module</span>
            </button>

            {/* Status Badges */}
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

            {/* Simulate Telemetry */}
            <button
              onClick={handleSendSample}
              className="px-3 py-1.5 bg-[#1C1C20] hover:bg-[#282830] text-xs font-medium rounded-lg border border-[#282830] transition flex items-center space-x-1.5 text-[#A1A1A6] hover:text-white"
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Simulate</span>
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-1.5 bg-[#1C1C20] hover:bg-[#282830] text-[#A1A1A6] hover:text-white rounded-lg border border-[#282830] transition"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Logout */}
            <button
              onClick={logout}
              className="p-1.5 bg-[#1C1C20] hover:bg-rose-500/10 hover:text-rose-400 text-[#A1A1A6] rounded-lg border border-[#282830] transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 space-y-8">
        {/* GREENHOUSE SUMMARY HEADER */}
        <div className="bg-gradient-to-r from-[#141417] via-[#16161B] to-[#121215] border border-[#282830] rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-6 relative z-10">
            <div>
              <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1">
                <ShieldCheck className="w-4 h-4" />
                <span>Protected Greenhouse Cluster</span>
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-3">
                <span>{activeGreenhouse?.name || "Active Greenhouse"}</span>
                <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {activeGreenhouse?.assignedDeviceIds?.length || greenhouseDevices.length} Registered ESPs
                </span>
              </h2>
              <p className="text-xs text-[#8E8E93] mt-1 max-w-xl">
                Location: <strong className="text-[#A1A1A6]">{activeGreenhouse?.companyLocation}</strong>
                {activeGreenhouse?.description ? ` • ${activeGreenhouse.description}` : ""}
              </p>
            </div>

            {/* Greenhouse Overview Stats */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="bg-[#1C1C22]/80 border border-[#2C2C36] rounded-xl px-4 py-2.5 text-center min-w-[100px]">
                <span className="text-[10px] uppercase font-semibold text-[#8E8E93] block">Cluster Avg Temp</span>
                <span className="text-lg font-bold text-emerald-400">
                  {activeGreenhouse?.summary?.avgTemperature !== null && activeGreenhouse?.summary?.avgTemperature !== undefined
                    ? `${activeGreenhouse.summary.avgTemperature}°C`
                    : "--"}
                </span>
              </div>
              <div className="bg-[#1C1C22]/80 border border-[#2C2C36] rounded-xl px-4 py-2.5 text-center min-w-[100px]">
                <span className="text-[10px] uppercase font-semibold text-[#8E8E93] block">Cluster Avg Hum</span>
                <span className="text-lg font-bold text-cyan-400">
                  {activeGreenhouse?.summary?.avgHumidity !== null && activeGreenhouse?.summary?.avgHumidity !== undefined
                    ? `${activeGreenhouse.summary.avgHumidity}%`
                    : "--"}
                </span>
              </div>
              <div className="bg-[#1C1C22]/80 border border-[#2C2C36] rounded-xl px-4 py-2.5 text-center min-w-[100px]">
                <span className="text-[10px] uppercase font-semibold text-[#8E8E93] block">Cluster Soil</span>
                <span className="text-lg font-bold text-purple-400">
                  {activeGreenhouse?.summary?.avgSoilMoisture !== null && activeGreenhouse?.summary?.avgSoilMoisture !== undefined
                    ? `${activeGreenhouse.summary.avgSoilMoisture}%`
                    : "--"}
                </span>
              </div>
              <div className="bg-[#1C1C22]/80 border border-[#2C2C36] rounded-xl px-4 py-2.5 text-center min-w-[100px]">
                <span className="text-[10px] uppercase font-semibold text-[#8E8E93] block">Active ESPs</span>
                <span className="text-lg font-bold text-teal-400">
                  {greenhouseDevices.filter((d) => d.isOnline).length} / {greenhouseDevices.length} Online
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* MULTI-ESP GRID: DISPLAYING ALL SENSOR MODULES BELONGING TO THIS GREENHOUSE */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white tracking-tight flex items-center space-x-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <span>Connected Sensor Modules in {activeGreenhouse?.name}</span>
              </h3>
              <p className="text-xs text-[#8E8E93]">
                Telemetry is strictly separated by greenhouse. Select any module to view detailed sensor history.
              </p>
            </div>
            <button
              onClick={() => {
                setNewDeviceGreenhouseId(activeGreenhouseId);
                setShowRegisterModal(true);
              }}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Connect Another Sensor Module to this Greenhouse</span>
            </button>
          </div>

          {greenhouseDevices.length === 0 ? (
            <div className="bg-[#141417] border border-[#282830] rounded-2xl p-12 text-center">
              <Cpu className="w-12 h-12 text-[#3E3E48] mx-auto mb-3" />
              <h4 className="text-sm font-semibold text-white">No Sensor Modules Connected Yet</h4>
              <p className="text-xs text-[#8E8E93] max-w-md mx-auto mt-1 mb-4">
                To prevent unseparated telemetry mix-ups, you must register the sensor modules with their unique UUID before sending data to this greenhouse.
              </p>
              <button
                onClick={() => {
                  setNewDeviceGreenhouseId(activeGreenhouseId);
                  setShowRegisterModal(true);
                }}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-xs font-medium shadow-md shadow-emerald-500/20 transition inline-flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Register First Sensor Module for {activeGreenhouse?.name}</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {greenhouseDevices.map((dev) => {
                const isFocused = dev.deviceId === focusedDeviceId;
                const r = dev.latestReading;

                return (
                  <div
                    key={dev.deviceId}
                    onClick={() => {
                      setFocusedDeviceId(dev.deviceId);
                      loadFocusedNodeData(dev.deviceId);
                    }}
                    className={`bg-[#141417] border rounded-2xl p-5 cursor-pointer transition relative group ${
                      isFocused
                        ? "border-emerald-500/80 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/30"
                        : "border-[#282830] hover:border-[#3E3E48]"
                    }`}
                  >
                    {/* Node Header */}
                    <div className="flex items-start justify-between mb-3.5">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-semibold text-white group-hover:text-emerald-400 transition">
                            {dev.name}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-wider bg-[#202028] text-[#A1A1A6]">
                            {dev.sensorType || "ESP"}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#8E8E93] mt-0.5 font-mono truncate max-w-[200px]">
                          UUID: {dev.deviceId.slice(0, 18)}...
                        </div>
                        <div className="text-[11px] text-[#A1A1A6] mt-0.5">
                          Zone: <strong className="text-white">{dev.location || "Main Bed"}</strong>
                        </div>
                      </div>

                      {/* Online Status Pill */}
                      <div
                        className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
                          dev.isOnline
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${dev.isOnline ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
                        <span>{dev.isOnline ? "Online" : "Offline"}</span>
                      </div>
                    </div>

                    {/* Sensor Metrics Matrix */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#202026]">
                      <div className="bg-[#18181D] rounded-lg p-2 text-center">
                        <span className="text-[10px] text-[#8E8E93] block">Temp</span>
                        <span className="text-xs font-bold text-emerald-400">
                          {r?.temperature !== undefined ? `${r.temperature.toFixed(1)}°C` : "--"}
                        </span>
                      </div>
                      <div className="bg-[#18181D] rounded-lg p-2 text-center">
                        <span className="text-[10px] text-[#8E8E93] block">Humidity</span>
                        <span className="text-xs font-bold text-cyan-400">
                          {r?.humidity !== undefined ? `${r.humidity.toFixed(1)}%` : "--"}
                        </span>
                      </div>
                      <div className="bg-[#18181D] rounded-lg p-2 text-center">
                        <span className="text-[10px] text-[#8E8E93] block">Soil</span>
                        <span className="text-xs font-bold text-purple-400">
                          {r?.soilMoisture !== undefined ? `${r.soilMoisture.toFixed(1)}%` : "--"}
                        </span>
                      </div>
                      <div className="bg-[#18181D] rounded-lg p-2 text-center">
                        <span className="text-[10px] text-[#8E8E93] block">Light</span>
                        <span className="text-xs font-bold text-amber-400">
                          {r?.light !== undefined ? `${r.light.toFixed(0)} lx` : "--"}
                        </span>
                      </div>
                    </div>

                    {/* Footer with Last Seen & Wi-Fi */}
                    <div className="mt-3.5 flex items-center justify-between text-[11px] text-[#6E6E73] pt-2 border-t border-[#1C1C22]">
                      <span className="flex items-center space-x-1">
                        <Wifi className="w-3 h-3 text-cyan-400" />
                        <span>{r?.wifiSsid || dev.wifiSsid || "Wi-Fi Connected"}</span>
                      </span>
                      <span>
                        {dev.lastSeen ? `Seen ${new Date(dev.lastSeen).toLocaleTimeString()}` : "Pending Sync"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* FOCUSED ESP METRIC CARDS & REAL-TIME TIMELINE */}
        {focusedDevice && (
          <div className="space-y-6 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white tracking-tight flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>Telemetry Inspector: {focusedDevice.name}</span>
                </h3>
                <p className="text-xs text-[#8E8E93]">
                  Registered ESP UUID: <code className="text-emerald-400 font-mono">{focusedDevice.deviceId}</code>
                </p>
              </div>
              <button
                onClick={() => handleCopyUuid(focusedDevice.deviceId)}
                className="px-2.5 py-1 bg-[#1C1C20] hover:bg-[#282830] text-xs font-medium rounded-lg border border-[#282830] transition flex items-center space-x-1.5 text-[#A1A1A6] hover:text-white"
              >
                {copiedUuid ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUuid ? "Copied!" : "Copy Node UUID"}</span>
              </button>
            </div>

            {/* Metric Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              {/* 1. Ambient Temperature */}
              <div className="bg-[#141417] border border-[#282830] rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-[#8E8E93] text-xs font-medium mb-2.5">
                  <span>Ambient Temp</span>
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Thermometer className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-2xl font-semibold text-white tracking-tight">
                    {focusedLatestReading ? focusedLatestReading.temperature.toFixed(1) : "--"}
                  </span>
                  <span className="text-xs font-medium text-[#8E8E93]">°C</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-[#8E8E93]">
                  <span>
                    {focusedLatestReading ? `${((focusedLatestReading.temperature * 9) / 5 + 32).toFixed(1)} °F` : "--"}
                  </span>
                  <span className="text-emerald-400 font-medium">DHT22 Digital</span>
                </div>
              </div>

              {/* 2. Relative Humidity */}
              <div className="bg-[#141417] border border-[#282830] rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-[#8E8E93] text-xs font-medium mb-2.5">
                  <span>Rel. Humidity</span>
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                    <Droplets className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-2xl font-semibold text-white tracking-tight">
                    {focusedLatestReading ? focusedLatestReading.humidity.toFixed(1) : "--"}
                  </span>
                  <span className="text-xs font-medium text-[#8E8E93]">% RH</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-[#8E8E93]">
                  <span>Optimal: 40-70%</span>
                  <span className="text-cyan-400 font-medium">Single-Wire</span>
                </div>
              </div>

              {/* 3. Soil Moisture */}
              <div className="bg-[#141417] border border-[#282830] rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-[#8E8E93] text-xs font-medium mb-2.5">
                  <span>Soil Moisture</span>
                  <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                    <Sprout className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-2xl font-semibold text-white tracking-tight">
                    {focusedLatestReading ? focusedLatestReading.soilMoisture.toFixed(1) : "--"}
                  </span>
                  <span className="text-xs font-medium text-[#8E8E93]">%</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-[#8E8E93]">
                  <span>Gated ADC Sensor</span>
                  <span className="text-purple-400 font-medium">{focusedDevice.sensorType?.toUpperCase() || "PROBE"}</span>
                </div>
              </div>

              {/* 4. Illuminance / Lux */}
              <div className="bg-[#141417] border border-[#282830] rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-[#8E8E93] text-xs font-medium mb-2.5">
                  <span>Illuminance (Lux)</span>
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                    <Sun className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-2xl font-semibold text-white tracking-tight">
                    {focusedLatestReading ? focusedLatestReading.light.toFixed(0) : "--"}
                  </span>
                  <span className="text-xs font-medium text-[#8E8E93]">lx</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-[#8E8E93]">
                  <span>BH1750 I2C Optical</span>
                  <span className="text-amber-400 font-medium">Ambient Lux</span>
                </div>
              </div>

              {/* 5. ESP32 Silicon Die Temp */}
              <div className="bg-[#141417] border border-[#282830] rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-[#8E8E93] text-xs font-medium mb-2.5">
                  <span>ESP32 SoC Temp</span>
                  <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400">
                    <Cpu className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-2xl font-semibold text-white tracking-tight">
                    {focusedLatestReading?.espTemperature !== undefined ? focusedLatestReading.espTemperature.toFixed(1) : "--"}
                  </span>
                  <span className="text-xs font-medium text-[#8E8E93]">°C</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-[#8E8E93]">
                  <span>Silicon Core Temp</span>
                  <span className="text-orange-400 font-medium">Internal ADC</span>
                </div>
              </div>
            </div>

            {/* Real-Time Chart Section */}
            <div className="bg-[#141417] border border-[#282830] rounded-2xl p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-base font-medium text-white tracking-tight">
                    Real-Time Environmental Dynamics: {focusedDevice.name}
                  </h2>
                  <p className="text-xs text-[#8E8E93] mt-0.5">
                    Isolated to {activeGreenhouse?.name} ({activeGreenhouse?.companyLocation})
                  </p>
                </div>
                <div className="flex items-center space-x-2 text-xs text-[#8E8E93]">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Telemetry Guard Active</span>
                </div>
              </div>

              <div className="h-[280px] w-full">
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>
          </div>
        )}

        {/* Live Feed Table & Logs Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Live Ingestion Feed */}
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-white flex items-center space-x-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Live Feed ({activeGreenhouse?.name})</span>
              </h3>
              <span className="text-[11px] text-[#8E8E93]">
                {recentReadings.length} Ingested Packets
              </span>
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#24242A] text-[#8E8E93]">
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Wi-Fi</th>
                    <th className="py-2.5 px-3">Temp</th>
                    <th className="py-2.5 px-3">Humidity</th>
                    <th className="py-2.5 px-3">Soil</th>
                    <th className="py-2.5 px-3">Lux</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#202026]">
                  {recentReadings.slice(0, 7).map((r, i) => (
                    <tr key={i} className="hover:bg-[#1A1A20] transition">
                      <td className="py-2.5 px-3 text-[#A1A1A6] whitespace-nowrap">
                        {new Date(r.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 text-cyan-300 font-mono text-[11px]">
                        {r.wifiSsid || "--"}
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
                      <td colSpan={6} className="py-8 text-center text-[#6E6E73]">
                        No telemetry packets for this greenhouse yet. Click "Simulate" to test.
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
                <span>Cluster Activity & Registration Logs</span>
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
                    <th className="py-2.5 px-3">Event</th>
                    <th className="py-2.5 px-3">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#202026]">
                  {logs.slice(0, 7).map((log, i) => (
                    <tr key={i} className="hover:bg-[#1A1A20] transition">
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            log.level === "warn" || log.severity === "warning"
                              ? "bg-amber-500/10 text-amber-400"
                              : log.level === "error" || log.severity === "error"
                              ? "bg-rose-500/10 text-rose-400"
                              : "bg-emerald-500/10 text-emerald-400"
                          }`}
                        >
                          {log.level || log.severity || "info"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[#A1A1A6] truncate max-w-[220px]" title={log.message}>
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
        Green Node IoT Monitoring Hub • Multi-Greenhouse ESP32-C3 SuperMini Cluster Architecture
      </footer>

      {/* PROVISIONING SUCCESS & FIRMWARE CODE MODAL */}
      {showProvisionedSuccess && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141417] border border-emerald-500/50 rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center space-x-2 text-emerald-400 mb-2">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="text-base font-semibold text-white">Sensor Module Successfully Registered!</h3>
            </div>
            <p className="text-xs text-[#8E8E93] mb-4">
              This sensor module has been registered to <strong className="text-white">{showProvisionedSuccess.greenhouseName}</strong> at <strong className="text-white">{showProvisionedSuccess.companyLocation}</strong>. Save this unique UUID into the ESP firmware so its telemetry is recognized.
            </p>

            <div className="bg-[#1C1C22] border border-[#282830] rounded-xl p-3 mb-4">
              <span className="text-[10px] uppercase font-semibold text-[#8E8E93] block mb-1">Registered Device UUID</span>
              <div className="flex items-center justify-between">
                <code className="text-xs font-mono text-emerald-400 break-all select-all">
                  {showProvisionedSuccess.deviceId}
                </code>
                <button
                  onClick={() => handleCopyUuid(showProvisionedSuccess.deviceId)}
                  className="ml-2 px-2.5 py-1 bg-[#282830] hover:bg-[#343440] text-xs font-medium rounded-lg text-white shrink-0 flex items-center space-x-1"
                >
                  {copiedUuid ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUuid ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            <div className="space-y-2 mb-5">
              <span className="text-xs font-semibold text-[#A1A1A6] block">Option 1: Arduino Firmware Code (Paste in .ino)</span>
              <div className="bg-[#0A0A0C] border border-[#24242A] rounded-xl p-3 font-mono text-[11px] text-teal-300 select-all overflow-x-auto">
                const char* DEVICE_ID = &quot;{showProvisionedSuccess.deviceId}&quot;;
              </div>

              <span className="text-xs font-semibold text-[#A1A1A6] block pt-1">Option 2: Dynamic NVS Serial Command</span>
              <div className="bg-[#0A0A0C] border border-[#24242A] rounded-xl p-3 font-mono text-[11px] text-purple-300 select-all overflow-x-auto">
                SET_UUID {showProvisionedSuccess.deviceId}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowProvisionedSuccess(null)}
                className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-xl text-xs font-medium shadow-md shadow-emerald-500/20 transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REGISTER SENSOR MODULE MODAL */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-1">Register Sensor Module</h3>
            <p className="text-xs text-[#8E8E93] mb-4">
              Pre-register this sensor module so its telemetry is linked to a Greenhouse and not mixed with other nodes.
            </p>

            <form onSubmit={handleRegisterDevice} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                  Assign to Greenhouse *
                </label>
                <select
                  value={newDeviceGreenhouseId}
                  onChange={(e) => setNewDeviceGreenhouseId(e.target.value)}
                  className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/60"
                  required
                >
                  {greenhouses.map((g) => (
                    <option key={g.greenhouseId} value={g.greenhouseId}>
                      {g.name} ({g.companyLocation})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                  Sensor Module Friendly Name *
                </label>
                <input
                  type="text"
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  placeholder="e.g. Bed A Sensor Module"
                  required
                  className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white placeholder-[#5A5A60] focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                    Sensor Module
                  </label>
                  <select
                    value={newDeviceSensorType}
                    onChange={(e) => setNewDeviceSensorType(e.target.value)}
                    className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/60"
                  >
                    <option value="fc28">All Modules + FC-28 Soil Moisture</option>
                    <option value="md0869">All Modules + MD0869 Soil Moisture</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                    Zone / Bed Location
                  </label>
                  <input
                    type="text"
                    value={newDeviceLocation}
                    onChange={(e) => setNewDeviceLocation(e.target.value)}
                    placeholder="e.g. Zone 1 - Canopy"
                    className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white placeholder-[#5A5A60] focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                  Device UUID (Optional - Auto-generated if left blank)
                </label>
                <input
                  type="text"
                  value={newDeviceId}
                  onChange={(e) => setNewDeviceId(e.target.value)}
                  placeholder="Leave empty to generate a new UUID"
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
                  {isRegistering ? "Registering..." : "Register Sensor Module"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE GREENHOUSE MODAL */}
      {showNewGreenhouseModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-1">Create New Greenhouse</h3>
            <p className="text-xs text-[#8E8E93] mb-4">
              Add a greenhouse to organize and group your ESP sensor nodes.
            </p>

            <form onSubmit={handleCreateGreenhouse} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                  Company Location / Facility *
                </label>
                <input
                  type="text"
                  value={newGhCompany}
                  onChange={(e) => setNewGhCompany(e.target.value)}
                  placeholder="e.g. Colombo Agri Facility or Nuwara Eliya Farm"
                  required
                  className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white placeholder-[#5A5A60] focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                  Greenhouse Name *
                </label>
                <input
                  type="text"
                  value={newGhName}
                  onChange={(e) => setNewGhName(e.target.value)}
                  placeholder="e.g. Greenhouse 02 - Nursery Bay"
                  required
                  className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white placeholder-[#5A5A60] focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={newGhDescription}
                  onChange={(e) => setNewGhDescription(e.target.value)}
                  placeholder="e.g. Microgreens and nursery seedling propagation"
                  className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white placeholder-[#5A5A60] focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewGreenhouseModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#8E8E93] hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingGh}
                  className="px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-lg text-xs font-medium shadow-md shadow-emerald-500/20 transition disabled:opacity-50"
                >
                  {isCreatingGh ? "Creating..." : "Create Greenhouse"}
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
                  placeholder="https://blue-circle.onrender.com or http://localhost:4000"
                  required
                  className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white placeholder-[#5A5A60] font-mono focus:outline-none focus:border-emerald-500/60"
                />
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
