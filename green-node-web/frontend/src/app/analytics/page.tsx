"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  fetchGreenhouses,
  fetchGreenhouseOverview,
  fetchDevices,
  Greenhouse,
  Device,
} from "@/lib/api";
import {
  Settings,
  RefreshCw,
  Sprout,
  Thermometer,
  Droplets,
  Wifi,
  WifiOff,
  ChevronRight,
  Building2,
  Warehouse,
} from "lucide-react";

export default function AnalyticsGreenhousesPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const [greenhouses, setGreenhouses] = useState<Greenhouse[]>([]);
  const [overviews, setOverviews] = useState<Record<string, Greenhouse>>({});
  const [devices, setDevices] = useState<Device[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  const loadAll = useCallback(async () => {
    setLoadingData(true);
    setErrorMsg(null);
    try {
      const [ghs, devs] = await Promise.all([fetchGreenhouses(), fetchDevices()]);
      setGreenhouses(ghs);
      setDevices(devs);

      const overviewEntries = await Promise.all(
        ghs.map(async (g) => {
          const ov = await fetchGreenhouseOverview(g.greenhouseId);
          return ov ? ([g.greenhouseId, ov] as const) : null;
        })
      );
      const map: Record<string, Greenhouse> = {};
      for (const entry of overviewEntries) {
        if (entry) map[entry[0]] = entry[1];
      }
      setOverviews(map);
    } catch (err: any) {
      setErrorMsg(err.message || "Could not load greenhouses");
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadAll();
  }, [isAuthenticated, loadAll]);

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

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 space-y-8">
        {/* Page Header (inspired by My Greenhouses design, adapted to dark theme) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Greenhouse Analytics
            </h2>
            <p className="text-xs sm:text-sm text-[#8E8E93] mt-1">
              Select a greenhouse facility to inspect live climate telemetry and module status.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadAll}
              disabled={loadingData}
              title="Refresh greenhouse list"
              aria-label="Refresh"
              className="p-2.5 rounded-xl border border-[#282830] bg-[#141417] text-[#A1A1A6] hover:text-emerald-400 hover:border-emerald-500/40 transition active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loadingData ? "animate-spin text-emerald-400" : ""}`} />
            </button>
          </div>
        </div>

        {/* Loading Skeleton */}
        {loadingData && greenhouses.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-60 rounded-2xl bg-[#141417] border border-[#282830] animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Error State */}
        {errorMsg && greenhouses.length === 0 && !loadingData && (
          <div className="bg-[#141417] border border-rose-500/30 rounded-2xl p-8 text-center space-y-3">
            <p className="text-sm font-semibold text-rose-400">Could not load greenhouses</p>
            <p className="text-xs text-[#8E8E93]">{errorMsg}</p>
            <button
              type="button"
              onClick={loadAll}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-semibold transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loadingData && !errorMsg && greenhouses.length === 0 && (
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-12 text-center space-y-3">
            <Warehouse className="w-10 h-10 text-emerald-400 mx-auto" />
            <h3 className="text-base font-semibold text-white">No greenhouses registered yet</h3>
            <p className="text-xs text-[#8E8E93] max-w-md mx-auto">
              Register a company and greenhouse in New Registers to start monitoring climate telemetry.
            </p>
            <Link
              href="/registers"
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-semibold shadow-md shadow-emerald-500/20"
            >
              <span>Go to New Registers</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* Greenhouses Selection Grid */}
        {greenhouses.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {greenhouses.map((gh) => {
              const ov = overviews[gh.greenhouseId];
              const ghDevices =
                ov?.devices || devices.filter((d) => d.greenhouseId === gh.greenhouseId);
              const onlineCount = ghDevices.filter((d) => d.isOnline).length;
              const tempVal = ov?.summary?.avgTemperature;
              const soilVal = ov?.summary?.avgSoilMoisture;
              const hasOnline = onlineCount > 0;

              return (
                <Link
                  key={gh.greenhouseId}
                  href={`/analytics/${encodeURIComponent(gh.greenhouseId)}`}
                  className="group bg-[#141417] border border-[#282830] hover:border-emerald-500/50 rounded-2xl p-5 sm:p-6 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-emerald-500/10"
                >
                  <div>
                    {/* Top Header: Name, Crop & Status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            {gh.companyName} · {gh.companyLocation}
                          </span>
                        </div>
                        <h3 className="text-lg font-bold text-white tracking-tight group-hover:text-emerald-400 transition-colors truncate">
                          {gh.name}
                        </h3>
                        <p className="text-xs text-[#8E8E93] mt-0.5 flex items-center space-x-1">
                          <Sprout className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>
                            Crop: <span className="font-semibold text-[#E5E5EA]">{gh.plant}</span>
                          </span>
                        </p>
                      </div>

                      <span
                        className={`shrink-0 inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
                          hasOnline
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                            : "bg-[#1C1C22] text-[#8E8E93] border-[#2C2C36]"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            hasOnline ? "bg-emerald-400 animate-pulse" : "bg-[#6E6E73]"
                          }`}
                        />
                        <span>{hasOnline ? "Online" : "Standby"}</span>
                      </span>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="mt-5 grid grid-cols-2 gap-3 p-3.5 bg-[#0E0E12] rounded-xl border border-[#22222A]">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                          <Thermometer className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8E8E93] block">
                            Temperature
                          </span>
                          <span className="text-sm font-bold text-white">
                            {tempVal !== null && tempVal !== undefined ? `${tempVal}°C` : "--"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                          <Droplets className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8E8E93] block">
                            Soil Moisture
                          </span>
                          <span className="text-sm font-bold text-white">
                            {soilVal !== null && soilVal !== undefined ? `${soilVal}%` : "--"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Linked Modules Summary */}
                    <div className="mt-4 space-y-2 text-xs text-[#8E8E93] px-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[#A1A1A6]">
                          Modules: {ghDevices.length} linked
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                            hasOnline ? "text-emerald-400" : "text-[#6E6E73]"
                          }`}
                        >
                          {hasOnline ? (
                            <>
                              <Wifi className="w-3.5 h-3.5" />
                              <span>
                                {onlineCount} / {ghDevices.length} Online
                              </span>
                            </>
                          ) : (
                            <>
                              <WifiOff className="w-3.5 h-3.5" />
                              <span>0 / {ghDevices.length} Online</span>
                            </>
                          )}
                        </span>
                      </div>

                      {ghDevices.length > 0 && (
                        <div className="border-t border-[#202026] pt-2 space-y-1">
                          {ghDevices.slice(0, 2).map((dev) => (
                            <div
                              key={dev.deviceId}
                              className="flex items-center justify-between gap-2 text-[11px]"
                            >
                              <span className="text-[#C7C7CC] truncate">{dev.name}</span>
                              <span
                                className={`shrink-0 ${
                                  dev.isOnline ? "text-emerald-400" : "text-[#6E6E73]"
                                }`}
                              >
                                {dev.isOnline ? "Online" : "Offline"}
                              </span>
                            </div>
                          ))}
                          {ghDevices.length > 2 && (
                            <p className="text-[10px] text-[#6E6E73]">
                              +{ghDevices.length - 2} more module{ghDevices.length - 2 !== 1 ? "s" : ""}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Footer */}
                  <div className="mt-5 pt-3.5 border-t border-[#202026] flex items-center justify-between">
                    <span className="text-[11px] font-mono text-[#6E6E73] truncate">
                      {gh.companyId}
                    </span>

                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 group-hover:text-emerald-300 transition-colors">
                      <span>View Analytics</span>
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
