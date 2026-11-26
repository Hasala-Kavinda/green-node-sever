"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  fetchGreenhouseOverview,
  fetchReadings,
  getWebSocketUrl,
  Greenhouse,
  Device,
  Reading,
} from "@/lib/api";
import {
  Settings,
  ShieldCheck,
  Sprout,
  ArrowLeft,
  Thermometer,
  Droplets,
  Sun,
  Activity,
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
  ScriptableContext,
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

function makeAreaGradient(rgb: string, topAlpha = 0.28) {
  return (context: ScriptableContext<"line">) => {
    const chart = context.chart;
    const { ctx, chartArea } = chart;
    if (!chartArea) {
      return `rgba(${rgb}, ${topAlpha * 0.4})`;
    }
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, `rgba(${rgb}, ${topAlpha})`);
    gradient.addColorStop(0.75, `rgba(${rgb}, ${topAlpha * 0.25})`);
    gradient.addColorStop(1, `rgba(${rgb}, 0)`);
    return gradient;
  };
}

function calcStats(values: number[]) {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return { min, max, avg };
}

export default function GreenhouseAnalyticsDetailPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const greenhouseId = decodeURIComponent(params?.id || "");

  const [activeGreenhouse, setActiveGreenhouse] = useState<Greenhouse | null>(null);
  const [greenhouseDevices, setGreenhouseDevices] = useState<Device[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string>("all");
  const [windowSize, setWindowSize] = useState<15 | 30 | 60>(30);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);

  const socketRef = useRef<WebSocket | null>(null);
  const ghDevicesRef = useRef<Device[]>([]);

  useEffect(() => {
    ghDevicesRef.current = greenhouseDevices;
  }, [greenhouseDevices]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  const loadData = useCallback(async () => {
    if (!greenhouseId) return;
    try {
      const [overview, ghReadings] = await Promise.all([
        fetchGreenhouseOverview(greenhouseId),
        fetchReadings({
          greenhouseId,
          limit: 60,
          sortBy: "timestamp",
          sortOrder: "desc",
        }),
      ]);

      if (overview) {
        setActiveGreenhouse(overview);
        const devs = overview.devices || [];
        setGreenhouseDevices(devs);
        if (typeof window !== "undefined") {
          localStorage.setItem("green_node_active_greenhouse", greenhouseId);
          localStorage.setItem("green_node_cached_greenhouse", JSON.stringify(overview));
          localStorage.setItem("green_node_cached_gh_devices", JSON.stringify(devs));
        }
      }

      if (ghReadings && ghReadings.length > 0) {
        setReadings(ghReadings);
      }
    } catch {
      // ignore transient errors
    } finally {
      setLoadingOverview(false);
    }
  }, [greenhouseId]);

  useEffect(() => {
    if (!isAuthenticated || !greenhouseId) return;

    loadData();
    const pollTimer = setInterval(loadData, 15000);

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(getWebSocketUrl());
      socketRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === "new_reading" && msg.data) {
            const incoming: Reading = msg.data;
            const belongsToGh =
              incoming.greenhouseId?.toLowerCase() === greenhouseId.toLowerCase() ||
              ghDevicesRef.current.some((d) => d.deviceId === incoming.deviceId);

            if (!belongsToGh) return;

            setReadings((prev) => [incoming, ...prev].slice(0, 60));

            setGreenhouseDevices((prev) => {
              const idx = prev.findIndex((d) => d.deviceId === incoming.deviceId);
              if (idx === -1) return prev;

              const updated = prev.map((d) =>
                d.deviceId === incoming.deviceId
                  ? {
                      ...d,
                      isOnline: true,
                      status: "online" as const,
                      latestReading: {
                        temperature: incoming.temperature,
                        humidity: incoming.humidity,
                        soilMoisture: incoming.soilMoisture,
                        light: incoming.light,
                        espTemperature: incoming.espTemperature,
                        wifiSsid: incoming.wifiSsid,
                        timestamp: incoming.timestamp,
                      },
                    }
                  : d
              );

              const withReadings = updated.filter((d) => d.latestReading);
              if (withReadings.length > 0) {
                const round = (v: number) => Math.round(v * 10) / 10;
                const avgTemp = round(
                  withReadings.reduce((s, d) => s + (d.latestReading?.temperature ?? 0), 0) /
                    withReadings.length
                );
                const avgHum = round(
                  withReadings.reduce((s, d) => s + (d.latestReading?.humidity ?? 0), 0) /
                    withReadings.length
                );
                const avgSoil = round(
                  withReadings.reduce((s, d) => s + (d.latestReading?.soilMoisture ?? 0), 0) /
                    withReadings.length
                );
                setActiveGreenhouse((gh) =>
                  gh
                    ? {
                        ...gh,
                        summary: {
                          ...gh.summary,
                          avgTemperature: avgTemp,
                          avgHumidity: avgHum,
                          avgSoilMoisture: avgSoil,
                          avgLight: gh.summary?.avgLight ?? null,
                        },
                      }
                    : gh
                );
              }
              return updated;
            });
          } else if (
            msg.event === "device_heartbeat" ||
            msg.event === "device_registered" ||
            msg.event === "device_deleted" ||
            msg.event === "device_unregistered"
          ) {
            loadData();
          }
        } catch {
          // ignore malformed WS frames
        }
      };
    } catch {
      // ignore WS init failure
    }

    return () => {
      clearInterval(pollTimer);
      if (ws) ws.close();
    };
  }, [isAuthenticated, greenhouseId, loadData]);

  // Filter readings by selected module & window size, ordered chronologically
  const filteredReadings = useMemo(() => {
    const list =
      selectedModuleId === "all"
        ? readings
        : readings.filter((r) => r.deviceId === selectedModuleId);
    return list.slice(0, windowSize).reverse();
  }, [readings, selectedModuleId, windowSize]);

  const chartLabels = useMemo(() => {
    if (filteredReadings.length === 0) return ["00:00", "00:05", "00:10", "00:15"];
    return filteredReadings.map((r) => {
      const d = new Date(r.timestamp);
      return `${d.getHours().toString().padStart(2, "0")}:${d
        .getMinutes()
        .toString()
        .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
    });
  }, [filteredReadings]);

  const combinedChartData = useMemo(
    () => ({
      labels: chartLabels,
      datasets: [
        {
          label: "Temperature (°C)",
          data: filteredReadings.map((r) => r.temperature),
          borderColor: "#10B981",
          backgroundColor: makeAreaGradient("16, 185, 129", 0.22),
          fill: true,
          tension: 0.42,
          cubicInterpolationMode: "monotone" as const,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: "#0A0A0C",
          pointHoverBorderColor: "#10B981",
          pointHoverBorderWidth: 2.5,
        },
        {
          label: "Humidity (% RH)",
          data: filteredReadings.map((r) => r.humidity),
          borderColor: "#06B6D4",
          backgroundColor: makeAreaGradient("6, 182, 212", 0.14),
          fill: true,
          tension: 0.42,
          cubicInterpolationMode: "monotone" as const,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: "#0A0A0C",
          pointHoverBorderColor: "#06B6D4",
          pointHoverBorderWidth: 2.5,
        },
        {
          label: "Soil Moisture (%)",
          data: filteredReadings.map((r) => r.soilMoisture),
          borderColor: "#8B5CF6",
          backgroundColor: makeAreaGradient("139, 92, 246", 0.14),
          fill: true,
          tension: 0.42,
          cubicInterpolationMode: "monotone" as const,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: "#0A0A0C",
          pointHoverBorderColor: "#8B5CF6",
          pointHoverBorderWidth: 2.5,
        },
        {
          label: "Light Intensity (lx)",
          data: filteredReadings.map((r) => r.light),
          borderColor: "#F59E0B",
          backgroundColor: makeAreaGradient("245, 158, 11", 0.14),
          fill: true,
          tension: 0.42,
          cubicInterpolationMode: "monotone" as const,
          borderWidth: 2.5,
          yAxisID: "y1",
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: "#0A0A0C",
          pointHoverBorderColor: "#F59E0B",
          pointHoverBorderWidth: 2.5,
        },
        {
          label: "ESP32 SoC Temp (°C)",
          data: filteredReadings.map((r) => r.espTemperature ?? null),
          borderColor: "#F97316",
          backgroundColor: "transparent",
          tension: 0.42,
          cubicInterpolationMode: "monotone" as const,
          borderWidth: 2,
          borderDash: [5, 4],
          yAxisID: "y",
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: "#0A0A0C",
          pointHoverBorderColor: "#F97316",
          pointHoverBorderWidth: 2,
        },
      ],
    }),
    [chartLabels, filteredReadings]
  );

  const makeSingleChartData = (
    label: string,
    values: (number | null)[],
    borderColor: string,
    rgb: string
  ) => ({
    labels: chartLabels,
    datasets: [
      {
        label,
        data: values,
        borderColor,
        backgroundColor: makeAreaGradient(rgb, 0.28),
        fill: true,
        tension: 0.42,
        cubicInterpolationMode: "monotone" as const,
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: "#0A0A0C",
        pointHoverBorderColor: borderColor,
        pointHoverBorderWidth: 2.5,
      },
    ],
  });

  const baseChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 450,
      easing: "easeOutQuart",
    },
    transitions: {
      active: {
        animation: {
          duration: 150,
        },
      },
    },
    interaction: {
      mode: "index",
      intersect: false,
    },
    plugins: {
      legend: {
        position: "top",
        align: "end",
        labels: {
          color: "#C7C7CC",
          font: { size: 13, weight: "500" },
          padding: 18,
          usePointStyle: true,
          pointStyle: "circle",
          boxWidth: 8,
          boxHeight: 8,
        },
      },
      tooltip: {
        enabled: true,
        backgroundColor: "rgba(20, 20, 24, 0.94)",
        titleColor: "#FFFFFF",
        bodyColor: "#E5E5EA",
        borderColor: "rgba(255, 255, 255, 0.12)",
        borderWidth: 1,
        cornerRadius: 12,
        padding: 12,
        titleFont: { size: 13, weight: "600" },
        bodyFont: { size: 13 },
        boxPadding: 6,
        usePointStyle: true,
      },
    },
    scales: {
      x: {
        border: { display: false },
        grid: { color: "rgba(255, 255, 255, 0.04)" },
        ticks: {
          color: "#8E8E93",
          font: { size: 12 },
          padding: 8,
          maxTicksLimit: 8,
        },
      },
      y: {
        type: "linear",
        position: "left",
        border: { display: false },
        grid: { color: "rgba(255, 255, 255, 0.05)" },
        ticks: {
          color: "#8E8E93",
          font: { size: 12 },
          padding: 10,
        },
      },
      y1: {
        type: "linear",
        position: "right",
        border: { display: false },
        grid: { drawOnChartArea: false },
        ticks: {
          color: "#F59E0B",
          font: { size: 12 },
          padding: 10,
        },
      },
    },
  };

  const singleChartOptions: any = {
    ...baseChartOptions,
    plugins: {
      ...baseChartOptions.plugins,
      legend: { display: false },
    },
    scales: {
      x: baseChartOptions.scales.x,
      y: {
        border: { display: false },
        grid: { color: "rgba(255, 255, 255, 0.05)" },
        ticks: {
          color: "#8E8E93",
          font: { size: 12 },
          padding: 10,
        },
      },
    },
  };

  const tempStats = useMemo(
    () => calcStats(filteredReadings.map((r) => r.temperature)),
    [filteredReadings]
  );
  const humStats = useMemo(
    () => calcStats(filteredReadings.map((r) => r.humidity)),
    [filteredReadings]
  );
  const soilStats = useMemo(
    () => calcStats(filteredReadings.map((r) => r.soilMoisture)),
    [filteredReadings]
  );
  const lightStats = useMemo(
    () => calcStats(filteredReadings.map((r) => r.light)),
    [filteredReadings]
  );

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex flex-col font-sans">
      {/* Top Glass Navbar */}
      <header className="sticky top-0 z-30 px-4 sm:px-6 pt-3 pb-1 pointer-events-none">
        <div className="pointer-events-auto max-w-7xl mx-auto rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] bg-[#0E0E12]/65 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-white/[0.06] px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-white">
              Green Node
            </h1>

            <nav className="flex items-center gap-7">
              <Link
                href="/"
                className="group relative py-1.5 text-sm font-medium text-[#8E8E93] hover:text-white transition-colors"
              >
                <span>Modules</span>
                <span className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-white/30 scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left" />
              </Link>
              <Link
                href="/analytics"
                className="group relative py-1.5 text-sm font-bold text-white transition-colors"
              >
                <span>Analytics</span>
                <span className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 shadow-[0_0_12px_rgba(52,211,153,0.75)]" />
              </Link>
              <Link
                href="/registers"
                className="group relative py-1.5 text-sm font-medium text-[#8E8E93] hover:text-white transition-colors"
              >
                <span>New Registers</span>
                <span className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-white/30 scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left" />
              </Link>
            </nav>

            <Link
              href="/settings"
              title="Settings & Controls"
              className="p-2 text-[#A1A1A6] hover:text-white rounded-xl hover:bg-white/[0.06] transition flex items-center justify-center"
            >
              <Settings className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 space-y-6">
        <div>
          <Link
            href="/analytics"
            className="inline-flex items-center space-x-2 text-sm font-medium text-[#A1A1A6] hover:text-emerald-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Greenhouses</span>
          </Link>
        </div>

        {/* GREENHOUSE SUMMARY BANNER WITH COMPANY, LOCATION & PLANT */}
        {loadingOverview && !activeGreenhouse ? (
          <div className="h-36 rounded-2xl bg-[#141417] border border-[#282830] animate-pulse" />
        ) : (
          <div className="bg-gradient-to-r from-[#141417] via-[#16161B] to-[#121215] border border-[#282830] rounded-2xl p-6 sm:p-7 shadow-xl relative overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-6 relative z-10">
              <div>
                <div className="flex items-center space-x-2 text-sm font-semibold uppercase tracking-wider text-emerald-400 mb-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {activeGreenhouse?.companyName || "Company"} •{" "}
                    {activeGreenhouse?.companyLocation || "Facility"}
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex flex-wrap items-center gap-3">
                  <span>{activeGreenhouse?.name || greenhouseId}</span>
                  <span className="text-sm font-medium px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1.5">
                    <Sprout className="w-4 h-4 text-emerald-400" />
                    <span>Crop: {activeGreenhouse?.plant || "Vegetables"}</span>
                  </span>
                  <span className="text-sm font-medium px-3 py-1 rounded-full bg-[#202028] text-[#C7C7CC] border border-[#303038]">
                    {activeGreenhouse?.assignedDeviceIds?.length || greenhouseDevices.length} Modules
                  </span>
                </h2>
                <p className="text-sm text-[#8E8E93] mt-2 max-w-xl">
                  Operating under Company ID:{" "}
                  <code className="text-[#C7C7CC] font-mono">
                    {activeGreenhouse?.companyId || "comp"}
                  </code>
                  {activeGreenhouse?.description ? ` • ${activeGreenhouse.description}` : ""}
                </p>
              </div>

              {/* Greenhouse Overview Stats */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="bg-[#1C1C22]/80 border border-[#2C2C36] rounded-xl px-5 py-3 text-center min-w-[120px]">
                  <span className="text-xs uppercase font-semibold text-[#8E8E93] block mb-0.5">
                    Cluster Avg Temp
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-emerald-400 tabular-nums">
                    {activeGreenhouse?.summary?.avgTemperature !== null &&
                    activeGreenhouse?.summary?.avgTemperature !== undefined
                      ? `${activeGreenhouse.summary.avgTemperature}°C`
                      : "--"}
                  </span>
                </div>
                <div className="bg-[#1C1C22]/80 border border-[#2C2C36] rounded-xl px-5 py-3 text-center min-w-[120px]">
                  <span className="text-xs uppercase font-semibold text-[#8E8E93] block mb-0.5">
                    Cluster Avg Hum
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-cyan-400 tabular-nums">
                    {activeGreenhouse?.summary?.avgHumidity !== null &&
                    activeGreenhouse?.summary?.avgHumidity !== undefined
                      ? `${activeGreenhouse.summary.avgHumidity}%`
                      : "--"}
                  </span>
                </div>
                <div className="bg-[#1C1C22]/80 border border-[#2C2C36] rounded-xl px-5 py-3 text-center min-w-[120px]">
                  <span className="text-xs uppercase font-semibold text-[#8E8E93] block mb-0.5">
                    Cluster Soil
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-purple-400 tabular-nums">
                    {activeGreenhouse?.summary?.avgSoilMoisture !== null &&
                    activeGreenhouse?.summary?.avgSoilMoisture !== undefined
                      ? `${activeGreenhouse.summary.avgSoilMoisture}%`
                      : "--"}
                  </span>
                </div>
                <div className="bg-[#1C1C22]/80 border border-[#2C2C36] rounded-xl px-5 py-3 text-center min-w-[130px]">
                  <span className="text-xs uppercase font-semibold text-[#8E8E93] block mb-0.5">
                    Active Modules
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-teal-400 tabular-nums">
                    {greenhouseDevices.filter((d) => d.isOnline).length} / {greenhouseDevices.length} Online
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Controls Bar: Module Filter & Data Window */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {greenhouseDevices.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 bg-[#141417] border border-[#282830] rounded-xl p-1 text-sm">
              <button
                type="button"
                onClick={() => setSelectedModuleId("all")}
                className={`px-3.5 py-1.5 rounded-lg font-medium transition ${
                  selectedModuleId === "all"
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "text-[#A1A1A6] hover:text-white"
                }`}
              >
                All Modules ({greenhouseDevices.length})
              </button>
              {greenhouseDevices.map((dev) => (
                <button
                  key={dev.deviceId}
                  type="button"
                  onClick={() => setSelectedModuleId(dev.deviceId)}
                  className={`px-3.5 py-1.5 rounded-lg font-medium transition ${
                    selectedModuleId === dev.deviceId
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "text-[#A1A1A6] hover:text-white"
                  }`}
                >
                  {dev.name}
                </button>
              ))}
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-[#141417] border border-[#282830] rounded-xl p-1 text-sm">
              {([15, 30, 60] as const).map((pts) => (
                <button
                  key={pts}
                  type="button"
                  onClick={() => setWindowSize(pts)}
                  className={`px-3 py-1 rounded-lg font-medium transition ${
                    windowSize === pts
                      ? "bg-[#282832] text-white shadow-sm"
                      : "text-[#8E8E93] hover:text-white"
                  }`}
                >
                  {pts} pts
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-2 text-sm text-[#A1A1A6]">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="tabular-nums">{filteredReadings.length} Live Points</span>
            </div>
          </div>
        </div>

        {/* Combined Environmental Dynamics Graph */}
        <div className="bg-[#141417] border border-[#282830] hover:border-[#343440] transition-colors rounded-2xl p-6 sm:p-7 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="text-lg sm:text-xl font-semibold text-white tracking-tight flex items-center space-x-2.5">
                <Activity className="w-5 h-5 text-emerald-400" />
                <span>Real-Time Environmental Dynamics</span>
              </h3>
              <p className="text-sm text-[#8E8E93] mt-1">
                {activeGreenhouse?.name || greenhouseId} • Crop: {activeGreenhouse?.plant || "--"}
              </p>
            </div>
          </div>

          <div className="h-[340px] w-full">
            <Line data={combinedChartData} options={baseChartOptions} />
          </div>
        </div>

        {/* Individual Metric Graphs (2x2 Grid) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Temperature */}
          <div className="bg-[#141417] border border-[#282830] hover:border-emerald-500/35 transition-colors rounded-2xl p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                  <Thermometer className="w-5 h-5" />
                </div>
                <h4 className="text-base font-semibold text-white">Temperature (°C)</h4>
              </div>
              <span className="text-lg font-bold text-emerald-400 tabular-nums">
                {filteredReadings.length > 0
                  ? `${filteredReadings[filteredReadings.length - 1].temperature.toFixed(1)}°C`
                  : "--"}
              </span>
            </div>
            {tempStats && (
              <p className="text-xs text-[#8E8E93] mb-4 tabular-nums">
                Min {tempStats.min.toFixed(1)}°C · Avg {tempStats.avg.toFixed(1)}°C · Max{" "}
                {tempStats.max.toFixed(1)}°C
              </p>
            )}
            <div className="h-[240px] w-full">
              <Line
                data={makeSingleChartData(
                  "Temperature (°C)",
                  filteredReadings.map((r) => r.temperature),
                  "#10B981",
                  "16, 185, 129"
                )}
                options={singleChartOptions}
              />
            </div>
          </div>

          {/* Humidity */}
          <div className="bg-[#141417] border border-[#282830] hover:border-cyan-500/35 transition-colors rounded-2xl p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <Droplets className="w-5 h-5" />
                </div>
                <h4 className="text-base font-semibold text-white">Relative Humidity (% RH)</h4>
              </div>
              <span className="text-lg font-bold text-cyan-400 tabular-nums">
                {filteredReadings.length > 0
                  ? `${filteredReadings[filteredReadings.length - 1].humidity.toFixed(1)}%`
                  : "--"}
              </span>
            </div>
            {humStats && (
              <p className="text-xs text-[#8E8E93] mb-4 tabular-nums">
                Min {humStats.min.toFixed(1)}% · Avg {humStats.avg.toFixed(1)}% · Max{" "}
                {humStats.max.toFixed(1)}%
              </p>
            )}
            <div className="h-[240px] w-full">
              <Line
                data={makeSingleChartData(
                  "Humidity (%)",
                  filteredReadings.map((r) => r.humidity),
                  "#06B6D4",
                  "6, 182, 212"
                )}
                options={singleChartOptions}
              />
            </div>
          </div>

          {/* Soil Moisture */}
          <div className="bg-[#141417] border border-[#282830] hover:border-purple-500/35 transition-colors rounded-2xl p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                  <Sprout className="w-5 h-5" />
                </div>
                <h4 className="text-base font-semibold text-white">Soil Moisture (%)</h4>
              </div>
              <span className="text-lg font-bold text-purple-400 tabular-nums">
                {filteredReadings.length > 0
                  ? `${filteredReadings[filteredReadings.length - 1].soilMoisture.toFixed(1)}%`
                  : "--"}
              </span>
            </div>
            {soilStats && (
              <p className="text-xs text-[#8E8E93] mb-4 tabular-nums">
                Min {soilStats.min.toFixed(1)}% · Avg {soilStats.avg.toFixed(1)}% · Max{" "}
                {soilStats.max.toFixed(1)}%
              </p>
            )}
            <div className="h-[240px] w-full">
              <Line
                data={makeSingleChartData(
                  "Soil Moisture (%)",
                  filteredReadings.map((r) => r.soilMoisture),
                  "#8B5CF6",
                  "139, 92, 246"
                )}
                options={singleChartOptions}
              />
            </div>
          </div>

          {/* Light Intensity */}
          <div className="bg-[#141417] border border-[#282830] hover:border-amber-500/35 transition-colors rounded-2xl p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                  <Sun className="w-5 h-5" />
                </div>
                <h4 className="text-base font-semibold text-white">Light Intensity (lx)</h4>
              </div>
              <span className="text-lg font-bold text-amber-400 tabular-nums">
                {filteredReadings.length > 0
                  ? `${filteredReadings[filteredReadings.length - 1].light.toFixed(0)} lx`
                  : "--"}
              </span>
            </div>
            {lightStats && (
              <p className="text-xs text-[#8E8E93] mb-4 tabular-nums">
                Min {lightStats.min.toFixed(0)} lx · Avg {lightStats.avg.toFixed(0)} lx · Max{" "}
                {lightStats.max.toFixed(0)} lx
              </p>
            )}
            <div className="h-[240px] w-full">
              <Line
                data={makeSingleChartData(
                  "Light (lx)",
                  filteredReadings.map((r) => r.light),
                  "#F59E0B",
                  "245, 158, 11"
                )}
                options={singleChartOptions}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
