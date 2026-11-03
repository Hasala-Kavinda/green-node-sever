// Dynamic Backend API Client
export const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL || "https://blue-circle.onrender.com";

export function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("green_node_api_url");
    if (saved) return saved.replace(/\/+$/, "");
  }
  return DEFAULT_API_URL.replace(/\/+$/, "");
}

export function setBackendUrl(url: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("green_node_api_url", url.replace(/\/+$/, ""));
  }
}

export function getWebSocketUrl(): string {
  const backend = getBackendUrl();
  try {
    const u = new URL(backend);
    const wsProto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProto}//${u.host}/ws`;
  } catch {
    return "ws://localhost:4000/ws";
  }
}

export interface Reading {
  id?: string;
  deviceId: string;
  companyLocation?: string;
  greenhouseId?: string;
  greenhouseName?: string;
  temperature: number;
  humidity: number;
  soilMoisture: number;
  light: number;
  espTemperature?: number;
  wifiSsid?: string;
  metadata?: {
    chip?: string;
    soil_raw?: number;
    light_raw?: number;
    rssi?: number;
  };
  timestamp: string;
  deviceName?: string;
  deviceLocation?: string;
  deviceStatus?: string;
}

export interface Device {
  id?: string;
  deviceId: string;
  name: string;
  companyLocation?: string;
  greenhouseId?: string;
  greenhouseName?: string;
  sensorType?: string;
  location?: string;
  wifiSsid?: string;
  isOnline?: boolean;
  status?: "online" | "warning" | "offline";
  lastSeen?: string;
  ipAddress?: string;
  port?: number;
  rssi?: number;
  latestReading?: {
    temperature: number;
    humidity: number;
    soilMoisture: number;
    light: number;
    espTemperature?: number;
    wifiSsid?: string;
    timestamp: string;
  };
}

export interface Greenhouse {
  id?: string;
  greenhouseId: string;
  name: string;
  companyLocation: string;
  description?: string;
  assignedDeviceIds: string[];
  totalDevices?: number;
  onlineDevices?: number;
  devices?: Device[];
  summary?: {
    avgTemperature: number | null;
    avgHumidity: number | null;
    avgSoilMoisture: number | null;
    avgLight: number | null;
  };
}

export interface SystemLog {
  id: string;
  deviceId?: string;
  eventType?: string;
  category?: string;
  message: string;
  severity?: "info" | "warning" | "error" | "critical";
  level?: "info" | "warn" | "error" | "success";
  timestamp: string;
}

// --------------------------------------------------------------------------
// Greenhouse APIs
// --------------------------------------------------------------------------

export async function fetchGreenhouses(companyLocation?: string): Promise<Greenhouse[]> {
  const url = companyLocation
    ? `${getBackendUrl()}/api/greenhouses?companyLocation=${encodeURIComponent(companyLocation)}`
    : `${getBackendUrl()}/api/greenhouses`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch greenhouses");
  const json = await res.json();
  return json.data || [];
}

export async function fetchGreenhouseOverview(greenhouseId: string): Promise<Greenhouse | null> {
  const res = await fetch(`${getBackendUrl()}/api/greenhouses/${encodeURIComponent(greenhouseId)}/overview`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data || null;
}

export async function createGreenhouse(data: {
  greenhouseId?: string;
  name: string;
  companyLocation: string;
  description?: string;
}): Promise<Greenhouse> {
  const res = await fetch(`${getBackendUrl()}/api/greenhouses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create greenhouse");
  }
  const json = await res.json();
  return json.data;
}

export async function assignDeviceToGreenhouse(greenhouseId: string, deviceId: string) {
  const res = await fetch(`${getBackendUrl()}/api/greenhouses/${encodeURIComponent(greenhouseId)}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to assign device to greenhouse");
  }
  return res.json();
}

// --------------------------------------------------------------------------
// Device APIs
// --------------------------------------------------------------------------

export async function fetchDevices(greenhouseId?: string, companyLocation?: string): Promise<Device[]> {
  const params = new URLSearchParams();
  if (greenhouseId) params.append("greenhouseId", greenhouseId);
  if (companyLocation) params.append("companyLocation", companyLocation);

  const queryStr = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${getBackendUrl()}/api/devices${queryStr}`);
  if (!res.ok) throw new Error("Failed to fetch devices");
  const json = await res.json();
  return json.data || [];
}

export async function registerDevice(data: {
  deviceId?: string;
  name?: string;
  companyLocation?: string;
  greenhouseId?: string;
  greenhouseName?: string;
  sensorType?: string;
  location?: string;
}): Promise<Device> {
  const res = await fetch(`${getBackendUrl()}/api/devices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to register device");
  }
  const json = await res.json();
  return json.data;
}

export async function fetchLatestReading(deviceId?: string, greenhouseId?: string): Promise<Reading | null> {
  const params = new URLSearchParams();
  if (deviceId) params.append("deviceId", deviceId);
  if (greenhouseId) params.append("greenhouseId", greenhouseId);

  const res = await fetch(`${getBackendUrl()}/api/readings/latest?${params.toString()}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data || null;
}

export async function fetchStats(deviceId?: string, hours = 24, greenhouseId?: string) {
  const params = new URLSearchParams();
  params.append("hours", hours.toString());
  if (deviceId) params.append("deviceId", deviceId);
  if (greenhouseId) params.append("greenhouseId", greenhouseId);

  const res = await fetch(`${getBackendUrl()}/api/readings/stats?${params.toString()}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data || null;
}

export async function fetchLogs(limit = 30): Promise<SystemLog[]> {
  const res = await fetch(`${getBackendUrl()}/api/logs?limit=${limit}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export async function clearAllLogs(): Promise<boolean> {
  const res = await fetch(`${getBackendUrl()}/api/logs`, { method: "DELETE" });
  return res.ok;
}

export async function pingDevice(deviceId: string) {
  const res = await fetch(`${getBackendUrl()}/api/devices/${encodeURIComponent(deviceId)}/health`);
  return res.json();
}

export async function pingKeepAlive() {
  const res = await fetch(`${getBackendUrl()}/api/keep-alive`);
  return res.json();
}

export async function sendTestReading(payload: Partial<Reading>) {
  const res = await fetch(`${getBackendUrl()}/api/readings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}
