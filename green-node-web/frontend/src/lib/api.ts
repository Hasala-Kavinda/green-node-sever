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
  companyId?: string;
  companyName?: string;
  companyLocation?: string;
  greenhouseId?: string;
  greenhouseName?: string;
  plant?: string;
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
  companyId?: string;
  companyName?: string;
  companyLocation?: string;
  greenhouseId?: string;
  greenhouseName?: string;
  plant?: string;
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

export interface Company {
  id?: string;
  companyId: string;
  name: string;
  location: string;
  description?: string;
  totalGreenhouses?: number;
  greenhouses?: Array<{
    greenhouseId: string;
    name: string;
    plant: string;
    assignedDevicesCount: number;
  }>;
}

export interface Greenhouse {
  id?: string;
  greenhouseId: string;
  name: string;
  companyId: string;
  companyName: string;
  companyLocation: string;
  plant: string;
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
// Company APIs
// --------------------------------------------------------------------------

export async function fetchCompanies(): Promise<Company[]> {
  const res = await fetch(`${getBackendUrl()}/api/companies`);
  if (!res.ok) throw new Error("Failed to fetch companies");
  const json = await res.json();
  return json.data || [];
}

export async function createCompany(data: {
  companyId?: string;
  name: string;
  location: string;
  description?: string;
}): Promise<Company> {
  const res = await fetch(`${getBackendUrl()}/api/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to register company");
  }
  const json = await res.json();
  return json.data;
}

// --------------------------------------------------------------------------
// Greenhouse APIs (Under Registered Company)
// --------------------------------------------------------------------------

export async function fetchGreenhouses(companyId?: string): Promise<Greenhouse[]> {
  const url = companyId
    ? `${getBackendUrl()}/api/greenhouses?companyId=${encodeURIComponent(companyId)}`
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
  companyId: string;
  name: string;
  plant: string;
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
// Device APIs (Sensor Module Registration)
// --------------------------------------------------------------------------

export async function fetchDevices(greenhouseId?: string, companyId?: string): Promise<Device[]> {
  const params = new URLSearchParams();
  if (greenhouseId) params.append("greenhouseId", greenhouseId);
  if (companyId) params.append("companyId", companyId);

  const queryStr = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${getBackendUrl()}/api/devices${queryStr}`);
  if (!res.ok) throw new Error("Failed to fetch devices");
  const json = await res.json();
  return json.data || [];
}

export async function registerDevice(data: {
  deviceId?: string;
  name?: string;
  greenhouseId?: string;
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
    throw new Error(err.error || "Failed to register sensor module");
  }
  const json = await res.json();
  return json.data;
}

export async function fetchReadings(options: {
  deviceId?: string;
  greenhouseId?: string;
  companyId?: string;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}): Promise<Reading[]> {
  try {
    const params = new URLSearchParams();
    if (options.deviceId) params.append("deviceId", options.deviceId);
    if (options.greenhouseId) params.append("greenhouseId", options.greenhouseId);
    if (options.companyId) params.append("companyId", options.companyId);
    if (options.limit) params.append("limit", options.limit.toString());
    if (options.sortBy) params.append("sortBy", options.sortBy);
    if (options.sortOrder) params.append("sortOrder", options.sortOrder);

    const queryStr = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${getBackendUrl()}/api/readings${queryStr}`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.items || json.data || [];
  } catch {
    return [];
  }
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


export async function deleteDevice(deviceId: string): Promise<boolean> {
  const res = await fetch(`${getBackendUrl()}/api/devices/${encodeURIComponent(deviceId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to unregister sensor module");
  }
  return true;
}
