// Dynamic Backend API Client
export const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

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
}

export interface Device {
  id: string;
  deviceId: string;
  name: string;
  location?: string;
  wifiSsid?: string;
  isOnline?: boolean;
  lastSeen?: string;
}

export interface SystemLog {
  id: string;
  deviceId?: string;
  eventType: string;
  message: string;
  severity: "info" | "warning" | "error" | "critical";
  timestamp: string;
}

export async function fetchDevices(): Promise<Device[]> {
  const res = await fetch(`${getBackendUrl()}/api/devices`);
  if (!res.ok) throw new Error("Failed to fetch devices");
  const json = await res.json();
  return json.data || [];
}

export async function registerDevice(data: { deviceId?: string; name: string; location?: string }): Promise<Device> {
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

export async function fetchLatestReading(deviceId: string): Promise<Reading | null> {
  const res = await fetch(`${getBackendUrl()}/api/readings/latest?deviceId=${deviceId}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data || null;
}

export async function fetchStats(deviceId: string, hours = 24) {
  const res = await fetch(`${getBackendUrl()}/api/readings/stats?hours=${hours}&deviceId=${deviceId}`);
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
  const res = await fetch(`${getBackendUrl()}/api/devices/${deviceId}/health`);
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
