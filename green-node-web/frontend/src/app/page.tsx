"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  fetchGreenhouses,
  fetchGreenhouseOverview,
  fetchDevices,
  deleteDevice,
  fetchReadings,
  fetchLatestReading,
  fetchLogs,
  clearAllLogs,
  fetchHubCommands,
  clearHubCommands,
  getWebSocketUrl,
  Greenhouse,
  Device,
  Reading,
  SystemLog,
  HubCommandRecord,
} from "@/lib/api";
import HubCommandPanel from "@/components/HubCommandPanel";
import ActuatorQuickControls from "@/components/ActuatorQuickControls";
import SubNodePairingAndMap from "@/components/SubNodePairingAndMap";
import {
  Cpu,
  Activity,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  CheckCircle2,
  XCircle,
  Wifi,
  Copy,
  Check,
  Power,
} from "lucide-react";

export default function DashboardPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  // Hierarchy State
  const [selectedCompanyId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("green_node_selected_company") || "all";
    }
    return "all";
  });
  const [activeGreenhouseId, setActiveGreenhouseId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("green_node_active_greenhouse") || "";
    }
    return "";
  });
  const [hasConfirmedGreenhouse, setHasConfirmedGreenhouse] = useState(false);
  const [activeGreenhouse, setActiveGreenhouse] = useState<Greenhouse | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("green_node_cached_greenhouse");
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return null;
  });
  const [greenhouseDevices, setGreenhouseDevices] = useState<Device[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("green_node_cached_gh_devices");
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return [];
  });
  const [greenhouses, setGreenhouses] = useState<Greenhouse[]>([]);
  const [isLoadingGreenhouses, setIsLoadingGreenhouses] = useState(true);
  const [greenhouseLoadError, setGreenhouseLoadError] = useState<string | null>(null);
  const [greenhouseDataError, setGreenhouseDataError] = useState<string | null>(null);
  const [allDevices, setAllDevices] = useState<Device[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("green_node_cached_devices");
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return [];
  });
  const [deviceViewFilter, setDeviceViewFilter] = useState<"all" | "current">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("green_node_device_filter");
      if (saved === "all" || saved === "current") return saved;
    }
    return "current";
  });
  const [copiedDeviceId, setCopiedDeviceId] = useState<string | null>(null);
  const [focusedActuatorId, setFocusedActuatorId] = useState<string | null>(null);
  const [moduleCategoryFilter, setModuleCategoryFilter] = useState<"all" | "sensor" | "actuator">("all");

  // Active Sensor Drilldown
  const [focusedDeviceId, setFocusedDeviceId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("green_node_focused_device") || null;
    }
    return null;
  });
  const [focusedLatestReading, setFocusedLatestReading] = useState<Reading | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const savedDev = localStorage.getItem("green_node_focused_device");
        if (savedDev) {
          const cached = localStorage.getItem(`green_node_latest_${savedDev}`);
          if (cached) return JSON.parse(cached);
        }
      } catch {}
    }
    return null;
  });
  const [recentReadings, setRecentReadings] = useState<Reading[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const savedDev = localStorage.getItem("green_node_focused_device");
        if (savedDev) {
          const cached = localStorage.getItem(`green_node_readings_${savedDev}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          }
        }
      } catch {}
    }
    return [];
  });

  // System & Connection State
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [hubCommands, setHubCommands] = useState<HubCommandRecord[]>([]);
  const [activityFilter, setActivityFilter] = useState<"all" | "actuators">("all");

  const getActuatorMetaMap = (): Record<string, { moduleCategory: "sensor" | "actuator"; actuatorType?: string; subNodeId?: string }> => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem("green_node_actuator_meta");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const getModuleCategory = (dev: Device): "sensor" | "actuator" => {
    if (dev.moduleCategory === "actuator" || dev.sensorType === "actuator") return "actuator";
    if (dev.moduleCategory === "sensor") return "sensor";
    const meta = getActuatorMetaMap()[dev.deviceId];
    return meta?.moduleCategory === "actuator" ? "actuator" : "sensor";
  };

  const getDeviceStatus = (dev: Device): NonNullable<Device["status"]> =>
    dev.status ?? (dev.isOnline ? "online" : "warning");

  const getActuatorMeta = (dev: Device): { actuatorType: string; subNodeId?: string } => {
    const meta = getActuatorMetaMap()[dev.deviceId];
    return {
      actuatorType: dev.actuatorType || meta?.actuatorType || "fan",
      subNodeId: dev.subNodeId || meta?.subNodeId,
    };
  };

  // Feedback & Live Updates
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [liveHubCmdUpdate, setLiveHubCmdUpdate] = useState<{
    seq: number;
    record?: HubCommandRecord;
    cleared?: boolean;
  } | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const focusedDeviceIdRef = useRef<string | null>(focusedDeviceId);
  const greenhouseLoadRequestRef = useRef(0);

  // Keep focusedDeviceIdRef updated for WebSocket and async closures
  useEffect(() => {
    focusedDeviceIdRef.current = focusedDeviceId;
  }, [focusedDeviceId]);

  const baseDisplayedModules =
    deviceViewFilter === "all"
      ? selectedCompanyId === "all"
        ? allDevices
        : allDevices.filter((d) => d.companyId === selectedCompanyId)
      : greenhouseDevices;

  const displayedModules =
    moduleCategoryFilter === "all"
      ? baseDisplayedModules
      : baseDisplayedModules.filter((d) => getModuleCategory(d) === moduleCategoryFilter);

  // Auto-select a valid sensor module only when none is focused or the focused sensor is filtered out
  useEffect(() => {
    const sensorModules = baseDisplayedModules.filter((d) => getModuleCategory(d) === "sensor");
    if (sensorModules.length === 0) return;

    const inList = focusedDeviceId ? sensorModules.some((d) => d.deviceId === focusedDeviceId) : false;
    if (!inList) {
      const topSensor = sensorModules[0];
      setFocusedDeviceId(topSensor.deviceId);
      if (typeof window !== "undefined") {
        localStorage.setItem("green_node_focused_device", topSensor.deviceId);
      }
      loadFocusedNodeData(topSensor.deviceId);
    }
  }, [baseDisplayedModules, focusedDeviceId]);

  // Auth Protection
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Initial Data Load & WebSocket Subscription
  useEffect(() => {
    if (!isAuthenticated) return;
    loadHierarchy();
    loadLogs();

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connectWs = () => {
      if (disposed) return;
      initWebSocket(() => {
        if (!disposed) {
          reconnectTimer = setTimeout(connectWs, 3000);
        }
      });
    };

    connectWs();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [isAuthenticated]);

  const loadHierarchy = async () => {
    setIsLoadingGreenhouses(true);
    setGreenhouseLoadError(null);
    greenhouseLoadRequestRef.current += 1;
    try {
      const [ghs, devs] = await Promise.all([fetchGreenhouses(), fetchDevices()]);
      setGreenhouses(ghs);
      if (Array.isArray(devs)) {
        setAllDevices(devs);
        if (typeof window !== "undefined") {
          localStorage.setItem("green_node_cached_devices", JSON.stringify(devs));
        }
      }

      if (ghs.length > 0) {
        const savedGh = typeof window !== "undefined" ? localStorage.getItem("green_node_active_greenhouse") : null;
        const targetGhId = savedGh && ghs.some((g) => g.greenhouseId === savedGh) ? savedGh : "";
        setActiveGreenhouseId(targetGhId);
        if (targetGhId) {
          if (typeof window !== "undefined") {
            localStorage.setItem("green_node_active_greenhouse", targetGhId);
          }
          await loadGreenhouseData(targetGhId, devs);
        } else {
          setActiveGreenhouse(null);
          setGreenhouseDevices([]);
          setDeviceViewFilter("current");
          if (typeof window !== "undefined") {
            localStorage.removeItem("green_node_active_greenhouse");
            localStorage.setItem("green_node_device_filter", "current");
          }
        }
      } else {
        setActiveGreenhouseId("");
        setActiveGreenhouse(null);
        setGreenhouseDevices([]);
        setDeviceViewFilter("current");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load greenhouses";
      setGreenhouseLoadError(message);
      console.error("Failed to load greenhouse list:", err);
    } finally {
      setIsLoadingGreenhouses(false);
    }
  };

  // Reload Greenhouse Details & Assigned Devices whenever activeGreenhouseId changes
  useEffect(() => {
    if (!isAuthenticated || !activeGreenhouseId) return;
    loadGreenhouseData(activeGreenhouseId);
  }, [activeGreenhouseId, isAuthenticated]);

  const loadGreenhouseData = async (ghId: string, preloadedDevices?: Device[]) => {
    if (!ghId) return;
    const requestId = ++greenhouseLoadRequestRef.current;
    setGreenhouseDataError(null);
    try {
      const [overview, devs] = await Promise.all([
        fetchGreenhouseOverview(ghId),
        preloadedDevices ? Promise.resolve(preloadedDevices) : fetchDevices(),
      ]);
      if (requestId !== greenhouseLoadRequestRef.current) return;
      if (!overview) throw new Error(`Could not load ${ghId} greenhouse details`);

      if (Array.isArray(devs)) {
        setAllDevices(devs);
        if (typeof window !== "undefined") {
          localStorage.setItem("green_node_cached_devices", JSON.stringify(devs));
        }
      }
      setActiveGreenhouse(overview);
      const ghDevs = overview.devices || [];
      setGreenhouseDevices(ghDevs);
      if (typeof window !== "undefined") {
        localStorage.setItem("green_node_cached_greenhouse", JSON.stringify(overview));
        localStorage.setItem("green_node_cached_gh_devices", JSON.stringify(ghDevs));
      }

      // Preserve current focused sensor or fall back to first available sensor
      const savedDevId = typeof window !== "undefined" ? localStorage.getItem("green_node_focused_device") : null;
      const targetId = focusedDeviceIdRef.current || savedDevId;
      const ghSensors = ghDevs.filter((d) => getModuleCategory(d) === "sensor");
      const allSensors = (devs || []).filter((d) => getModuleCategory(d) === "sensor");

      const devInGh = ghSensors.find((d) => d.deviceId === targetId);
      const devInAll = allSensors.find((d) => d.deviceId === targetId);

      let chosenDeviceId: string | null = null;
      if (devInGh) {
        chosenDeviceId = devInGh.deviceId;
      } else if (deviceViewFilter === "all" && devInAll) {
        chosenDeviceId = devInAll.deviceId;
      } else if (ghSensors.length > 0) {
        chosenDeviceId = ghSensors[0].deviceId;
      } else if (devInAll) {
        chosenDeviceId = devInAll.deviceId;
      } else if (allSensors.length > 0) {
        chosenDeviceId = allSensors[0].deviceId;
      }

      if (chosenDeviceId) {
        setFocusedDeviceId(chosenDeviceId);
        if (typeof window !== "undefined") {
          localStorage.setItem("green_node_focused_device", chosenDeviceId);
        }
        await loadFocusedNodeData(chosenDeviceId);
      } else {
        setFocusedDeviceId(null);
        setFocusedLatestReading(null);
        setRecentReadings([]);
      }
    } catch (err) {
      if (requestId !== greenhouseLoadRequestRef.current) return;
      setGreenhouseDataError(err instanceof Error ? err.message : "Could not load greenhouse details");
      console.error("Failed to load greenhouse data:", err);
    }
  };

  const loadFocusedNodeData = async (devId: string) => {
    if (!devId) return;
    try {
      const [reading, readings] = await Promise.all([
        fetchLatestReading(devId),
        fetchReadings({ deviceId: devId, limit: 30, sortBy: "timestamp", sortOrder: "desc" }),
      ]);

      // Guard against stale async responses if user switched modules quickly
      if (focusedDeviceIdRef.current && focusedDeviceIdRef.current !== devId) {
        return;
      }

      const effectiveLatest = reading || (readings && readings.length > 0 ? readings[0] : null);
      if (effectiveLatest) {
        setFocusedLatestReading(effectiveLatest);
        if (typeof window !== "undefined") {
          localStorage.setItem(`green_node_latest_${devId}`, JSON.stringify(effectiveLatest));
        }
      } else {
        setFocusedLatestReading(null);
        if (typeof window !== "undefined") {
          localStorage.removeItem(`green_node_latest_${devId}`);
        }
      }

      if (readings && readings.length > 0) {
        setRecentReadings(readings);
        if (typeof window !== "undefined") {
          localStorage.setItem(`green_node_readings_${devId}`, JSON.stringify(readings));
        }
      } else if (effectiveLatest) {
        setRecentReadings([effectiveLatest]);
        if (typeof window !== "undefined") {
          localStorage.setItem(`green_node_readings_${devId}`, JSON.stringify([effectiveLatest]));
        }
      } else {
        setRecentReadings([]);
        if (typeof window !== "undefined") {
          localStorage.removeItem(`green_node_readings_${devId}`);
        }
      }
    } catch (err) {
      console.error("Error loading node telemetry:", err);
    }
  };

  const loadLogs = async () => {
    try {
      const [list, cmds] = await Promise.all([fetchLogs(50), fetchHubCommands(30)]);
      setLogs(list);
      setHubCommands(cmds);
    } catch {
      // ignore
    }
  };

  // WebSocket Connection
  const initWebSocket = (onUnexpectedClose?: () => void) => {
    const wsUrl = getWebSocketUrl();
    try {
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
      }
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.event === "new_reading" && payload.data) {
            const reading: Reading = payload.data;

            const updateDeviceItem = (dev: Device) =>
              dev.deviceId === reading.deviceId
                ? {
                    ...dev,
                    status: "online" as const,
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
                : dev;

            setGreenhouseDevices((prev) => prev.map(updateDeviceItem));
            setAllDevices((prev) => prev.map(updateDeviceItem));

            const currentFocusId = focusedDeviceIdRef.current;
            if (currentFocusId && reading.deviceId === currentFocusId) {
              setFocusedLatestReading(reading);
              setRecentReadings((prev) => {
                const nextReadings = [reading, ...prev.filter((r) => r.timestamp !== reading.timestamp)].slice(0, 30);
                if (typeof window !== "undefined") {
                  localStorage.setItem(`green_node_readings_${reading.deviceId}`, JSON.stringify(nextReadings));
                  localStorage.setItem(`green_node_latest_${reading.deviceId}`, JSON.stringify(reading));
                }
                return nextReadings;
              });
            }
          } else if (payload.event === "device_heartbeat") {
            const heartbeatDev = payload.data;
            if (heartbeatDev?.deviceId) {
              const updateHb = (dev: Device) =>
                dev.deviceId === heartbeatDev.deviceId
                  ? { ...dev, status: "online" as const, isOnline: true, lastSeen: heartbeatDev.lastSeen }
                  : dev;
              setGreenhouseDevices((prev) => prev.map(updateHb));
              setAllDevices((prev) => prev.map(updateHb));
            }
          } else if (payload.event === "device_status_changed" && payload.data?.deviceId) {
            const statusUpdate = payload.data as {
              deviceId: string;
              status: NonNullable<Device["status"]>;
              isOnline: boolean;
              lastSeen?: string;
            };
            const updateStatus = (dev: Device) =>
              dev.deviceId === statusUpdate.deviceId
                ? {
                    ...dev,
                    status: statusUpdate.status,
                    isOnline: statusUpdate.isOnline,
                    lastSeen: statusUpdate.lastSeen || dev.lastSeen,
                  }
                : dev;
            setGreenhouseDevices((prev) => prev.map(updateStatus));
            setAllDevices((prev) => prev.map(updateStatus));
          } else if (payload.event === "device_updated" && payload.data?.deviceId) {
            const updatedDev = payload.data as Device;
            const mergeUpdated = (dev: Device) =>
              dev.deviceId === updatedDev.deviceId ? { ...dev, ...updatedDev } : dev;
            setGreenhouseDevices((prev) => prev.map(mergeUpdated));
            setAllDevices((prev) => prev.map(mergeUpdated));
          } else if (
            payload.event === "device_registered" ||
            payload.event === "device_deleted" ||
            payload.event === "device_unregistered"
          ) {
            loadHierarchy();
          } else if (
            (payload.event === "hub_command_queued" || payload.event === "hub_command_updated") &&
            payload.data
          ) {
            const rec = payload.data as HubCommandRecord;
            setHubCommands((prev) => {
              const idx = prev.findIndex((c) => c.commandId === rec.commandId);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = rec;
                return next;
              }
              return [rec, ...prev].slice(0, 30);
            });
            setLiveHubCmdUpdate((prev) => ({
              seq: (prev?.seq || 0) + 1,
              record: rec,
            }));
          } else if (payload.event === "hub_commands_cleared") {
            setHubCommands([]);
            setLiveHubCmdUpdate((prev) => ({
              seq: (prev?.seq || 0) + 1,
              cleared: true,
            }));
          }
        } catch {
          // ignore parsing error
        }
      };

      ws.onclose = () => {
        if (socketRef.current === ws) {
          onUnexpectedClose?.();
        }
      };
      ws.onerror = () => {
        ws.close();
      };
    } catch {
      onUnexpectedClose?.();
    }
  };

  const handleNotify = (msg: { type: "success" | "error"; text: string }) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const handleCommandCreated = (record: HubCommandRecord) => {
    setHubCommands((prev) => {
      if (prev.some((c) => c.commandId === record.commandId)) return prev;
      return [record, ...prev].slice(0, 30);
    });
    setLiveHubCmdUpdate((prev) => ({
      seq: (prev?.seq ?? 0) + 1,
      record,
    }));
  };

  const handleCopyUuid = (uuid: string) => {
    navigator.clipboard.writeText(uuid);
    setCopiedDeviceId(uuid);
    setFeedbackMsg({ type: "success", text: `Copied UUID: ${uuid}` });
    setTimeout(() => {
      setCopiedDeviceId(null);
    }, 2500);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleDeleteDevice = async (e: React.MouseEvent, dev: Device) => {
    e.stopPropagation();
    const isActuator = getModuleCategory(dev) === "actuator";
    if (
      !confirm(
        `Are you sure you want to unregister ${isActuator ? "actuator" : "sensor module"} "${dev.name}" (${dev.deviceId})? Unregistered modules will be rejected with 403 Forbidden.`
      )
    ) {
      return;
    }
    try {
      await deleteDevice(dev.deviceId);
      if (typeof window !== "undefined") {
        localStorage.removeItem(`green_node_readings_${dev.deviceId}`);
        localStorage.removeItem(`green_node_latest_${dev.deviceId}`);
        try {
          const metaMap = getActuatorMetaMap();
          if (dev.deviceId in metaMap) {
            delete metaMap[dev.deviceId];
            localStorage.setItem("green_node_actuator_meta", JSON.stringify(metaMap));
          }
        } catch {}
        if (dev.deviceId === focusedDeviceId) {
          localStorage.removeItem("green_node_focused_device");
        }
      }
      if (dev.deviceId === focusedDeviceId) {
        setFocusedDeviceId(null);
        setFocusedLatestReading(null);
        setRecentReadings([]);
      }
      if (dev.deviceId === focusedActuatorId) {
        setFocusedActuatorId(null);
      }
      setFeedbackMsg({
        type: "success",
        text: `${isActuator ? "Actuator" : "Sensor module"} "${dev.name}" unregistered successfully.`,
      });
      setTimeout(() => setFeedbackMsg(null), 3000);
      await loadHierarchy();
    } catch (err: any) {
      alert("Failed to unregister: " + err.message);
    }
  };

  const handleClearLogs = async () => {
    if (!confirm("Are you sure you want to clear module & actuator activity logs?")) return;
    await Promise.all([clearAllLogs(), clearHubCommands()]);
    setLogs([]);
    setHubCommands([]);
    setLiveHubCmdUpdate((prev) => ({
      seq: (prev?.seq ?? 0) + 1,
      cleared: true,
    }));
  };

  type ModuleActivityEntry = {
    id: string;
    isActuator: boolean;
    deviceName: string;
    deviceTypeLabel: string;
    deviceSubLabel?: string;
    whatHappened: string;
    status: "executed" | "dispatched" | "pending" | "failed" | "warning" | "info";
    timestamp: string;
  };

  const resolveDeviceByIdentifier = (identifier?: string): Device | undefined => {
    if (!identifier) return undefined;
    const norm = identifier.toLowerCase();
    return allDevices.find(
      (d) => d.deviceId.toLowerCase() === norm || (d.subNodeId && d.subNodeId.toLowerCase() === norm)
    );
  };

  const moduleActivityEntries: ModuleActivityEntry[] = [
    ...hubCommands.map((c): ModuleActivityEntry => {
      const targetId =
        c.payload?.deviceId || c.payload?.uuid || c.payload?.snId || c.payload?.name || c.hubId || "Hub";
      const matched = resolveDeviceByIdentifier(c.payload?.deviceId || c.payload?.uuid || c.payload?.snId);
      const isActuatorDevice = matched ? getModuleCategory(matched) === "actuator" : false;
      const isActuatorCmd =
        c.type === "cmd" ||
        isActuatorDevice ||
        (c.type === "pair" && (c.payload?.kind === "actuator" || c.payload?.kind === "irrigation"));

      const deviceName =
        matched?.name ||
        (c.type === "pair" && c.payload?.name ? String(c.payload.name) : undefined) ||
        String(targetId);

      const deviceTypeLabel = matched
        ? getModuleCategory(matched) === "actuator"
          ? `Actuator • ${getActuatorMeta(matched).actuatorType}`
          : `Sensor • ${matched.sensorType || "Node"}`
        : c.type === "cmd"
        ? "Actuator"
        : c.type === "pair"
        ? String(c.payload?.kind || "Module")
        : "Hub Module";

      const subLabel =
        matched?.subNodeId ||
        (matched?.deviceId ? `${matched.deviceId.slice(0, 8)}...` : targetId !== deviceName ? String(targetId) : undefined);

      let whatHappened = c.cliString;
      if (c.type === "cmd") {
        const action = String(c.payload?.action || "").toUpperCase() || "TRIGGERED";
        const dur = action === "ON" && c.payload?.durationS ? ` (${c.payload.durationS}s)` : "";
        whatHappened = `Turned ${action}${dur}`;
      } else if (c.type === "pair") {
        whatHappened = `Pairing opened for ${c.payload?.kind || "module"} "${c.payload?.name || ""}" (${c.payload?.seconds ?? 120}s)`;
      } else if (c.type === "cfg") {
        whatHappened = `Report interval set to ${c.payload?.intervalS ?? 60}s`;
      } else if (c.type === "map") {
        whatHappened = `Mapped ${c.payload?.snId || "node"} → ${String(c.payload?.uuid || "").slice(0, 8)}...`;
      } else if (c.type === "cancel") {
        whatHappened = "Cancelled active pairing window";
      } else if (c.type === "maps") {
        whatHappened = "Requested hub node-to-UUID map";
      }

      if (c.resultMessage) {
        whatHappened = `${whatHappened} — ${c.resultMessage}`;
      }

      return {
        id: `cmd-${c.commandId}`,
        isActuator: isActuatorCmd,
        deviceName,
        deviceTypeLabel,
        deviceSubLabel: subLabel,
        whatHappened,
        status: c.status,
        timestamp: c.executedAt || c.dispatchedAt || c.createdAt,
      };
    }),
    ...logs
      .filter(
        (log) =>
          log.category === "device" &&
          !log.message.startsWith("Queued hub CLI command:") &&
          !log.message.startsWith('Hub command "')
      )
      .map((log, idx): ModuleActivityEntry => {
        const matched = resolveDeviceByIdentifier(log.deviceId);
        const isActuator = matched
          ? getModuleCategory(matched) === "actuator"
          : /actuator|fan|pump|valve|relay|irrigation/i.test(log.message);
        const deviceName = matched?.name || (log.deviceId ? `${log.deviceId.slice(0, 8)}...` : "Module");
        const deviceTypeLabel = matched
          ? getModuleCategory(matched) === "actuator"
            ? `Actuator • ${getActuatorMeta(matched).actuatorType}`
            : `Sensor • ${matched.sensorType || "Node"}`
          : isActuator
          ? "Actuator"
          : "Module";
        const status: ModuleActivityEntry["status"] =
          log.level === "error" || log.severity === "error"
            ? "failed"
            : log.level === "warn" || log.severity === "warning"
            ? "warning"
            : log.level === "success"
            ? "executed"
            : "info";

        return {
          id: `log-${log.id || idx}`,
          isActuator,
          deviceName,
          deviceTypeLabel,
          deviceSubLabel: matched?.subNodeId || (matched?.deviceId ? `${matched.deviceId.slice(0, 8)}...` : undefined),
          whatHappened: log.message,
          status,
          timestamp: log.timestamp,
        };
      }),
  ]
    .filter((entry) => (activityFilter === "actuators" ? entry.isActuator : true))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const focusedSensorDevice =
    allDevices.find((d) => d.deviceId === focusedDeviceId && getModuleCategory(d) === "sensor") ||
    null;

  if (isLoading || !isAuthenticated) {
    return null;
  }

  if (!hasConfirmedGreenhouse) {
    return (
      <div className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex flex-col font-sans">
        <header className="sticky top-0 z-30 px-4 sm:px-6 pt-3 pb-1">
          <div className="max-w-7xl mx-auto rounded-2xl border border-white/10 bg-[#0E0E12]/80 backdrop-blur-2xl shadow-xl px-5 py-3 flex items-center justify-between gap-4">
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-white">Green Node</h1>
            <nav className="flex items-center gap-5">
              <span className="text-sm font-bold text-white">Modules</span>
              <Link href="/analytics" className="text-sm font-medium text-[#8E8E93] hover:text-white transition-colors">
                Analytics
              </Link>
              <Link href="/registers" className="text-sm font-medium text-[#8E8E93] hover:text-white transition-colors">
                New Registers
              </Link>
              <Link href="/settings" title="Settings & Controls" className="text-[#A1A1A6] hover:text-white transition-colors">
                <Settings className="w-4 h-4" />
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-10 space-y-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald-400">Modules</p>
            <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-white">Choose a Greenhouse</h2>
            <p className="mt-2 text-sm text-[#8E8E93]">
              Select a greenhouse to view its sensors and actuators.
            </p>
          </div>

          {isLoadingGreenhouses ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-48 rounded-2xl bg-[#141417] border border-[#282830] animate-pulse"
                />
              ))}
            </div>
          ) : greenhouseLoadError ? (
            <div role="alert" className="rounded-2xl border border-rose-500/30 bg-[#141417] p-10 text-center">
              <h3 className="text-base font-semibold text-rose-300">Could Not Load Greenhouses</h3>
              <p className="mt-2 text-sm text-[#A1A1A6]">{greenhouseLoadError}</p>
              <button
                type="button"
                onClick={loadHierarchy}
                className="mt-5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 transition"
              >
                Retry
              </button>
            </div>
          ) : greenhouses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {greenhouses.map((greenhouse) => {
                const greenhouseModules = allDevices.filter(
                  (device) => device.greenhouseId === greenhouse.greenhouseId
                );
                const sensorCount = greenhouseModules.filter(
                  (device) => getModuleCategory(device) === "sensor"
                ).length;
                const actuatorCount = greenhouseModules.length - sensorCount;

                return (
                  <button
                    key={greenhouse.greenhouseId}
                    type="button"
                    onClick={() => {
                      greenhouseLoadRequestRef.current += 1;
                      setActiveGreenhouseId(greenhouse.greenhouseId);
                      setActiveGreenhouse(greenhouse);
                      setGreenhouseDevices([]);
                      setDeviceViewFilter("current");
                      setHasConfirmedGreenhouse(true);
                      if (typeof window !== "undefined") {
                        localStorage.setItem("green_node_active_greenhouse", greenhouse.greenhouseId);
                        localStorage.setItem("green_node_device_filter", "current");
                      }
                    }}
                    className="text-left bg-[#141417] border border-[#282830] hover:border-emerald-500/50 rounded-2xl p-6 transition-all hover:shadow-xl hover:shadow-emerald-500/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                          {greenhouse.companyName}
                        </span>
                        <h3 className="mt-1 text-xl font-bold text-white">{greenhouse.name}</h3>
                        <p className="mt-1 text-sm text-[#8E8E93]">{greenhouse.companyLocation}</p>
                      </div>
                      <Activity className="w-5 h-5 text-emerald-400 shrink-0" />
                    </div>
                    <p className="mt-4 text-sm text-[#A1A1A6]">
                      Crop: <span className="font-medium text-white">{greenhouse.plant}</span>
                    </p>
                    <div className="mt-5 flex items-center gap-4 border-t border-[#282830] pt-4 text-xs">
                      <span className="text-emerald-300">{sensorCount} Sensors</span>
                      <span className="text-cyan-300">{actuatorCount} Actuators</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-[#282830] bg-[#141417] p-10 text-center">
              <h3 className="text-base font-semibold text-white">No Greenhouses Registered</h3>
              <p className="mt-2 text-sm text-[#8E8E93]">Register a greenhouse before managing its modules.</p>
              <Link
                href="/registers"
                className="mt-5 inline-flex rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 transition"
              >
                Register Greenhouse
              </Link>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex flex-col font-sans">
      {/* Feedback Toast */}
      {feedbackMsg && (
        <div
          className={`fixed top-5 right-5 z-50 bg-[#141417] border px-4 py-2.5 rounded-xl text-xs font-medium shadow-2xl flex items-center space-x-2 animate-in fade-in duration-200 ${
            feedbackMsg.type === "error"
              ? "border-rose-500/40 text-rose-400"
              : "border-[#282830] text-emerald-400"
          }`}
        >
          {feedbackMsg.type === "error" ? (
            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Top Glass Navbar */}
      <header className="sticky top-0 z-30 px-4 sm:px-6 pt-3 pb-1 pointer-events-none">
        <div className="pointer-events-auto max-w-7xl mx-auto rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] bg-[#0E0E12]/65 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-white/[0.06] px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            {/* Section 1: Brand Title */}
            <div className="flex items-center">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight text-white">
                Green Node
              </h1>
            </div>

            {/* Section 2: Primary Navigation (Modern Underline Design) */}
            <nav className="flex items-center gap-7">
              <Link
                href="/"
                className="group relative py-1.5 text-sm font-bold text-white transition-colors"
              >
                <span>Modules</span>
                <span className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 shadow-[0_0_12px_rgba(52,211,153,0.75)]" />
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

            {/* Section 3: Settings */}
            <div className="flex items-center">
              <Link
                href="/settings"
                title="Settings & Controls"
                className="p-2 text-[#A1A1A6] hover:text-white rounded-xl hover:bg-white/[0.06] transition flex items-center justify-center"
              >
                <Settings className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 space-y-8">
        {greenhouseDataError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            <span>{greenhouseDataError}</span>
            <button
              type="button"
              onClick={() => loadGreenhouseData(activeGreenhouseId)}
              className="font-semibold underline underline-offset-2 hover:text-white"
            >
              Retry
            </button>
          </div>
        )}

        {/* REGISTERED MODULES INVENTORY (SENSORS & ACTUATORS) */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex flex-wrap items-center gap-2.5">
                <Cpu className="w-6 h-6 text-emerald-400" />
                <span>Registered Modules</span>
                <span className="text-sm px-3 py-1 rounded-full font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {allDevices.filter((d) => getModuleCategory(d) === "sensor").length} Sensor
                  {allDevices.filter((d) => getModuleCategory(d) === "sensor").length !== 1 ? "s" : ""}
                </span>
                <span className="text-sm px-3 py-1 rounded-full font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  {allDevices.filter((d) => getModuleCategory(d) === "actuator").length} Actuator
                  {allDevices.filter((d) => getModuleCategory(d) === "actuator").length !== 1 ? "s" : ""}
                </span>
              </h3>
            </div>

            {/* Filter Toggle & Register Action */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2">
                <span className="text-xs font-medium text-[#A1A1A6]">Greenhouse</span>
                <span className="text-sm font-semibold text-emerald-300">
                  {activeGreenhouse?.name || "Selected Greenhouse"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  greenhouseLoadRequestRef.current += 1;
                  setHasConfirmedGreenhouse(false);
                }}
                className="px-3.5 py-2 rounded-xl border border-[#282830] bg-[#141417] text-sm font-medium text-[#A1A1A6] hover:text-white transition"
              >
                Change Greenhouse
              </button>

              <div className="flex items-center bg-[#141417] border border-[#282830] rounded-xl p-1 text-sm">
                <button
                  type="button"
                  onClick={() => setModuleCategoryFilter("all")}
                  className={`px-3.5 py-2 rounded-lg font-medium transition ${
                    moduleCategoryFilter === "all"
                      ? "bg-[#282832] text-white shadow-sm"
                      : "text-[#A1A1A6] hover:text-white"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setModuleCategoryFilter("sensor")}
                  className={`px-3.5 py-2 rounded-lg font-medium transition ${
                    moduleCategoryFilter === "sensor"
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "text-[#A1A1A6] hover:text-white"
                  }`}
                >
                  Sensors
                </button>
                <button
                  type="button"
                  onClick={() => setModuleCategoryFilter("actuator")}
                  className={`px-3.5 py-2 rounded-lg font-medium transition ${
                    moduleCategoryFilter === "actuator"
                      ? "bg-cyan-500 text-white shadow-sm"
                      : "text-[#A1A1A6] hover:text-white"
                  }`}
                >
                  Actuators
                </button>
              </div>

              <div className="flex items-center bg-[#141417] border border-[#282830] rounded-xl p-1 text-sm">
                <button
                  type="button"
                  disabled={!activeGreenhouseId}
                  onClick={() => {
                    setDeviceViewFilter("all");
                    if (typeof window !== "undefined") {
                      localStorage.setItem("green_node_device_filter", "all");
                    }
                  }}
                  className={`px-3.5 py-2 rounded-lg font-medium transition ${
                    deviceViewFilter === "all"
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "text-[#A1A1A6] hover:text-white"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  All Registered ({allDevices.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeviceViewFilter("current");
                    if (typeof window !== "undefined") {
                      localStorage.setItem("green_node_device_filter", "current");
                    }
                  }}
                  className={`px-3.5 py-2 rounded-lg font-medium transition ${
                    deviceViewFilter === "current"
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "text-[#A1A1A6] hover:text-white"
                  }`}
                >
                  {activeGreenhouse?.name || "This Greenhouse"} ({greenhouseDevices.length})
                </button>
              </div>

              <Link
                href="/registers?tab=module"
                className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-xl text-sm font-semibold shadow-md shadow-emerald-500/20 transition flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Register Module</span>
              </Link>
            </div>
          </div>

          {/* Active Filter Notice if viewing greenhouse with 0 devices while others exist */}
          {deviceViewFilter === "current" && greenhouseDevices.length === 0 && allDevices.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5 text-xs text-amber-300 flex items-center justify-between">
              <span>
                No modules assigned to <strong>{activeGreenhouse?.name}</strong> yet, but <strong>{allDevices.length}</strong> module(s) are registered in other greenhouses.
              </span>
              <button
                onClick={() => setDeviceViewFilter("all")}
                className="underline hover:text-white font-medium ml-2"
              >
                View all {allDevices.length} modules
              </button>
            </div>
          )}

          {/* Devices Grid */}
          {(() => {
            const displayed = displayedModules;

            if (!activeGreenhouseId) {
              return (
                <div className="bg-[#141417] border border-[#282830] rounded-2xl p-12 text-center">
                  <Cpu className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                  <h4 className="text-sm font-semibold text-white">Select a Greenhouse First</h4>
                  <p className="text-xs text-[#8E8E93] max-w-md mx-auto mt-1">
                    Choose a greenhouse above to view its registered sensors and actuators.
                  </p>
                </div>
              );
            }

            if (displayed.length === 0) {
              return (
                <div className="bg-[#141417] border border-[#282830] rounded-2xl p-12 text-center">
                  <Cpu className="w-12 h-12 text-[#3E3E48] mx-auto mb-3" />
                  <h4 className="text-sm font-semibold text-white">No Modules Registered Here</h4>
                  <p className="text-xs text-[#8E8E93] max-w-md mx-auto mt-1 mb-4">
                    Register a sensor module or actuator to generate its unique UUID. Copy that UUID and paste it into the ESP32 Onboard Captive Portal (GreenNode-Setup).
                  </p>
                  <Link
                    href="/registers?tab=module"
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-sm font-medium shadow-md shadow-emerald-500/20 transition inline-flex items-center space-x-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Register Module</span>
                  </Link>
                </div>
              );
            }

            const handleSelectModule = (dev: Device) => {
              if (getModuleCategory(dev) === "actuator") {
                setFocusedActuatorId(dev.deviceId);
                return;
              }
              setFocusedDeviceId(dev.deviceId);
              if (typeof window !== "undefined") {
                localStorage.setItem("green_node_focused_device", dev.deviceId);
              }
              loadFocusedNodeData(dev.deviceId);
              if (dev.greenhouseId && dev.greenhouseId !== activeGreenhouseId) {
                setActiveGreenhouseId(dev.greenhouseId);
                if (typeof window !== "undefined") {
                  localStorage.setItem("green_node_active_greenhouse", dev.greenhouseId);
                }
              }
            };

            const renderModuleCard = (dev: Device) => {
              const isActuator = getModuleCategory(dev) === "actuator";
              const deviceStatus = getDeviceStatus(dev);
              const actuatorMeta = getActuatorMeta(dev);
              const isFocused = isActuator
                ? dev.deviceId === (selectedActuator?.deviceId || focusedActuatorId)
                : dev.deviceId === (selectedSensor?.deviceId || focusedDeviceId);
              const r = dev.latestReading || (!isActuator && isFocused ? focusedLatestReading : undefined);
              const probeLabel = isActuator
                ? `Actuator • ${actuatorMeta.actuatorType.toUpperCase()}`
                : dev.sensorType === "md0869"
                ? "All Modules + MD0869"
                : dev.sensorType === "fc28"
                ? "All Modules + FC-28"
                : dev.sensorType || "Standard Probe";

              return (
                <div
                  key={dev.deviceId}
                  onClick={() => handleSelectModule(dev)}
                  className={`bg-[#141417] border rounded-2xl p-5 cursor-pointer transition relative group ${
                    isFocused
                      ? isActuator
                        ? "border-cyan-500 shadow-xl shadow-cyan-500/15 ring-1 ring-cyan-500/40"
                        : "border-emerald-500 shadow-xl shadow-emerald-500/15 ring-1 ring-emerald-500/40"
                      : "border-[#282830] hover:border-[#3E3E48]"
                  }`}
                >
                  {/* Node Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 pr-2">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span
                          className={`text-base font-bold text-white transition ${
                            isActuator ? "group-hover:text-cyan-400" : "group-hover:text-emerald-400"
                          }`}
                        >
                          {dev.name}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded uppercase font-bold tracking-wider bg-[#202028] border ${
                            isActuator
                              ? "text-cyan-300 border-cyan-500/20"
                              : "text-emerald-400 border-emerald-500/20"
                          }`}
                        >
                          {probeLabel}
                        </span>
                      </div>

                      <div className="text-xs text-[#A1A1A6] mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-white font-medium">
                          🏛️ {deviceViewFilter === "current" ? activeGreenhouse?.name || dev.greenhouseName : dev.greenhouseName || "Greenhouse"}
                        </span>
                        <span>•</span>
                        <span className="text-emerald-400 font-medium">🌱 {dev.plant || "Crop"}</span>
                        <span>•</span>
                        <span>📍 {dev.location || "Zone 1"}</span>
                      </div>
                    </div>

                    {/* Status & Delete */}
                    <div className="flex items-center space-x-1.5 shrink-0">
                      <div
                        className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          deviceStatus === "online"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : deviceStatus === "warning"
                            ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                            : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            deviceStatus === "online"
                              ? "bg-emerald-400 animate-pulse"
                              : deviceStatus === "warning"
                              ? "bg-amber-400"
                              : "bg-rose-400"
                          }`}
                        />
                        <span>
                          {deviceStatus === "online"
                            ? "Online"
                            : deviceStatus === "warning"
                            ? "Warning"
                            : "Offline"}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleDeleteDevice(e, dev)}
                        title={`Unregister this ${isActuator ? "actuator" : "sensor module"}`}
                        className="p-1.5 rounded-lg text-[#6E6E73] hover:text-rose-400 hover:bg-rose-500/10 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Metrics or Actuator Details */}
                  {isActuator ? (
                    <div className="grid grid-cols-2 gap-2.5 pt-2.5 border-t border-[#202026]">
                      <div className="bg-[#18181D] rounded-xl p-3 text-center">
                        <span className="text-xs text-[#8E8E93] font-medium block">Actuator Type</span>
                        <span className="text-base font-bold text-cyan-300 capitalize">
                          {actuatorMeta.actuatorType}
                        </span>
                      </div>
                      <div className="bg-[#18181D] rounded-xl p-3 text-center">
                        <span className="text-xs text-[#8E8E93] font-medium block">Sub-Node ID</span>
                        <span className="text-base font-bold font-mono text-amber-300">
                          {actuatorMeta.subNodeId || "Unmapped"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5 pt-2.5 border-t border-[#202026]">
                      <div className="bg-[#18181D] rounded-xl p-3 text-center">
                        <span className="text-xs text-[#8E8E93] font-medium block">Temp</span>
                        <span className="text-lg font-bold text-emerald-400">
                          {typeof r?.temperature === "number" ? `${r.temperature.toFixed(1)}°C` : "--"}
                        </span>
                      </div>
                      <div className="bg-[#18181D] rounded-xl p-3 text-center">
                        <span className="text-xs text-[#8E8E93] font-medium block">Humidity</span>
                        <span className="text-lg font-bold text-cyan-400">
                          {typeof r?.humidity === "number" ? `${r.humidity.toFixed(1)}%` : "--"}
                        </span>
                      </div>
                      <div className="bg-[#18181D] rounded-xl p-3 text-center">
                        <span className="text-xs text-[#8E8E93] font-medium block">Soil</span>
                        <span className="text-lg font-bold text-purple-400">
                          {typeof r?.soilMoisture === "number" ? `${r.soilMoisture.toFixed(1)}%` : "--"}
                        </span>
                      </div>
                      <div className="bg-[#18181D] rounded-xl p-3 text-center">
                        <span className="text-xs text-[#8E8E93] font-medium block">Light</span>
                        <span className="text-lg font-bold text-amber-400">
                          {typeof r?.light === "number" ? `${r.light.toFixed(0)} lx` : "--"}
                        </span>
                      </div>
                    </div>
                  )}

                  {(dev.greenhouseId || activeGreenhouseId) && (
                    <div className="flex justify-end mt-3">
                      <Link
                        href={`/analytics/${encodeURIComponent(dev.greenhouseId || activeGreenhouseId)}${
                          isActuator ? "" : `?deviceId=${encodeURIComponent(dev.deviceId)}`
                        }`}
                        onClick={(event) => event.stopPropagation()}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          isActuator
                            ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                            : "border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                        }`}
                      >
                        <Activity className="w-3.5 h-3.5" />
                        Analytics
                      </Link>
                    </div>
                  )}

                  {/* Prominent Device UUID Box with 1-Click Copy */}
                  <div className="bg-[#0B0B0E] border border-[#24242C] rounded-xl p-2.5 my-3 flex items-center justify-between gap-2">
                    <div className="overflow-hidden">
                      <span className="text-xs uppercase font-bold text-[#8E8E93] tracking-wider block">
                        Provisioning UUID
                      </span>
                      <span
                        className={`text-xs font-mono font-bold select-all break-all ${
                          isActuator ? "text-cyan-300" : "text-emerald-400"
                        }`}
                      >
                        {dev.deviceId}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyUuid(dev.deviceId);
                      }}
                      title="Copy UUID to paste into ESP captive portal"
                      className="px-2.5 py-1.5 bg-[#1C1C22] hover:bg-emerald-500 hover:text-white text-[#C7C7CC] rounded-lg border border-[#303038] text-xs font-semibold shrink-0 transition flex items-center space-x-1"
                    >
                      {copiedDeviceId === dev.deviceId ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-300" />
                          <span className="text-emerald-300 font-bold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy UUID</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Footer with Wi-Fi & Action */}
                  <div className="mt-2.5 flex items-center justify-between text-xs text-[#6E6E73] pt-2 border-t border-[#1C1C22]">
                    <span className="flex items-center space-x-1.5 truncate max-w-[200px]">
                      <Wifi className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate">{r?.wifiSsid || dev.wifiSsid || "Wi-Fi Ready"}</span>
                    </span>
                    <span className={`${isActuator ? "text-cyan-400" : "text-emerald-400"} hover:underline font-medium`}>
                      {isFocused ? "Selected" : "Click to Select"}
                    </span>
                  </div>
                </div>
              );
            };

            const sensorList = displayed.filter((d) => getModuleCategory(d) === "sensor");
            const actuatorList = displayed.filter((d) => getModuleCategory(d) === "actuator");
            const selectedSensor =
              sensorList.find((d) => d.deviceId === focusedDeviceId) || sensorList[0] || null;
            const selectedActuator =
              actuatorList.find((d) => d.deviceId === focusedActuatorId) || actuatorList[0] || null;

            return (
              <div className="space-y-8">
                {/* 1. SENSOR MODULE REGISTRATIONS */}
                {moduleCategoryFilter !== "actuator" && (
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2 text-sm font-semibold text-emerald-400 uppercase tracking-wider">
                      <Cpu className="w-4 h-4" />
                      <span>Sensor Module Registrations ({sensorList.length})</span>
                    </div>

                    {sensorList.length === 0 ? (
                      <div className="bg-[#141417] border border-[#282830] rounded-2xl p-8 text-center">
                        <p className="text-sm text-[#8E8E93]">No sensor modules registered in this view.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                        {/* Left Column: List of sensors */}
                        <div className="lg:col-span-4 bg-[#141417] border border-[#282830] rounded-2xl p-3 space-y-2 max-h-[560px] overflow-y-auto">
                          {sensorList.map((dev) => {
                            const isSelected = selectedSensor?.deviceId === dev.deviceId;
                            return (
                              <button
                                key={dev.deviceId}
                                type="button"
                                onClick={() => handleSelectModule(dev)}
                                className={`w-full flex items-center justify-between gap-2 text-left px-4 py-3 rounded-xl text-base font-medium transition border ${
                                  isSelected
                                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                                    : "bg-[#18181D] text-white border-transparent hover:border-[#3E3E48] hover:bg-[#1E1E25]"
                                }`}
                              >
                                <span className="truncate">{dev.name}</span>
                                <span
                                  title={getDeviceStatus(dev)}
                                  aria-label={getDeviceStatus(dev)}
                                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                    getDeviceStatus(dev) === "online"
                                      ? "bg-emerald-400"
                                      : getDeviceStatus(dev) === "warning"
                                      ? "bg-amber-400"
                                      : "bg-rose-500"
                                  }`}
                                />
                              </button>
                            );
                          })}
                        </div>

                        {/* Right Column: Selected sensor details */}
                        <div className="lg:col-span-8">
                          {selectedSensor ? renderModuleCard(selectedSensor) : null}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. ACTUATOR REGISTRATIONS */}
                {moduleCategoryFilter !== "sensor" && (
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2 text-sm font-semibold text-cyan-300 uppercase tracking-wider">
                      <Power className="w-4 h-4" />
                      <span>Actuator Registrations ({actuatorList.length})</span>
                    </div>

                    {actuatorList.length === 0 ? (
                      <div className="bg-[#141417] border border-[#282830] rounded-2xl p-8 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center space-x-3">
                          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
                            <Power className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">No Actuators Registered</p>
                            <p className="text-xs text-[#8E8E93]">
                              Register an actuator module in New Registers to see and manage it here.
                            </p>
                          </div>
                        </div>
                        <Link
                          href="/registers?tab=module&category=actuator"
                          className="px-4 py-2 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 rounded-xl text-sm font-semibold transition inline-flex items-center space-x-1.5"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Register Actuator</span>
                        </Link>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                        {/* Left Column: List of actuators */}
                        <div className="lg:col-span-4 bg-[#141417] border border-[#282830] rounded-2xl p-3 space-y-2 max-h-[560px] overflow-y-auto">
                          {actuatorList.map((dev) => {
                            const isSelected = selectedActuator?.deviceId === dev.deviceId;
                            return (
                              <button
                                key={dev.deviceId}
                                type="button"
                                onClick={() => setFocusedActuatorId(dev.deviceId)}
                                className={`w-full flex items-center justify-between gap-2 text-left px-4 py-3 rounded-xl text-base font-medium transition border ${
                                  isSelected
                                    ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40"
                                    : "bg-[#18181D] text-white border-transparent hover:border-[#3E3E48] hover:bg-[#1E1E25]"
                                }`}
                              >
                                <span className="truncate">{dev.name}</span>
                                <span
                                  title={getDeviceStatus(dev)}
                                  aria-label={getDeviceStatus(dev)}
                                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                    getDeviceStatus(dev) === "online"
                                      ? "bg-emerald-400"
                                      : getDeviceStatus(dev) === "warning"
                                      ? "bg-amber-400"
                                      : "bg-rose-500"
                                  }`}
                                />
                              </button>
                            );
                          })}
                        </div>

                        {/* Middle Column: Selected actuator details */}
                        <div className="lg:col-span-4">
                          {selectedActuator ? renderModuleCard(selectedActuator) : null}
                        </div>

                        {/* Right Column: Actuator Power Control & Report Interval Config */}
                        <div className="lg:col-span-4">
                          {selectedActuator ? (
                            <ActuatorQuickControls
                              defaultSubNodeId={getActuatorMeta(selectedActuator).subNodeId}
                              onNotify={handleNotify}
                              onCommandCreated={handleCommandCreated}
                            />
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          {/* 3. SUB-NODE PAIRING WINDOW & 4. SUB-NODE TO DASHBOARD UUID MAP */}
          <SubNodePairingAndMap
            devices={greenhouseDevices}
            greenhouseName={activeGreenhouse?.name}
            focusedDeviceId={focusedDeviceId}
            liveCommandUpdate={liveHubCmdUpdate}
            onNotify={handleNotify}
            onCommandCreated={handleCommandCreated}
          />
        </section>

        {/* HUB CLI & ACTUATOR CONTROL PANEL */}
        <HubCommandPanel
          liveCommandUpdate={liveHubCmdUpdate}
          onNotify={handleNotify}
          onCleared={() => {
            setHubCommands([]);
            setLiveHubCmdUpdate((prev) => ({
              seq: (prev?.seq ?? 0) + 1,
              cleared: true,
            }));
          }}
        />

        {/* Live Feed Table & Logs Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Live Ingestion Feed */}
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white flex items-center space-x-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>
                  Live Feed (
                  {focusedSensorDevice
                    ? `${focusedSensorDevice.name} • ${focusedSensorDevice.plant || activeGreenhouse?.plant || "Crop"}`
                    : `${activeGreenhouse?.name || "Modules"} - ${activeGreenhouse?.plant || "Crop"}`}
                  )
                </span>
              </h3>
              <span className="text-xs text-[#8E8E93]">
                {recentReadings.length} Ingested Packets
              </span>
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#24242A] text-[#8E8E93] text-xs uppercase tracking-wider">
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
                      <td className="py-2.5 px-3 text-[#A1A1A6] whitespace-nowrap text-xs">
                        {new Date(r.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 text-cyan-300 font-mono text-xs">
                        {r.wifiSsid || "--"}
                      </td>
                      <td className="py-2.5 px-3 text-emerald-400 font-medium">
                        {typeof r.temperature === "number" ? `${r.temperature.toFixed(1)}°C` : "--"}
                      </td>
                      <td className="py-2.5 px-3 text-cyan-400 font-medium">
                        {typeof r.humidity === "number" ? `${r.humidity.toFixed(1)}%` : "--"}
                      </td>
                      <td className="py-2.5 px-3 text-purple-400 font-medium">
                        {typeof r.soilMoisture === "number" ? `${r.soilMoisture.toFixed(1)}%` : "--"}
                      </td>
                      <td className="py-2.5 px-3 text-amber-400 font-medium">
                        {typeof r.light === "number" ? `${r.light.toFixed(0)} lx` : "--"}
                      </td>
                    </tr>
                  ))}
                  {recentReadings.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[#6E6E73] text-sm">
                        No telemetry packets for this module yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Module & Actuator Activity Log */}
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-6 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="text-base font-semibold text-white flex items-center space-x-2">
                <Power className="w-4 h-4 text-amber-400" />
                <span>Module &amp; Actuator Activity Log</span>
              </h3>
              <div className="flex items-center space-x-2">
                <div className="inline-flex rounded-lg bg-[#0E0E12] border border-[#24242C] p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setActivityFilter("all")}
                    className={`px-2.5 py-1 rounded-md transition ${
                      activityFilter === "all"
                        ? "bg-[#24242E] text-white font-medium"
                        : "text-[#8E8E93] hover:text-white"
                    }`}
                  >
                    All Modules
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter("actuators")}
                    className={`px-2.5 py-1 rounded-md transition ${
                      activityFilter === "actuators"
                        ? "bg-amber-500/20 text-amber-300 font-medium"
                        : "text-[#8E8E93] hover:text-white"
                    }`}
                  >
                    Actuators
                  </button>
                </div>
                <button
                  onClick={loadLogs}
                  className="p-1.5 hover:text-white text-[#8E8E93] transition"
                  title="Refresh module activity"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={handleClearLogs}
                  className="p-1.5 hover:text-rose-400 text-[#8E8E93] transition"
                  title="Clear activity logs"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#24242A] text-[#8E8E93] text-xs uppercase tracking-wider">
                    <th className="py-2.5 px-3">Device</th>
                    <th className="py-2.5 px-3">What Happened</th>
                    <th className="py-2.5 px-3 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#202026]">
                  {moduleActivityEntries.slice(0, 7).map((entry) => (
                    <tr key={entry.id} className="hover:bg-[#1A1A20] transition">
                      <td className="py-2.5 px-3 align-top">
                        <div className="flex flex-col">
                          <span className="text-white font-medium truncate max-w-[160px]" title={entry.deviceName}>
                            {entry.deviceName}
                          </span>
                          <div className="flex items-center space-x-1.5 mt-1">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                entry.isActuator
                                  ? "bg-amber-500/10 text-amber-300"
                                  : "bg-cyan-500/10 text-cyan-300"
                              }`}
                            >
                              {entry.deviceTypeLabel}
                            </span>
                            {entry.deviceSubLabel && (
                              <span className="text-xs font-mono text-[#6E6E73]">
                                {entry.deviceSubLabel}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 align-top">
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[#D1D1D6] text-xs line-clamp-2 max-w-[260px]" title={entry.whatHappened}>
                            {entry.whatHappened}
                          </span>
                          <div>
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase ${
                                entry.status === "failed"
                                  ? "bg-rose-500/10 text-rose-400"
                                  : entry.status === "warning" || entry.status === "pending"
                                  ? "bg-amber-500/10 text-amber-400"
                                  : entry.status === "dispatched"
                                  ? "bg-cyan-500/10 text-cyan-300"
                                  : "bg-emerald-500/10 text-emerald-400"
                              }`}
                            >
                              {entry.status}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td
                        className="py-2.5 px-3 text-[#6E6E73] text-xs whitespace-nowrap text-right align-top"
                        title={new Date(entry.timestamp).toLocaleString()}
                      >
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                  {moduleActivityEntries.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-[#6E6E73] text-sm">
                        {activityFilter === "actuators"
                          ? "No actuator activity recorded yet."
                          : "No module or actuator activity recorded yet."}
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
        Green Node IoT Monitoring Hub • Company &amp; Greenhouse Cluster Architecture
      </footer>
    </div>
  );
}
