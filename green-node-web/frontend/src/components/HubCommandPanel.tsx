"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Power,
  Terminal,
  Link2,
  Clock,
  Radio,
  RefreshCw,
  Trash2,
  XCircle,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Sliders,
  ListChecks,
} from "lucide-react";
import {
  Device,
  HubCommandRecord,
  HubStatusInfo,
  CreateHubCommandPayload,
  sendHubCommand,
  fetchHubCommands,
  fetchHubStatus,
  clearHubCommands,
} from "@/lib/api";

interface HubCommandPanelProps {
  devices: Device[];
  focusedDeviceId: string | null;
  liveCommandUpdate: { seq: number; record?: HubCommandRecord; cleared?: boolean } | null;
  onNotify: (msg: { type: "success" | "error"; text: string }) => void;
}

export default function HubCommandPanel({
  devices,
  focusedDeviceId,
  liveCommandUpdate,
  onNotify,
}: HubCommandPanelProps) {
  const [commands, setCommands] = useState<HubCommandRecord[]>([]);
  const [hubStatus, setHubStatus] = useState<HubStatusInfo | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // 1. Actuator cmd <device_id> <on|off>
  const [actNodeId, setActNodeId] = useState<string>("sn-0001");
  const [actDuration, setActDuration] = useState<number>(300);

  // 2. Pair window pair <kind> <name> & cancel
  const [pairKind, setPairKind] = useState<"actuator" | "sensor" | "irrigation">("actuator");
  const [pairName, setPairName] = useState<string>("fan-01");
  const [pairSeconds, setPairSeconds] = useState<number>(120);

  // 3. Interval config cfg <device_id> <seconds>
  const [cfgNodeId, setCfgNodeId] = useState<string>("sn-0001");
  const [cfgInterval, setCfgInterval] = useState<number>(60);

  // 4. Node <-> UUID map <sn-id> <uuid> & maps
  const [mapSnId, setMapSnId] = useState<string>("sn-0001");
  const [mapUuid, setMapUuid] = useState<string>(focusedDeviceId || "");

  useEffect(() => {
    if (focusedDeviceId && !mapUuid) {
      setMapUuid(focusedDeviceId);
    }
  }, [focusedDeviceId, mapUuid]);

  const loadState = useCallback(async () => {
    try {
      const [cmds, status] = await Promise.all([fetchHubCommands(20), fetchHubStatus()]);
      setCommands(cmds);
      if (status) setHubStatus(status);
    } catch {
      // ignore transient errors
    }
  }, []);

  useEffect(() => {
    loadState();
    const timer = setInterval(loadState, 6000);
    return () => clearInterval(timer);
  }, [loadState]);

  useEffect(() => {
    if (!liveCommandUpdate) return;
    if (liveCommandUpdate.cleared) {
      setCommands([]);
      return;
    }
    const rec = liveCommandUpdate.record;
    if (rec) {
      setCommands((prev) => {
        const idx = prev.findIndex((c) => c.commandId === rec.commandId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = rec;
          return next;
        }
        return [rec, ...prev].slice(0, 20);
      });
      fetchHubStatus().then((st) => {
        if (st) setHubStatus(st);
      });
    }
  }, [liveCommandUpdate]);

  const dispatch = async (key: string, payload: CreateHubCommandPayload) => {
    setBusyKey(key);
    try {
      const created = await sendHubCommand(payload);
      setCommands((prev) => {
        if (prev.some((c) => c.commandId === created.commandId)) return prev;
        return [created, ...prev].slice(0, 20);
      });
      onNotify({ type: "success", text: `Queued CLI command: "${created.cliString}"` });
    } catch (err: any) {
      onNotify({ type: "error", text: err.message || "Failed to queue hub command" });
    } finally {
      setBusyKey(null);
    }
  };

  const handleClear = async () => {
    if (!confirm("Clear hub command history?")) return;
    await clearHubCommands();
    setCommands([]);
  };

  const statusBadge = (status: HubCommandRecord["status"]) => {
    switch (status) {
      case "executed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Executed
          </span>
        );
      case "dispatched":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
            <Loader2 className="w-3 h-3 animate-spin" /> Dispatched
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertTriangle className="w-3 h-3" /> Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Clock className="w-3 h-3" /> Pending
          </span>
        );
    }
  };

  const knownSnIds = Array.from(
    new Set([
      "sn-0001",
      "sn-0002",
      "sn-0003",
      ...commands
        .map((c) => c.payload?.deviceId || c.payload?.snId)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ])
  ).slice(0, 6);

  return (
    <section className="bg-[#141417] border border-[#282830] rounded-2xl p-6 space-y-5 shadow-xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#202026] pb-4">
        <div>
          <h3 className="text-base font-semibold text-white tracking-tight flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <span>Hub CLI &amp; Actuator Control</span>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              S3 + Pico 2W
            </span>
          </h3>
          <p className="text-xs text-[#8E8E93] mt-0.5">
            One-click controls for all ESP32-S3 hub CLI commands (<code>cmd</code>, <code>pair</code>, <code>cancel</code>, <code>cfg</code>, <code>map</code>, <code>maps</code>).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
              hubStatus?.isHubPollingActive
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                : "bg-[#1C1C22] text-[#8E8E93] border-[#2C2C34]"
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${hubStatus?.isHubPollingActive ? "animate-pulse" : ""}`} />
            <span>
              {hubStatus?.isHubPollingActive
                ? `Hub Polling (${hubStatus.lastHubId || "S3"})`
                : "Waiting for Hub Poll"}
            </span>
          </div>

          <button
            type="button"
            onClick={loadState}
            className="p-1.5 bg-[#1C1C20] hover:bg-[#282830] text-[#A1A1A6] hover:text-white rounded-lg border border-[#282830] transition"
            title="Refresh hub command status"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: Actuator Control (cmd <device_id> <on|off>) */}
        <div className="bg-[#101014] border border-[#24242C] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Power className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white">Actuator Power Control</h4>
                <code className="text-[10px] text-[#8E8E93]">cmd &lt;device_id&gt; &lt;on|off&gt;</code>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {knownSnIds.slice(0, 3).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActNodeId(id)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border transition ${
                    actNodeId === id
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      : "bg-[#18181D] text-[#8E8E93] border-[#282830] hover:text-white"
                  }`}
                >
                  {id}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-[#8E8E93] mb-1">Sub-Node ID</label>
              <input
                type="text"
                value={actNodeId}
                onChange={(e) => setActNodeId(e.target.value)}
                placeholder="sn-0001"
                className="w-full bg-[#18181D] border border-[#2C2C34] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500/60"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#8E8E93] mb-1">Duration (sec)</label>
              <input
                type="number"
                min={0}
                max={86400}
                value={actDuration}
                onChange={(e) => setActDuration(Number(e.target.value) || 0)}
                className="w-full bg-[#18181D] border border-[#2C2C34] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500/60"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              disabled={!actNodeId.trim() || busyKey === "cmd-on"}
              onClick={() =>
                dispatch("cmd-on", {
                  type: "cmd",
                  deviceId: actNodeId.trim(),
                  action: "on",
                  durationS: actDuration,
                })
              }
              className="py-2 px-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-1.5 shadow-md shadow-emerald-500/20"
            >
              <Power className="w-3.5 h-3.5" />
              <span>{busyKey === "cmd-on" ? "Sending..." : "Turn ON"}</span>
            </button>

            <button
              type="button"
              disabled={!actNodeId.trim() || busyKey === "cmd-off"}
              onClick={() =>
                dispatch("cmd-off", {
                  type: "cmd",
                  deviceId: actNodeId.trim(),
                  action: "off",
                  durationS: 0,
                })
              }
              className="py-2 px-3 bg-rose-500/15 hover:bg-rose-500 hover:text-white text-rose-300 border border-rose-500/30 disabled:opacity-50 rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-1.5"
            >
              <Power className="w-3.5 h-3.5" />
              <span>{busyKey === "cmd-off" ? "Sending..." : "Turn OFF"}</span>
            </button>
          </div>
        </div>

        {/* Card 2: Pairing Window (pair <kind> <name> & cancel) */}
        <div className="bg-[#101014] border border-[#24242C] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white">Sub-Node Pairing Window</h4>
                <code className="text-[10px] text-[#8E8E93]">pair &lt;kind&gt; &lt;name&gt; | cancel</code>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {(["actuator", "sensor", "irrigation"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPairKind(k)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize border transition ${
                    pairKind === k
                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                      : "bg-[#18181D] text-[#8E8E93] border-[#282830] hover:text-white"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-[#8E8E93] mb-1">Node Name (no spaces)</label>
              <input
                type="text"
                maxLength={15}
                value={pairName}
                onChange={(e) => setPairName(e.target.value.replace(/\s+/g, "-"))}
                placeholder="fan-01"
                className="w-full bg-[#18181D] border border-[#2C2C34] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500/60"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#8E8E93] mb-1">Window (sec)</label>
              <input
                type="number"
                min={5}
                max={600}
                value={pairSeconds}
                onChange={(e) => setPairSeconds(Number(e.target.value) || 120)}
                className="w-full bg-[#18181D] border border-[#2C2C34] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500/60"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              disabled={!pairName.trim() || busyKey === "pair"}
              onClick={() =>
                dispatch("pair", {
                  type: "pair",
                  kind: pairKind,
                  name: pairName.trim(),
                  seconds: pairSeconds,
                })
              }
              className="py-2 px-3 bg-cyan-500/20 hover:bg-cyan-500 hover:text-white text-cyan-300 border border-cyan-500/30 disabled:opacity-50 rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-1.5"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>{busyKey === "pair" ? "Opening..." : "Open Pair Window"}</span>
            </button>

            <button
              type="button"
              disabled={busyKey === "cancel"}
              onClick={() => dispatch("cancel", { type: "cancel" })}
              className="py-2 px-3 bg-[#1C1C22] hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/40 text-[#C7C7CC] border border-[#303038] disabled:opacity-50 rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-1.5"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>{busyKey === "cancel" ? "Cancelling..." : "Cancel Pairing"}</span>
            </button>
          </div>
        </div>

        {/* Card 3: Report Interval (cfg <device_id> <seconds>) */}
        <div className="bg-[#101014] border border-[#24242C] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white">Report Interval Config</h4>
                <code className="text-[10px] text-[#8E8E93]">cfg &lt;device_id&gt; &lt;seconds&gt;</code>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {[10, 30, 60, 300].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setCfgInterval(sec)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border transition ${
                    cfgInterval === sec
                      ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                      : "bg-[#18181D] text-[#8E8E93] border-[#282830] hover:text-white"
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 items-end">
            <div>
              <label className="block text-[11px] text-[#8E8E93] mb-1">Sub-Node ID</label>
              <input
                type="text"
                value={cfgNodeId}
                onChange={(e) => setCfgNodeId(e.target.value)}
                placeholder="sn-0001"
                className="w-full bg-[#18181D] border border-[#2C2C34] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-purple-500/60"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#8E8E93] mb-1">Interval (5-3600s)</label>
              <input
                type="number"
                min={5}
                max={3600}
                value={cfgInterval}
                onChange={(e) => setCfgInterval(Number(e.target.value) || 60)}
                className="w-full bg-[#18181D] border border-[#2C2C34] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-purple-500/60"
              />
            </div>
            <button
              type="button"
              disabled={!cfgNodeId.trim() || busyKey === "cfg"}
              onClick={() =>
                dispatch("cfg", {
                  type: "cfg",
                  deviceId: cfgNodeId.trim(),
                  intervalS: cfgInterval,
                })
              }
              className="py-1.5 px-3 bg-purple-500/20 hover:bg-purple-500 hover:text-white text-purple-300 border border-purple-500/30 disabled:opacity-50 rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-1.5 h-[30px]"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{busyKey === "cfg" ? "Saving..." : "Apply"}</span>
            </button>
          </div>
        </div>

        {/* Card 4: Sub-Node UUID Mapping (map <sn-id> <uuid> & maps) */}
        <div className="bg-[#101014] border border-[#24242C] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                <Link2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white">Sub-Node to Dashboard UUID Map</h4>
                <code className="text-[10px] text-[#8E8E93]">map &lt;sn-id&gt; &lt;uuid&gt; | maps</code>
              </div>
            </div>
            <button
              type="button"
              disabled={busyKey === "maps"}
              onClick={() => dispatch("maps", { type: "maps" })}
              className="px-2.5 py-1 bg-[#1C1C22] hover:bg-[#282830] text-[11px] font-medium text-[#C7C7CC] hover:text-white rounded-lg border border-[#303038] transition flex items-center space-x-1"
            >
              <ListChecks className="w-3 h-3 text-amber-400" />
              <span>{busyKey === "maps" ? "Requesting..." : "List Maps"}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
            <div>
              <label className="block text-[11px] text-[#8E8E93] mb-1">Sub-Node ID</label>
              <input
                type="text"
                value={mapSnId}
                onChange={(e) => setMapSnId(e.target.value)}
                placeholder="sn-0001"
                className="w-full bg-[#18181D] border border-[#2C2C34] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-amber-500/60"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-[#8E8E93] mb-1">Registered Device UUID</label>
              <div className="flex gap-2">
                <select
                  value={devices.some((d) => d.deviceId === mapUuid) ? mapUuid : ""}
                  onChange={(e) => {
                    if (e.target.value) setMapUuid(e.target.value);
                  }}
                  className="flex-1 bg-[#18181D] border border-[#2C2C34] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/60 min-w-0"
                >
                  <option value="">-- Select Registered Module --</option>
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.name} ({d.deviceId.slice(0, 8)}...)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!mapSnId.trim() || !mapUuid.trim() || busyKey === "map"}
                  onClick={() =>
                    dispatch("map", {
                      type: "map",
                      snId: mapSnId.trim(),
                      uuid: mapUuid.trim(),
                    })
                  }
                  className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500 hover:text-black text-amber-300 border border-amber-500/30 disabled:opacity-50 rounded-lg text-xs font-semibold transition shrink-0"
                >
                  {busyKey === "map" ? "Mapping..." : "Bind Map"}
                </button>
              </div>
            </div>
          </div>

          {hubStatus?.lastMapsDetails?.summary && (
            <div className="text-[11px] font-mono bg-[#0B0B0E] border border-[#22222A] rounded-lg px-3 py-2 text-amber-200 break-all">
              Hub maps: {hubStatus.lastMapsDetails.summary}
            </div>
          )}
        </div>
      </div>

      {/* Command Queue & History */}
      <div className="bg-[#101014] border border-[#24242C] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-white flex items-center space-x-2">
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span>Recent Hub Commands</span>
            <span className="text-[10px] text-[#8E8E93]">({commands.length})</span>
          </h4>
          {commands.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="text-[11px] text-[#8E8E93] hover:text-rose-400 flex items-center space-x-1 transition"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#202028] text-[#8E8E93] text-[11px]">
                <th className="py-2 px-2">CLI Command</th>
                <th className="py-2 px-2">Status</th>
                <th className="py-2 px-2">Hub Response</th>
                <th className="py-2 px-2">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C1C22]">
              {commands.slice(0, 8).map((c) => (
                <tr key={c.commandId} className="hover:bg-[#16161B] transition">
                  <td className="py-2 px-2 font-mono text-[11px] text-emerald-300 whitespace-nowrap">
                    {c.cliString}
                  </td>
                  <td className="py-2 px-2 whitespace-nowrap">{statusBadge(c.status)}</td>
                  <td className="py-2 px-2 text-[#A1A1A6] text-[11px] max-w-[300px] truncate">
                    {c.resultMessage || (c.status === "pending" ? "Waiting for S3 hub poll..." : "--")}
                  </td>
                  <td className="py-2 px-2 text-[#6E6E73] text-[11px] whitespace-nowrap">
                    {new Date(c.createdAt).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
              {commands.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-5 text-center text-[#6E6E73] text-xs">
                    No hub commands sent yet. Click a button above to control actuators, pair nodes, or update intervals.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
