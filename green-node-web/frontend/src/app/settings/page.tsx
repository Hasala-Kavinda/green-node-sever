"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  fetchCompanies,
  fetchGreenhouses,
  fetchDevices,
  sendTestReading,
  pingKeepAlive,
  getWebSocketUrl,
  getBackendUrl,
  setBackendUrl,
  Company,
  Greenhouse,
  Device,
} from "@/lib/api";
import {
  Building2,
  Radio,
  Activity,
  Settings,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Server,
} from "lucide-react";

export default function SettingsPage() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [greenhouses, setGreenhouses] = useState<Greenhouse[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all");
  const [activeGreenhouseId, setActiveGreenhouseId] = useState<string>("");
  const [simDeviceId, setSimDeviceId] = useState<string>("");

  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [backendStatus, setBackendStatus] = useState<"connected" | "sleeping" | "checking">("checking");
  const [backendLatency, setBackendLatency] = useState<number | null>(null);
  const [apiUrlInput, setApiUrlInput] = useState<string>("");

  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const notify = (type: "success" | "error", text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  const loadData = async () => {
    try {
      const [comps, ghs, devs] = await Promise.all([fetchCompanies(), fetchGreenhouses(), fetchDevices()]);
      setCompanies(comps);
      setGreenhouses(ghs);
      setDevices(devs);

      const savedComp = typeof window !== "undefined" ? localStorage.getItem("green_node_selected_company") : null;
      if (savedComp) setSelectedCompanyId(savedComp);

      const savedGh = typeof window !== "undefined" ? localStorage.getItem("green_node_active_greenhouse") : null;
      const targetGh = savedGh && ghs.some((g) => g.greenhouseId === savedGh) ? savedGh : ghs[0]?.greenhouseId || "";
      setActiveGreenhouseId(targetGh);

      const savedDev = typeof window !== "undefined" ? localStorage.getItem("green_node_focused_device") : null;
      if (savedDev && devs.some((d) => d.deviceId === savedDev)) {
        setSimDeviceId(savedDev);
      } else if (devs.length > 0) {
        setSimDeviceId(devs[0].deviceId);
      }
    } catch {
      // ignore
    }
  };

  const checkHealth = async () => {
    const start = Date.now();
    try {
      setBackendStatus("checking");
      const data = await pingKeepAlive();
      if (data && (data.status === "awake" || data.status === "ok")) {
        setBackendLatency(Date.now() - start);
        setBackendStatus("connected");
      } else {
        setBackendStatus("sleeping");
      }
    } catch {
      setBackendStatus("sleeping");
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    setApiUrlInput(getBackendUrl());
    loadData();
    checkHealth();

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(getWebSocketUrl());
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => setWsConnected(false);
      ws.onerror = () => setWsConnected(false);
    } catch {
      setWsConnected(false);
    }

    return () => {
      if (ws) ws.close();
    };
  }, [isAuthenticated]);

  const filteredGreenhouses =
    selectedCompanyId === "all" ? greenhouses : greenhouses.filter((g) => g.companyId === selectedCompanyId);

  const handleCompanyChange = (companyId: string) => {
    setSelectedCompanyId(companyId);
    if (typeof window !== "undefined") {
      localStorage.setItem("green_node_selected_company", companyId);
    }
    const matching = companyId === "all" ? greenhouses : greenhouses.filter((g) => g.companyId === companyId);
    if (matching.length > 0) {
      setActiveGreenhouseId(matching[0].greenhouseId);
      if (typeof window !== "undefined") {
        localStorage.setItem("green_node_active_greenhouse", matching[0].greenhouseId);
      }
    }
    notify("success", "Active company scope updated.");
  };

  const handleGreenhouseChange = (greenhouseId: string) => {
    setActiveGreenhouseId(greenhouseId);
    if (typeof window !== "undefined") {
      localStorage.setItem("green_node_active_greenhouse", greenhouseId);
    }
    notify("success", "Active greenhouse updated.");
  };

  const handleSimulate = async () => {
    const targetId = simDeviceId || devices[0]?.deviceId;
    if (!targetId) {
      notify("error", "No module available to simulate.");
      return;
    }
    try {
      await sendTestReading({
        deviceId: targetId,
        temperature: parseFloat((23 + Math.random() * 5).toFixed(2)),
        humidity: parseFloat((55 + Math.random() * 15).toFixed(2)),
        soilMoisture: parseFloat((45 + Math.random() * 25).toFixed(2)),
        light: parseFloat((450 + Math.random() * 400).toFixed(1)),
        espTemperature: parseFloat((37 + Math.random() * 8).toFixed(2)),
        wifiSsid: "Greenhouse_IoT_2.4G",
        timestamp: new Date().toISOString(),
        metadata: { chip: "esp32-c3-supermini", rssi: -62 },
      });
      notify("success", "Simulated telemetry packet ingested.");
    } catch (err: any) {
      notify("error", err.message || "Telemetry simulation failed");
    }
  };

  const handleSaveApiUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiUrlInput.trim()) {
      setBackendUrl(apiUrlInput.trim());
      notify("success", "Backend API URL saved.");
      checkHealth();
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0B0B0D] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-[#E5E5EA] font-sans flex flex-col">
      {feedbackMsg && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border text-xs font-medium shadow-2xl flex items-center space-x-2 ${
            feedbackMsg.type === "success"
              ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-300"
              : "bg-rose-950/90 border-rose-500/40 text-rose-300"
          }`}
        >
          {feedbackMsg.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

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
                className="group relative py-1.5 text-sm font-medium text-[#8E8E93] hover:text-white transition-colors"
              >
                <span>Analytics</span>
                <span className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-white/30 scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left" />
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
              className="relative p-2 text-emerald-400 rounded-xl hover:bg-white/[0.06] transition flex items-center justify-center"
            >
              <Settings className="w-4 h-4" />
              <span className="absolute inset-x-2 -bottom-0.5 h-[2px] rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 shadow-[0_0_10px_rgba(52,211,153,0.75)]" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 space-y-6">
        {/* 1. Cluster Scope & Live Connection */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-[#141417] border border-[#282830] rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              <span>Cluster Scope (Company &amp; Greenhouse)</span>
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[#8E8E93] block mb-1">Active Company</label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                  className="w-full bg-[#1C1C22] border border-[#282830] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">All Companies</option>
                  {companies.map((c) => (
                    <option key={c.companyId} value={c.companyId}>
                      {c.name} ({c.location})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#8E8E93] block mb-1">Active Greenhouse</label>
                <select
                  value={activeGreenhouseId}
                  onChange={(e) => handleGreenhouseChange(e.target.value)}
                  className="w-full bg-[#1C1C22] border border-[#282830] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  {filteredGreenhouses.map((g) => (
                    <option key={g.greenhouseId} value={g.greenhouseId}>
                      {g.name} — {g.plant}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="bg-[#141417] border border-[#282830] rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center space-x-2">
              <Radio className="w-4 h-4 text-teal-400" />
              <span>Live Connection &amp; Telemetry Simulation</span>
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <div
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border ${
                  wsConnected
                    ? "bg-teal-500/10 text-teal-300 border-teal-500/25"
                    : "bg-amber-500/10 text-amber-300 border-amber-500/25"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-teal-400 animate-pulse" : "bg-amber-400"}`} />
                <span>{wsConnected ? "WS Live" : "WS Offline"}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl text-xs border border-[#282830] bg-[#1C1C22] text-[#A1A1A6]">
                Backend:{" "}
                <span className={backendStatus === "connected" ? "text-emerald-400 font-medium" : "text-amber-400 font-medium"}>
                  {backendStatus}
                </span>
                {backendLatency !== null && backendStatus === "connected" ? ` (${backendLatency}ms)` : ""}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <select
                value={simDeviceId}
                onChange={(e) => setSimDeviceId(e.target.value)}
                className="flex-1 min-w-[180px] bg-[#1C1C22] border border-[#282830] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.name} ({d.deviceId.slice(0, 8)}...)
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleSimulate}
                className="px-4 py-2 bg-[#1C1C22] hover:bg-[#282830] border border-[#282830] rounded-xl text-xs font-medium text-white flex items-center space-x-1.5 transition"
              >
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>Simulate Telemetry</span>
              </button>
            </div>
          </section>
        </div>

        {/* 2. Backend API & Session */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleSaveApiUrl} className="bg-[#141417] border border-[#282830] rounded-2xl p-6 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
              <Server className="w-4 h-4 text-cyan-400" />
              <span>Backend API Endpoint</span>
            </h3>
            <div className="flex gap-2">
              <input
                type="url"
                value={apiUrlInput}
                onChange={(e) => setApiUrlInput(e.target.value)}
                placeholder="https://blue-circle.onrender.com"
                className="flex-1 bg-[#1C1C22] border border-[#282830] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-[#1C1C22] hover:bg-[#282830] border border-[#282830] rounded-xl text-xs font-medium text-white flex items-center space-x-1.5 transition"
              >
                <Settings className="w-3.5 h-3.5 text-cyan-400" />
                <span>Save</span>
              </button>
            </div>
          </form>

          <section className="bg-[#141417] border border-[#282830] rounded-2xl p-6 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Account Session</h3>
              <p className="text-xs text-[#8E8E93] mt-0.5">Sign out from the Green Node dashboard on this browser.</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-xl text-xs font-medium flex items-center space-x-1.5 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}
