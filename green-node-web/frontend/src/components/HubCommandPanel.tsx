"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Terminal,
  Clock,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import {
  HubCommandRecord,
  fetchHubCommands,
  clearHubCommands,
} from "@/lib/api";

interface HubCommandPanelProps {
  liveCommandUpdate: { seq: number; record?: HubCommandRecord; cleared?: boolean } | null;
  onNotify: (msg: { type: "success" | "error"; text: string }) => void;
  onCleared?: () => void;
}

export default function HubCommandPanel({
  liveCommandUpdate,
  onNotify,
  onCleared,
}: HubCommandPanelProps) {
  const [commands, setCommands] = useState<HubCommandRecord[]>([]);

  const loadState = useCallback(async () => {
    try {
      const cmds = await fetchHubCommands(20);
      setCommands(cmds);
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
    }
  }, [liveCommandUpdate]);

  const handleClear = async () => {
    if (!confirm("Clear hub command history?")) return;
    try {
      const ok = await clearHubCommands();
      if (!ok) {
        onNotify({ type: "error", text: "Failed to clear hub command history" });
        return;
      }
      setCommands([]);
      onCleared?.();
      onNotify({ type: "success", text: "Cleared hub command history" });
    } catch (err: any) {
      onNotify({ type: "error", text: err.message || "Failed to clear hub command history" });
    }
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
            Live queue &amp; execution history for ESP32-S3 hub CLI commands (<code>cmd</code>, <code>pair</code>, <code>cancel</code>, <code>cfg</code>, <code>map</code>, <code>maps</code>).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
                    No hub commands sent yet. Use the Actuator, Pairing, or UUID Map controls in Registered Modules to queue commands.
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
