"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  fetchCompanies,
  createCompany,
  fetchGreenhouses,
  fetchGreenhouseOverview,
  createGreenhouse,
  assignDeviceToGreenhouse,
  fetchDevices,
  registerDevice,
  deleteDevice,
  fetchReadings,
  fetchLatestReading,
  fetchStats,
  fetchLogs,
  clearAllLogs,
  fetchHubCommands,
  clearHubCommands,
  pingDevice,
  pingKeepAlive,
  sendTestReading,
  getWebSocketUrl,
  getBackendUrl,
  setBackendUrl,
  Company,
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
  Leaf,
  Cpu,
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
  Tag,
  Power,
} from "lucide-react";

export default function DashboardPage() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();

  // Hierarchy State
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("green_node_selected_company") || "all";
    }
    return "all";
  });
  const [greenhouses, setGreenhouses] = useState<Greenhouse[]>([]);
  const [activeGreenhouseId, setActiveGreenhouseId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("green_node_active_greenhouse") || "";
    }
    return "";
  });
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
    return "all";
  });
  const [copiedDeviceId, setCopiedDeviceId] = useState<string | null>(null);
  const [focusedActuatorId, setFocusedActuatorId] = useState<string | null>(null);
  const [moduleCategoryFilter, setModuleCategoryFilter] = useState<"all" | "sensor" | "actuator">("all");
  const [registerModuleTab, setRegisterModuleTab] = useState<"sensor" | "actuator">("sensor");

  // Active Device Drilldown (Optional focus on a specific node within greenhouse)
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
  const [statsData, setStatsData] = useState<any>(null);

  // System & Connection State
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [hubCommands, setHubCommands] = useState<HubCommandRecord[]>([]);
  const [activityFilter, setActivityFilter] = useState<"all" | "actuators">("all");
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [backendStatus, setBackendStatus] = useState<"connected" | "sleeping" | "checking">("checking");
  const [backendLatency, setBackendLatency] = useState<number | null>(null);

  // Modals
  const [showRegisterModal, setShowRegisterModal] = useState<boolean>(false);
  const [showNewCompanyModal, setShowNewCompanyModal] = useState<boolean>(false);
  const [showNewGreenhouseModal, setShowNewGreenhouseModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showProvisionedSuccess, setShowProvisionedSuccess] = useState<{
    deviceId: string;
    name: string;
    greenhouseName: string;
    companyLocation: string;
    plant: string;
    moduleCategory: "sensor" | "actuator";
  } | null>(null);

  // Form inputs for Company Registration
  const [newCompanyName, setNewCompanyName] = useState<string>("");
  const [newCompanyLocation, setNewCompanyLocation] = useState<string>("");
  const [newCompanyDescription, setNewCompanyDescription] = useState<string>("");
  const [isCreatingCompany, setIsCreatingCompany] = useState<boolean>(false);

  // Form inputs for Greenhouse Registration (Under Registered Company)
  const [newGhCompanyId, setNewGhCompanyId] = useState<string>("");
  const [newGhName, setNewGhName] = useState<string>("");
  const [newGhPlant, setNewGhPlant] = useState<string>("Heirloom Tomatoes");
  const [newGhDescription, setNewGhDescription] = useState<string>("");
  const [isCreatingGh, setIsCreatingGh] = useState<boolean>(false);

  // Form inputs for Module Registration (Sensor & Actuator)
  const [newDeviceName, setNewDeviceName] = useState<string>("");
  const [newDeviceGreenhouseId, setNewDeviceGreenhouseId] = useState<string>("greenhouse-01");
  const [newDeviceLocation, setNewDeviceLocation] = useState<string>("Zone 1 - Main Bed");
  const [newDeviceSensorType, setNewDeviceSensorType] = useState<string>("fc28");
  const [newDeviceActuatorType, setNewDeviceActuatorType] = useState<string>("fan");
  const [newDeviceSubNodeId, setNewDeviceSubNodeId] = useState<string>("");
  const [newDeviceId, setNewDeviceId] = useState<string>("");
  const [isRegistering, setIsRegistering] = useState<boolean>(false);

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
    const meta = getActuatorMetaMap()[dev.deviceId];
    return meta?.moduleCategory === "actuator" ? "actuator" : "sensor";
  };

  const getActuatorMeta = (dev: Device): { actuatorType: string; subNodeId?: string } => {
    const meta = getActuatorMetaMap()[dev.deviceId];
    return {
      actuatorType: dev.actuatorType || meta?.actuatorType || "fan",
      subNodeId: dev.subNodeId || meta?.subNodeId,
    };
  };

  // Settings & Utilities
  const [apiUrlInput, setApiUrlInput] = useState<string>("");
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copiedUuid, setCopiedUuid] = useState<boolean>(false);
  const [liveHubCmdUpdate, setLiveHubCmdUpdate] = useState<{
    seq: number;
    record?: HubCommandRecord;
    cleared?: boolean;
  } | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const focusedDeviceIdRef = useRef<string | null>(focusedDeviceId);
  const hasUserSelectedModuleRef = useRef<boolean>(false);

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

  // Default-select the top list item on initial load or when the current selection is filtered out
  useEffect(() => {
    if (displayedModules.length === 0) return;
    const topDevice = displayedModules[0];
    const inList = displayedModules.some((d) => d.deviceId === focusedDeviceId);

    if ((!hasUserSelectedModuleRef.current || !inList) && focusedDeviceId !== topDevice.deviceId) {
      setFocusedDeviceId(topDevice.deviceId);
      if (typeof window !== "undefined") {
        localStorage.setItem("green_node_focused_device", topDevice.deviceId);
      }
      loadFocusedNodeData(topDevice.deviceId);
    }
  }, [displayedModules, focusedDeviceId]);

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
    loadHierarchy();
    loadLogs();

    const keepAliveTimer = setInterval(() => {
      checkBackendHealth();
    }, 10 * 60 * 1000);

    return () => clearInterval(keepAliveTimer);
  }, [isAuthenticated]);

  const loadHierarchy = async () => {
    try {
      const [comps, ghs, devs] = await Promise.all([fetchCompanies(), fetchGreenhouses(), fetchDevices()]);
      setCompanies(comps);
      setGreenhouses(ghs);
      if (devs && devs.length > 0) {
        setAllDevices(devs);
        if (typeof window !== "undefined") {
          localStorage.setItem("green_node_cached_devices", JSON.stringify(devs));
        }
      }

      if (comps.length > 0 && !newGhCompanyId) {
        setNewGhCompanyId(comps[0].companyId);
      }

      if (ghs.length > 0) {
        const savedGh = typeof window !== "undefined" ? localStorage.getItem("green_node_active_greenhouse") : null;
        const targetGhId = savedGh && ghs.some((g) => g.greenhouseId === savedGh) ? savedGh : ghs[0].greenhouseId;
        setActiveGreenhouseId(targetGhId);
        if (typeof window !== "undefined") {
          localStorage.setItem("green_node_active_greenhouse", targetGhId);
        }
        loadGreenhouseData(targetGhId);
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
    if (!ghId) return;
    try {
      const [overview, devs] = await Promise.all([
        fetchGreenhouseOverview(ghId),
        fetchDevices(),
      ]);
      if (devs && devs.length > 0) {
        setAllDevices(devs);
        if (typeof window !== "undefined") {
          localStorage.setItem("green_node_cached_devices", JSON.stringify(devs));
        }
      }
      if (overview) {
        setActiveGreenhouse(overview);
        const ghDevs = overview.devices || [];
        setGreenhouseDevices(ghDevs);
        if (typeof window !== "undefined") {
          localStorage.setItem("green_node_cached_greenhouse", JSON.stringify(overview));
          localStorage.setItem("green_node_cached_gh_devices", JSON.stringify(ghDevs));
        }

        // Preserve current focused device or restore saved device if valid
        const savedDevId = typeof window !== "undefined" ? localStorage.getItem("green_node_focused_device") : null;
        const targetId = focusedDeviceId || savedDevId;

        const devInGh = ghDevs.find((d) => d.deviceId === targetId);
        const devInAll = devs?.find((d) => d.deviceId === targetId);

        let chosenDeviceId: string | null = null;
        if (devInGh) {
          chosenDeviceId = devInGh.deviceId;
        } else if (ghDevs.length > 0) {
          chosenDeviceId = ghDevs[0].deviceId;
        } else if (devInAll) {
          chosenDeviceId = devInAll.deviceId;
        } else if (devs && devs.length > 0) {
          chosenDeviceId = devs[0].deviceId;
        }

        if (chosenDeviceId) {
          setFocusedDeviceId(chosenDeviceId);
          if (typeof window !== "undefined") {
            localStorage.setItem("green_node_focused_device", chosenDeviceId);
          }
          await loadFocusedNodeData(chosenDeviceId);
        }
      }
    } catch (err) {
      console.error("Failed to load greenhouse data:", err);
    }
  };

  const loadFocusedNodeData = async (devId: string) => {
    if (!devId) return;
    try {
      const [reading, stats, readings] = await Promise.all([
        fetchLatestReading(devId),
        fetchStats(devId, 24, activeGreenhouseId),
        fetchReadings({ deviceId: devId, limit: 30, sortBy: "timestamp", sortOrder: "desc" }),
      ]);

      const effectiveLatest = reading || (readings && readings.length > 0 ? readings[0] : null);
      if (effectiveLatest) {
        setFocusedLatestReading(effectiveLatest);
        if (typeof window !== "undefined") {
          localStorage.setItem(`green_node_latest_${devId}`, JSON.stringify(effectiveLatest));
        }
      }

      if (readings && readings.length > 0) {
        setRecentReadings(readings);
        if (typeof window !== "undefined") {
          localStorage.setItem(`green_node_readings_${devId}`, JSON.stringify(readings));
        }
      } else if (effectiveLatest) {
        setRecentReadings((prev) => (prev.length > 0 ? prev : [effectiveLatest]));
        if (typeof window !== "undefined") {
          localStorage.setItem(`green_node_readings_${devId}`, JSON.stringify([effectiveLatest]));
        }
      }

      if (stats) {
        setStatsData(stats);
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
            if (!currentFocusId || reading.deviceId === currentFocusId) {
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

      ws.onclose = () => setWsConnected(false);
      ws.onerror = () => setWsConnected(false);
    } catch {
      setWsConnected(false);
    }
  };

  // 1. Handle Registering a New Company
  const handleRegisterCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingCompany(true);
    try {
      const company = await createCompany({
        name: newCompanyName.trim(),
        location: newCompanyLocation.trim(),
        description: newCompanyDescription.trim() || undefined,
      });

      setShowNewCompanyModal(false);
      setNewCompanyName("");
      setNewCompanyLocation("");
      setNewCompanyDescription("");

      const comps = await fetchCompanies();
      setCompanies(comps);
      setSelectedCompanyId(company.companyId);
      setNewGhCompanyId(company.companyId);

      setFeedbackMsg({
        type: "success",
        text: `Company "${company.name}" registered at "${company.location}"!`,
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      alert(err.message || "Failed to register company");
    } finally {
      setIsCreatingCompany(false);
    }
  };

  // 2. Handle Registering a Greenhouse (Under Registered Company, with Plant)
  const handleCreateGreenhouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGhCompanyId) {
      alert("Please select or register a Company first!");
      return;
    }
    setIsCreatingGh(true);
    try {
      const gh = await createGreenhouse({
        companyId: newGhCompanyId,
        name: newGhName.trim(),
        plant: newGhPlant.trim(),
        description: newGhDescription.trim() || undefined,
      });

      setShowNewGreenhouseModal(false);
      setNewGhName("");
      setNewGhPlant("Heirloom Tomatoes");
      setNewGhDescription("");

      await loadHierarchy();
      setActiveGreenhouseId(gh.greenhouseId);
      setFeedbackMsg({
        type: "success",
        text: `Greenhouse "${gh.name}" (Crop: ${gh.plant}) created under ${gh.companyName}!`,
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      alert(err.message || "Failed to create greenhouse");
    } finally {
      setIsCreatingGh(false);
    }
  };

  // 3. Handle Registering a Module (Sensor Module or Actuator)
  const handleRegisterDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegistering(true);
    try {
      const isActuator = registerModuleTab === "actuator";
      const selectedGh = greenhouses.find((g) => g.greenhouseId === newDeviceGreenhouseId);
      const company = selectedGh?.companyLocation || "Main Facility";
      const ghName = selectedGh?.name || "Greenhouse";
      const plant = selectedGh?.plant || "Crops";

      const dev = await registerDevice({
        deviceId: newDeviceId.trim() || undefined,
        name: newDeviceName.trim(),
        greenhouseId: newDeviceGreenhouseId,
        moduleCategory: registerModuleTab,
        sensorType: isActuator ? "generic" : newDeviceSensorType,
        actuatorType: isActuator ? newDeviceActuatorType : undefined,
        subNodeId: isActuator && newDeviceSubNodeId.trim() ? newDeviceSubNodeId.trim() : undefined,
        location: newDeviceLocation.trim() || "Zone 1",
      });

      if (typeof window !== "undefined") {
        const metaMap = getActuatorMetaMap();
        if (isActuator) {
          metaMap[dev.deviceId] = {
            moduleCategory: "actuator",
            actuatorType: newDeviceActuatorType,
            subNodeId: newDeviceSubNodeId.trim() || undefined,
          };
        } else {
          delete metaMap[dev.deviceId];
        }
        localStorage.setItem("green_node_actuator_meta", JSON.stringify(metaMap));
      }

      setShowRegisterModal(false);
      setNewDeviceName("");
      setNewDeviceId("");
      setNewDeviceSubNodeId("");
      setNewDeviceLocation("Zone 1 - Main Bed");

      await loadHierarchy();
      await loadGreenhouseData(newDeviceGreenhouseId);
      setActiveGreenhouseId(newDeviceGreenhouseId);
      setFocusedDeviceId(dev.deviceId);
      if (typeof window !== "undefined") {
        localStorage.setItem("green_node_active_greenhouse", newDeviceGreenhouseId);
        localStorage.setItem("green_node_focused_device", dev.deviceId);
      }
      await loadFocusedNodeData(dev.deviceId);

      setShowProvisionedSuccess({
        deviceId: dev.deviceId,
        name: dev.name,
        greenhouseName: ghName,
        companyLocation: company,
        plant,
        moduleCategory: registerModuleTab,
      });

      setFeedbackMsg({
        type: "success",
        text: `${isActuator ? "Actuator" : "Sensor Module"} "${dev.name}" registered to ${ghName}!`,
      });
      setTimeout(() => setFeedbackMsg(null), 5000);
    } catch (err: any) {
      alert(err.message || "Registration failed");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleCopyUuid = (uuid: string) => {
    navigator.clipboard.writeText(uuid);
    setCopiedUuid(true);
    setCopiedDeviceId(uuid);
    setFeedbackMsg({ type: "success", text: `Copied UUID: ${uuid}` });
    setTimeout(() => {
      setCopiedUuid(false);
      setCopiedDeviceId(null);
    }, 2500);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleDeleteDevice = async (e: React.MouseEvent, dev: Device) => {
    e.stopPropagation();
    if (
      !confirm(
        `Are you sure you want to unregister sensor module "${dev.name}" (${dev.deviceId})? Unregistered modules will be rejected with 403 Forbidden.`
      )
    ) {
      return;
    }
    try {
      await deleteDevice(dev.deviceId);
      if (dev.deviceId === focusedDeviceId) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("green_node_focused_device");
          localStorage.removeItem(`green_node_readings_${dev.deviceId}`);
          localStorage.removeItem(`green_node_latest_${dev.deviceId}`);
        }
      }
      setFeedbackMsg({
        type: "success",
        text: `Sensor module "${dev.name}" unregistered successfully.`,
      });
      setTimeout(() => setFeedbackMsg(null), 3000);
      await loadHierarchy();
      if (activeGreenhouseId) {
        await loadGreenhouseData(activeGreenhouseId);
      }
    } catch (err: any) {
      alert("Failed to unregister: " + err.message);
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
    if (!focusedDeviceId) {
      alert("Please register or select a sensor module in this greenhouse first.");
      return;
    }
    try {
      const targetDevId = focusedDeviceId;
      await sendTestReading({
        deviceId: targetDevId,
        temperature: parseFloat((23 + Math.random() * 5).toFixed(2)),
        humidity: parseFloat((55 + Math.random() * 15).toFixed(2)),
        soilMoisture: parseFloat((45 + Math.random() * 25).toFixed(2)),
        light: parseFloat((450 + Math.random() * 400).toFixed(1)),
        espTemperature: parseFloat((37 + Math.random() * 8).toFixed(2)),
        wifiSsid: "Greenhouse_IoT_2.4G",
        timestamp: new Date().toISOString(),
        metadata: { chip: "esp32-c3-supermini", rssi: -62 },
      });
      await loadFocusedNodeData(targetDevId);
      await loadGreenhouseData(activeGreenhouseId);
      loadLogs();
      setFeedbackMsg({ type: "success", text: "Sample telemetry ingested & verified!" });
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (err: any) {
      alert("Telemetry rejected: " + err.message);
    }
  };

  const handleClearLogs = async () => {
    if (!confirm("Are you sure you want to clear module & actuator activity logs?")) return;
    await Promise.all([clearAllLogs(), clearHubCommands()]);
    setLogs([]);
    setHubCommands([]);
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

  // Filter Greenhouses by selected Company
  const filteredGreenhouses =
    selectedCompanyId === "all"
      ? greenhouses
      : greenhouses.filter((g) => g.companyId === selectedCompanyId);

  if (isLoading || !isAuthenticated) {
    return null;
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
                  }`}
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

            const selectedModule =
              displayed.find((d) => d.deviceId === focusedDeviceId) || displayed[0] || null;

            const handleSelectModule = (dev: Device) => {
              hasUserSelectedModuleRef.current = true;
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
              const actuatorMeta = getActuatorMeta(dev);
              const isFocused = dev.deviceId === focusedDeviceId;
              const r = dev.latestReading || (isFocused ? focusedLatestReading : undefined);
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
                        <span className="text-white font-medium">🏛️ {dev.greenhouseName || "Greenhouse"}</span>
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
                          dev.isOnline
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : r
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            : "bg-amber-500/10 text-amber-300 border-amber-500/20"
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            dev.isOnline
                              ? "bg-emerald-400 animate-pulse"
                              : r
                              ? "bg-rose-400"
                              : "bg-amber-400"
                          }`}
                        />
                        <span>{dev.isOnline ? "Online" : r ? "Offline" : "Pending Sync"}</span>
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
                          {r?.temperature !== undefined ? `${r.temperature.toFixed(1)}°C` : "--"}
                        </span>
                      </div>
                      <div className="bg-[#18181D] rounded-xl p-3 text-center">
                        <span className="text-xs text-[#8E8E93] font-medium block">Humidity</span>
                        <span className="text-lg font-bold text-cyan-400">
                          {r?.humidity !== undefined ? `${r.humidity.toFixed(1)}%` : "--"}
                        </span>
                      </div>
                      <div className="bg-[#18181D] rounded-xl p-3 text-center">
                        <span className="text-xs text-[#8E8E93] font-medium block">Soil</span>
                        <span className="text-lg font-bold text-purple-400">
                          {r?.soilMoisture !== undefined ? `${r.soilMoisture.toFixed(1)}%` : "--"}
                        </span>
                      </div>
                      <div className="bg-[#18181D] rounded-xl p-3 text-center">
                        <span className="text-xs text-[#8E8E93] font-medium block">Light</span>
                        <span className="text-lg font-bold text-amber-400">
                          {r?.light !== undefined ? `${r.light.toFixed(0)} lx` : "--"}
                        </span>
                      </div>
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
                      {isFocused ? "Selected ↓" : "Click to Select"}
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
                                  title={dev.isOnline ? "Online" : "Offline"}
                                  aria-label={dev.isOnline ? "Online" : "Offline"}
                                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                    dev.isOnline ? "bg-emerald-400" : "bg-rose-500"
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
                              Register an actuator module in Settings to see and manage it here.
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
                                  title={dev.isOnline ? "Online" : "Offline"}
                                  aria-label={dev.isOnline ? "Online" : "Offline"}
                                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                    dev.isOnline ? "bg-emerald-400" : "bg-rose-500"
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
                              onNotify={(msg) => {
                                setFeedbackMsg(msg);
                                setTimeout(() => setFeedbackMsg(null), 4000);
                              }}
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
            devices={allDevices}
            focusedDeviceId={focusedDeviceId}
            liveCommandUpdate={liveHubCmdUpdate}
            onNotify={(msg) => {
              setFeedbackMsg(msg);
              setTimeout(() => setFeedbackMsg(null), 4000);
            }}
            onCommandCreated={(record) => {
              setLiveHubCmdUpdate((prev) => ({
                seq: (prev?.seq ?? 0) + 1,
                record,
              }));
            }}
          />
        </section>

        {/* HUB CLI & ACTUATOR CONTROL PANEL */}
        <HubCommandPanel
          liveCommandUpdate={liveHubCmdUpdate}
          onNotify={(msg) => {
            setFeedbackMsg(msg);
            setTimeout(() => setFeedbackMsg(null), 4000);
          }}
        />

        {/* Live Feed Table & Logs Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Live Ingestion Feed */}
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-white flex items-center space-x-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Live Feed ({activeGreenhouse?.name} - {activeGreenhouse?.plant})</span>
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

          {/* Module & Actuator Activity Log */}
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-6 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="text-sm font-medium text-white flex items-center space-x-2">
                <Power className="w-4 h-4 text-amber-400" />
                <span>Module &amp; Actuator Activity Log</span>
              </h3>
              <div className="flex items-center space-x-2">
                <div className="inline-flex rounded-lg bg-[#0E0E12] border border-[#24242C] p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setActivityFilter("all")}
                    className={`px-2 py-0.5 rounded-md transition ${
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
                    className={`px-2 py-0.5 rounded-md transition ${
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
                  className="p-1 hover:text-white text-[#8E8E93] transition"
                  title="Refresh module activity"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleClearLogs}
                  className="p-1 hover:text-rose-400 text-[#8E8E93] transition"
                  title="Clear activity logs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#24242A] text-[#8E8E93]">
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
                          <span className="text-white font-medium truncate max-w-[140px]" title={entry.deviceName}>
                            {entry.deviceName}
                          </span>
                          <div className="flex items-center space-x-1.5 mt-0.5">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                                entry.isActuator
                                  ? "bg-amber-500/10 text-amber-300"
                                  : "bg-cyan-500/10 text-cyan-300"
                              }`}
                            >
                              {entry.deviceTypeLabel}
                            </span>
                            {entry.deviceSubLabel && (
                              <span className="text-[10px] font-mono text-[#6E6E73]">
                                {entry.deviceSubLabel}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 align-top">
                        <div className="flex flex-col gap-1">
                          <span className="text-[#D1D1D6] line-clamp-2 max-w-[240px]" title={entry.whatHappened}>
                            {entry.whatHappened}
                          </span>
                          <div>
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
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
                        className="py-2.5 px-3 text-[#6E6E73] whitespace-nowrap text-right align-top"
                        title={new Date(entry.timestamp).toLocaleString()}
                      >
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                  {moduleActivityEntries.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-[#6E6E73]">
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
        Green Node IoT Monitoring Hub • Company & Greenhouse Cluster Architecture
      </footer>

      {/* PROVISIONING SUCCESS & FIRMWARE CODE MODAL */}
      {showProvisionedSuccess && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141417] border border-emerald-500/50 rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center space-x-2 text-emerald-400 mb-2">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="text-base font-semibold text-white">
                {showProvisionedSuccess.moduleCategory === "actuator"
                  ? "Actuator Successfully Registered!"
                  : "Sensor Module Successfully Registered!"}
              </h3>
            </div>
            <p className="text-xs text-[#8E8E93] mb-4">
              Registered to <strong className="text-white">{showProvisionedSuccess.greenhouseName}</strong> (Crop: <strong className="text-emerald-400">{showProvisionedSuccess.plant}</strong>) at <strong className="text-white">{showProvisionedSuccess.companyLocation}</strong>.
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
              <span className="text-xs font-semibold text-[#A1A1A6] block">Arduino Firmware Code (Paste in .ino)</span>
              <div className="bg-[#0A0A0C] border border-[#24242A] rounded-xl p-3 font-mono text-[11px] text-teal-300 select-all overflow-x-auto">
                const char* DEVICE_ID = &quot;{showProvisionedSuccess.deviceId}&quot;;
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

      {/* 1. REGISTER COMPANY MODAL (Asking Company Name and Location) */}
      {showNewCompanyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-1 flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              <span>Register Company</span>
            </h3>
            <p className="text-xs text-[#8E8E93] mb-4">
              Enter your corporate agriculture company name and primary facility location.
            </p>

            <form onSubmit={handleRegisterCompany} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                  Company Name *
                </label>
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="e.g. Ceylon Agro Tech Corp"
                  required
                  className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white placeholder-[#5A5A60] focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                  Company Location / Facility *
                </label>
                <input
                  type="text"
                  value={newCompanyLocation}
                  onChange={(e) => setNewCompanyLocation(e.target.value)}
                  placeholder="e.g. Colombo Agri Facility or Nuwara Eliya High Farm"
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
                  value={newCompanyDescription}
                  onChange={(e) => setNewCompanyDescription(e.target.value)}
                  placeholder="e.g. Commercial vertical farming & hydroponics"
                  className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white placeholder-[#5A5A60] focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewCompanyModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#8E8E93] hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingCompany}
                  className="px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-lg text-xs font-medium shadow-md shadow-emerald-500/20 transition disabled:opacity-50"
                >
                  {isCreatingCompany ? "Registering..." : "Register Company"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. REGISTER GREENHOUSE MODAL (Under Registered Company, asking for Plant/Crop) */}
      {showNewGreenhouseModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-1 flex items-center space-x-2">
              <Warehouse className="w-4 h-4 text-teal-400" />
              <span>Register Greenhouse</span>
            </h3>
            <p className="text-xs text-[#8E8E93] mb-4">
              Register a greenhouse under an existing company and designate the target plant / crop.
            </p>

            <form onSubmit={handleCreateGreenhouse} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                  Registered Company *
                </label>
                <select
                  value={newGhCompanyId}
                  onChange={(e) => setNewGhCompanyId(e.target.value)}
                  className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/60"
                  required
                >
                  {companies.map((c) => (
                    <option key={c.companyId} value={c.companyId}>
                      {c.name} — {c.location}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                  Greenhouse Name *
                </label>
                <input
                  type="text"
                  value={newGhName}
                  onChange={(e) => setNewGhName(e.target.value)}
                  placeholder="e.g. Greenhouse 01 or Tunnel Bay A"
                  required
                  className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white placeholder-[#5A5A60] focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                  Target Plant / Crop *
                </label>
                <input
                  type="text"
                  value={newGhPlant}
                  onChange={(e) => setNewGhPlant(e.target.value)}
                  placeholder="e.g. Heirloom Tomatoes, Strawberries, Bell Peppers, Basil"
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
                  placeholder="e.g. Automated drip-irrigation hydroponic setup"
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
                  {isCreatingGh ? "Creating..." : "Register Greenhouse"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. REGISTER MODULE MODAL (Sensor Module & Actuator Registrations) */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#141417] border border-[#282830] rounded-2xl p-6 w-full max-w-2xl shadow-2xl my-8">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-base font-semibold text-white mb-1 flex items-center space-x-2">
                  {registerModuleTab === "actuator" ? (
                    <Power className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <Cpu className="w-4 h-4 text-emerald-400" />
                  )}
                  <span>Register Module</span>
                </h3>
                <p className="text-xs text-[#8E8E93]">
                  Register a sensor module or actuator and view existing registrations linked to your greenhouses.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="text-[#8E8E93] hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-[#202026]"
              >
                ✕
              </button>
            </div>

            {/* Module Category Switcher */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#0E0E12] border border-[#26262E] rounded-xl mb-4">
              <button
                type="button"
                onClick={() => setRegisterModuleTab("sensor")}
                className={`py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-2 ${
                  registerModuleTab === "sensor"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                    : "text-[#8E8E93] hover:text-white"
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Sensor Module Registration</span>
              </button>
              <button
                type="button"
                onClick={() => setRegisterModuleTab("actuator")}
                className={`py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-2 ${
                  registerModuleTab === "actuator"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                    : "text-[#8E8E93] hover:text-white"
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>Actuator Registration</span>
              </button>
            </div>

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
                      {g.name} ({g.companyName}) — 🌱 {g.plant}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                  {registerModuleTab === "actuator"
                    ? "Actuator Friendly Name *"
                    : "Sensor Module Friendly Name *"}
                </label>
                <input
                  type="text"
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  placeholder={
                    registerModuleTab === "actuator"
                      ? "e.g. Exhaust Fan 01"
                      : "e.g. Bed A Sensor Module"
                  }
                  required
                  className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white placeholder-[#5A5A60] focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              {registerModuleTab === "sensor" ? (
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
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                      Actuator Type
                    </label>
                    <select
                      value={newDeviceActuatorType}
                      onChange={(e) => setNewDeviceActuatorType(e.target.value)}
                      className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/60"
                    >
                      <option value="fan">Cooling / Exhaust Fan</option>
                      <option value="pump">Water / Nutrient Pump</option>
                      <option value="irrigation">Irrigation Valve</option>
                      <option value="light">Grow Light</option>
                      <option value="heater">Heater</option>
                      <option value="relay">Generic Relay</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                      Sub-Node ID (Optional)
                    </label>
                    <input
                      type="text"
                      value={newDeviceSubNodeId}
                      onChange={(e) => setNewDeviceSubNodeId(e.target.value)}
                      placeholder="e.g. sn-0001 / fan-01"
                      className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-[#5A5A60] focus:outline-none focus:border-cyan-500/60"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#A1A1A6] mb-1">
                      Zone / Bed Location
                    </label>
                    <input
                      type="text"
                      value={newDeviceLocation}
                      onChange={(e) => setNewDeviceLocation(e.target.value)}
                      placeholder="e.g. Zone 1 - Roof"
                      className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl px-3 py-2 text-xs text-white placeholder-[#5A5A60] focus:outline-none focus:border-cyan-500/60"
                    />
                  </div>
                </div>
              )}

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

              <div className="flex justify-end space-x-2 pt-2">
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
                  className={`px-4 py-1.5 text-white rounded-lg text-xs font-medium shadow-md transition disabled:opacity-50 ${
                    registerModuleTab === "actuator"
                      ? "bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 shadow-cyan-500/20"
                      : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 shadow-emerald-500/20"
                  }`}
                >
                  {isRegistering
                    ? "Registering..."
                    : registerModuleTab === "actuator"
                    ? "Register Actuator"
                    : "Register Sensor Module"}
                </button>
              </div>
            </form>

            {/* Current Registrations Inside Register Module */}
            {(() => {
              const sensorRegs = allDevices.filter((d) => getModuleCategory(d) === "sensor");
              const actuatorRegs = allDevices.filter((d) => getModuleCategory(d) === "actuator");

              return (
                <div className="mt-5 pt-4 border-t border-[#26262E] grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Sensor Module Registrations */}
                  <div className="bg-[#0E0E12] border border-[#22222A] rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold text-emerald-400 flex items-center space-x-1.5">
                        <Cpu className="w-3.5 h-3.5" />
                        <span>Sensor Module Registrations</span>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-bold">
                        {sensorRegs.length}
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {sensorRegs.length === 0 ? (
                        <p className="text-[11px] text-[#6E6E73] py-2">No sensor modules registered yet.</p>
                      ) : (
                        sensorRegs.map((d) => (
                          <div
                            key={d.deviceId}
                            className="bg-[#16161B] border border-[#24242C] rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-white truncate">{d.name}</p>
                              <p className="text-[10px] text-[#8E8E93] truncate">
                                {d.greenhouseName || "Greenhouse"} • {d.sensorType || "fc28"}
                              </p>
                            </div>
                            <code className="text-[10px] font-mono text-emerald-400 shrink-0">
                              {d.deviceId.slice(0, 8)}…
                            </code>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Actuator Registrations */}
                  <div className="bg-[#0E0E12] border border-[#22222A] rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold text-cyan-300 flex items-center space-x-1.5">
                        <Power className="w-3.5 h-3.5" />
                        <span>Actuator Registrations</span>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 font-bold">
                        {actuatorRegs.length}
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {actuatorRegs.length === 0 ? (
                        <p className="text-[11px] text-[#6E6E73] py-2">No actuators registered yet.</p>
                      ) : (
                        actuatorRegs.map((d) => {
                          const meta = getActuatorMeta(d);
                          return (
                            <div
                              key={d.deviceId}
                              className="bg-[#16161B] border border-[#24242C] rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-white truncate">{d.name}</p>
                                <p className="text-[10px] text-[#8E8E93] truncate">
                                  {d.greenhouseName || "Greenhouse"} • {meta.actuatorType}
                                  {meta.subNodeId ? ` (${meta.subNodeId})` : ""}
                                </p>
                              </div>
                              <code className="text-[10px] font-mono text-cyan-300 shrink-0">
                                {d.deviceId.slice(0, 8)}…
                              </code>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
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
