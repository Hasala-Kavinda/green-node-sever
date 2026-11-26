"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Radio, Link2, XCircle, ListChecks } from "lucide-react";
import {
  Device,
  HubCommandRecord,
  HubStatusInfo,
  CreateHubCommandPayload,
  sendHubCommand,
  fetchHubStatus,
} from "@/lib/api";

interface SubNodePairingAndMapProps {
  devices: Device[];
  focusedDeviceId: string | null;
  liveCommandUpdate: { seq: number; record?: HubCommandRecord; cleared?: boolean } | null;
  onNotify: (msg: { type: "success" | "error"; text: string }) => void;
  onCommandCreated?: (record: HubCommandRecord) => void;
}

/**
 * Renders the Sub-Node Pairing Window and Sub-Node to Dashboard UUID Map
 * sections inside the Registered Modules inventory.
 */
export default function SubNodePairingAndMap({
  devices,
  focusedDeviceId,
  liveCommandUpdate,
  onNotify,
  onCommandCreated,
}: SubNodePairingAndMapProps) {
  const [hubStatus, setHubStatus] = useState<HubStatusInfo | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Pair window: pair <kind> <name> & cancel
  const [pairKind, setPairKind] = useState<"actuator" | "sensor" | "irrigation">("actuator");
  const [pairName, setPairName] = useState<string>("fan-01");
  const [pairSeconds, setPairSeconds] = useState<number>(120);

  // Node <-> UUID map: map <sn-id> <uuid> & maps
  const [mapSnId, setMapSnId] = useState<string>("sn-0001");
  const [mapUuid, setMapUuid] = useState<string>(focusedDeviceId || "");

  useEffect(() => {
    if (devices.length > 0 && mapUuid && !devices.some((d) => d.deviceId === mapUuid)) {
      setMapUuid(
        focusedDeviceId && devices.some((d) => d.deviceId === focusedDeviceId)
          ? focusedDeviceId
          : ""
      );
    } else if (
      !mapUuid &&
      focusedDeviceId &&
      (devices.length === 0 || devices.some((d) => d.deviceId === focusedDeviceId))
    ) {
      setMapUuid(focusedDeviceId);
    }
  }, [devices, focusedDeviceId, mapUuid]);

  const loadHubStatus = useCallback(async () => {
    try {
      const status = await fetchHubStatus();
      if (status) setHubStatus(status);
    } catch {
      // ignore transient errors
    }
  }, []);

  useEffect(() => {
    loadHubStatus();
    const timer = setInterval(loadHubStatus, 6000);
    return () => clearInterval(timer);
  }, [loadHubStatus]);

  useEffect(() => {
    if (liveCommandUpdate?.record) {
      loadHubStatus();
    }
  }, [liveCommandUpdate, loadHubStatus]);

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
    <div className="space-y-8 pt-2">
      {/* 3. SUB-NODE PAIRING WINDOW */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2 text-sm font-semibold text-cyan-300 uppercase tracking-wider">
          <Radio className="w-4 h-4" />
          <span>Sub-Node Pairing Window</span>
        </div>

        <div className="bg-[#141417] border border-[#282830] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-white">Pairing Configuration</h4>
              <code className="text-xs text-[#8E8E93]">pair &lt;kind&gt; &lt;name&gt; | cancel</code>
            </div>

            <div className="flex items-center gap-1.5">
              {(["actuator", "sensor", "irrigation"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPairKind(k)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold capitalize border transition ${
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#8E8E93] mb-1.5">Node Name (no spaces)</label>
              <input
                type="text"
                maxLength={15}
                value={pairName}
                onChange={(e) => setPairName(e.target.value.replace(/\s+/g, "-"))}
                placeholder="fan-01"
                className="w-full bg-[#18181D] border border-[#2C2C34] rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-500/60"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#8E8E93] mb-1.5">Window (sec)</label>
              <input
                type="number"
                min={5}
                max={600}
                value={pairSeconds}
                onChange={(e) => setPairSeconds(Number(e.target.value) || 120)}
                className="w-full bg-[#18181D] border border-[#2C2C34] rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-500/60"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
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
              className="py-2.5 px-4 bg-cyan-500/20 hover:bg-cyan-500 hover:text-white text-cyan-300 border border-cyan-500/30 disabled:opacity-50 rounded-xl text-sm font-semibold transition flex items-center justify-center space-x-2"
            >
              <Radio className="w-4 h-4" />
              <span>{busyKey === "pair" ? "Opening..." : "Open Pair Window"}</span>
            </button>

            <button
              type="button"
              disabled={busyKey === "cancel"}
              onClick={() => dispatch("cancel", { type: "cancel" })}
              className="py-2.5 px-4 bg-[#1C1C22] hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/40 text-[#C7C7CC] border border-[#303038] disabled:opacity-50 rounded-xl text-sm font-semibold transition flex items-center justify-center space-x-2"
            >
              <XCircle className="w-4 h-4" />
              <span>{busyKey === "cancel" ? "Cancelling..." : "Cancel Pairing"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. SUB-NODE TO DASHBOARD UUID MAP */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2 text-sm font-semibold text-amber-300 uppercase tracking-wider">
          <Link2 className="w-4 h-4" />
          <span>Sub-Node to Dashboard UUID Map</span>
        </div>

        <div className="bg-[#141417] border border-[#282830] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-white">Bind Sub-Node Mapping</h4>
              <code className="text-xs text-[#8E8E93]">map &lt;sn-id&gt; &lt;uuid&gt; | maps</code>
            </div>
            <button
              type="button"
              disabled={busyKey === "maps"}
              onClick={() => dispatch("maps", { type: "maps" })}
              className="px-3 py-1.5 bg-[#1C1C22] hover:bg-[#282830] text-xs font-semibold text-[#C7C7CC] hover:text-white rounded-xl border border-[#303038] transition flex items-center space-x-1.5"
            >
              <ListChecks className="w-3.5 h-3.5 text-amber-400" />
              <span>{busyKey === "maps" ? "Requesting..." : "List Maps"}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-[#8E8E93] mb-1.5">Sub-Node ID</label>
              <input
                type="text"
                value={mapSnId}
                onChange={(e) => setMapSnId(e.target.value)}
                placeholder="sn-0001"
                className="w-full bg-[#18181D] border border-[#2C2C34] rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:outline-none focus:border-amber-500/60"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#8E8E93] mb-1.5">Registered Device UUID</label>
              <div className="flex gap-2.5">
                <select
                  value={devices.some((d) => d.deviceId === mapUuid) ? mapUuid : ""}
                  onChange={(e) => {
                    if (e.target.value) setMapUuid(e.target.value);
                  }}
                  className="flex-1 bg-[#18181D] border border-[#2C2C34] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/60 min-w-0"
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
                  className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500 hover:text-black text-amber-300 border border-amber-500/30 disabled:opacity-50 rounded-xl text-sm font-semibold transition shrink-0"
                >
                  {busyKey === "map" ? "Mapping..." : "Bind Map"}
                </button>
              </div>
            </div>
          </div>

          {hubStatus?.lastMapsDetails?.summary && (
            <div className="text-xs font-mono bg-[#0B0B0E] border border-[#22222A] rounded-xl px-3.5 py-2.5 text-amber-200 break-all">
              Hub maps: {hubStatus.lastMapsDetails.summary}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
