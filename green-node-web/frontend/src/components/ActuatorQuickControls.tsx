"use client";

import React, { useState, useEffect } from "react";
import { Power, Sliders, Clock } from "lucide-react";
import { sendHubCommand, CreateHubCommandPayload, HubCommandRecord } from "@/lib/api";

interface ActuatorQuickControlsProps {
  defaultSubNodeId?: string;
  onNotify: (msg: { type: "success" | "error"; text: string }) => void;
  onCommandCreated?: (record: HubCommandRecord) => void;
}

export default function ActuatorQuickControls({
  defaultSubNodeId,
  onNotify,
  onCommandCreated,
}: ActuatorQuickControlsProps) {
  const [actNodeId, setActNodeId] = useState<string>(defaultSubNodeId || "sn-0001");
  const [actDuration, setActDuration] = useState<number>(300);

  const [cfgNodeId, setCfgNodeId] = useState<string>(defaultSubNodeId || "sn-0001");
  const [cfgInterval, setCfgInterval] = useState<number>(60);

  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    const nextId = defaultSubNodeId?.trim() || "sn-0001";
    setActNodeId(nextId);
    setCfgNodeId(nextId);
  }, [defaultSubNodeId]);

  const dispatch = async (key: string, payload: CreateHubCommandPayload) => {
    setBusyKey(key);
    try {
      const created = await sendHubCommand(payload);
      onCommandCreated?.(created);
      onNotify({ type: "success", text: `Queued CLI command: "${created.cliString}"` });
    } catch (err: any) {
      onNotify({ type: "error", text: err.message || "Failed to queue hub command" });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Actuator Power Control */}
      <div className="bg-[#141417] border border-[#282830] rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Power className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Actuator Power Control</h4>
              <code className="text-xs text-[#8E8E93]">cmd &lt;device_id&gt; &lt;on|off&gt;</code>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {["sn-0001", "sn-0002", "sn-0003"].map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setActNodeId(id)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono border transition ${
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#8E8E93] mb-1.5">Sub-Node ID</label>
            <input
              type="text"
              value={actNodeId}
              onChange={(e) => setActNodeId(e.target.value)}
              placeholder="sn-0001"
              className="w-full bg-[#18181D] border border-[#2C2C34] rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-emerald-500/60"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8E8E93] mb-1.5">Duration (sec)</label>
            <input
              type="number"
              min={0}
              max={86400}
              value={actDuration}
              onChange={(e) => setActDuration(Number(e.target.value) || 0)}
              className="w-full bg-[#18181D] border border-[#2C2C34] rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-emerald-500/60"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
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
            className="py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center space-x-1.5 shadow-md shadow-emerald-500/20"
          >
            <Power className="w-4 h-4" />
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
            className="py-2.5 px-3 bg-rose-500/15 hover:bg-rose-500 hover:text-white text-rose-300 border border-rose-500/30 disabled:opacity-50 rounded-xl text-sm font-semibold transition flex items-center justify-center space-x-1.5"
          >
            <Power className="w-4 h-4" />
            <span>{busyKey === "cmd-off" ? "Sending..." : "Turn OFF"}</span>
          </button>
        </div>
      </div>

      {/* 2. Report Interval Config */}
      <div className="bg-[#141417] border border-[#282830] rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Report Interval Config</h4>
              <code className="text-xs text-[#8E8E93]">cfg &lt;device_id&gt; &lt;seconds&gt;</code>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {[10, 30, 60, 300].map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setCfgInterval(sec)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono border transition ${
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

        <div className="grid grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-[#8E8E93] mb-1.5">Sub-Node ID</label>
            <input
              type="text"
              value={cfgNodeId}
              onChange={(e) => setCfgNodeId(e.target.value)}
              placeholder="sn-0001"
              className="w-full bg-[#18181D] border border-[#2C2C34] rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-purple-500/60"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8E8E93] mb-1.5">Interval (5-3600s)</label>
            <input
              type="number"
              min={5}
              max={3600}
              value={cfgInterval}
              onChange={(e) => setCfgInterval(Number(e.target.value) || 60)}
              className="w-full bg-[#18181D] border border-[#2C2C34] rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-purple-500/60"
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
            className="py-2 px-3 bg-purple-500/20 hover:bg-purple-500 hover:text-white text-purple-300 border border-purple-500/30 disabled:opacity-50 rounded-xl text-sm font-semibold transition flex items-center justify-center space-x-1.5 h-[38px]"
          >
            <Clock className="w-4 h-4" />
            <span>{busyKey === "cfg" ? "Saving..." : "Apply"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
