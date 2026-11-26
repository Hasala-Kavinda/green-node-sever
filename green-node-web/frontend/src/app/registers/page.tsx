"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  fetchCompanies,
  createCompany,
  fetchGreenhouses,
  createGreenhouse,
  fetchDevices,
  registerDevice,
  Company,
  Greenhouse,
  Device,
} from "@/lib/api";
import {
  Activity,
  Building2,
  Warehouse,
  Cpu,
  Plus,
  Settings,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ChevronRight,
  Sprout,
  Power,
  MapPin,
} from "lucide-react";

type RegistrationTab = "company" | "greenhouse" | "module";

export default function NewRegistersPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<RegistrationTab>("company");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [greenhouses, setGreenhouses] = useState<Greenhouse[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Company form
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyLocation, setNewCompanyLocation] = useState("");
  const [newCompanyDescription, setNewCompanyDescription] = useState("");
  const [isCreatingCompany, setIsCreatingCompany] = useState(false);

  // Greenhouse form
  const [newGhCompanyId, setNewGhCompanyId] = useState("");
  const [newGhName, setNewGhName] = useState("");
  const [newGhPlant, setNewGhPlant] = useState("Heirloom Tomatoes");
  const [newGhDescription, setNewGhDescription] = useState("");
  const [isCreatingGh, setIsCreatingGh] = useState(false);

  // Module form
  const [moduleCategory, setModuleCategory] = useState<"sensor" | "actuator">("sensor");
  const [newDeviceName, setNewDeviceName] = useState("");
  const [newDeviceGreenhouseId, setNewDeviceGreenhouseId] = useState("");
  const [newDeviceLocation, setNewDeviceLocation] = useState("Zone 1 - Main Bed");
  const [newDeviceSensorType, setNewDeviceSensorType] = useState("fc28");
  const [newDeviceActuatorType, setNewDeviceActuatorType] = useState("fan");
  const [newDeviceSubNodeId, setNewDeviceSubNodeId] = useState("");
  const [newDeviceId, setNewDeviceId] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  const [provisionedInfo, setProvisionedInfo] = useState<{
    deviceId: string;
    name: string;
    category: "sensor" | "actuator";
  } | null>(null);
  const [copiedUuid, setCopiedUuid] = useState(false);

  const notify = (type: "success" | "error", text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  const loadData = async () => {
    try {
      const [comps, ghs, devs] = await Promise.all([
        fetchCompanies(),
        fetchGreenhouses(),
        fetchDevices(),
      ]);
      setCompanies(comps);
      setGreenhouses(ghs);
      setDevices(devs);

      const savedComp =
        typeof window !== "undefined" ? localStorage.getItem("green_node_selected_company") : null;
      if (comps.length > 0 && !newGhCompanyId) {
        setNewGhCompanyId(savedComp && savedComp !== "all" ? savedComp : comps[0].companyId);
      }

      const savedGh =
        typeof window !== "undefined" ? localStorage.getItem("green_node_active_greenhouse") : null;
      if (!newDeviceGreenhouseId) {
        const targetGh =
          savedGh && ghs.some((g) => g.greenhouseId === savedGh)
            ? savedGh
            : ghs[0]?.greenhouseId || "";
        setNewDeviceGreenhouseId(targetGh);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const qs = new URLSearchParams(window.location.search);
      const tab = qs.get("tab");
      const category = qs.get("category");
      if (tab === "company" || tab === "greenhouse" || tab === "module") {
        setActiveTab(tab);
      }
      if (category === "sensor" || category === "actuator") {
        setModuleCategory(category);
      }
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingCompany(true);
    try {
      const company = await createCompany({
        name: newCompanyName.trim(),
        location: newCompanyLocation.trim(),
        description: newCompanyDescription.trim() || undefined,
      });
      setNewCompanyName("");
      setNewCompanyLocation("");
      setNewCompanyDescription("");
      setNewGhCompanyId(company.companyId);
      await loadData();
      notify("success", `Company "${company.name}" registered.`);
    } catch (err: any) {
      notify("error", err.message || "Failed to register company");
    } finally {
      setIsCreatingCompany(false);
    }
  };

  const handleCreateGreenhouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGhCompanyId) {
      notify("error", "Please register or select a company first.");
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
      setNewGhName("");
      setNewGhDescription("");
      setNewDeviceGreenhouseId(gh.greenhouseId);
      if (typeof window !== "undefined") {
        localStorage.setItem("green_node_active_greenhouse", gh.greenhouseId);
      }
      await loadData();
      notify("success", `Greenhouse "${gh.name}" registered.`);
    } catch (err: any) {
      notify("error", err.message || "Failed to register greenhouse");
    } finally {
      setIsCreatingGh(false);
    }
  };

  const handleRegisterModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceGreenhouseId) {
      notify("error", "Please register or select a greenhouse first.");
      return;
    }
    setIsRegistering(true);
    try {
      const isActuator = moduleCategory === "actuator";
      const created = await registerDevice({
        deviceId: newDeviceId.trim() || undefined,
        name: newDeviceName.trim() || undefined,
        greenhouseId: newDeviceGreenhouseId,
        location: newDeviceLocation.trim() || undefined,
        moduleCategory,
        sensorType: isActuator ? "generic" : newDeviceSensorType,
        actuatorType: isActuator ? newDeviceActuatorType : undefined,
        subNodeId: newDeviceSubNodeId.trim() || undefined,
      });
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem("green_node_actuator_meta");
          const map = raw ? JSON.parse(raw) : {};
          map[created.deviceId] = {
            moduleCategory,
            actuatorType: isActuator ? newDeviceActuatorType : undefined,
            subNodeId: newDeviceSubNodeId.trim() || undefined,
          };
          localStorage.setItem("green_node_actuator_meta", JSON.stringify(map));
        } catch {}
      }
      setProvisionedInfo({
        deviceId: created.deviceId,
        name: created.name,
        category: moduleCategory,
      });
      setNewDeviceName("");
      setNewDeviceSubNodeId("");
      setNewDeviceId("");
      await loadData();
      notify("success", `Module "${created.name}" registered.`);
    } catch (err: any) {
      notify("error", err.message || "Failed to register module");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleCopyUuid = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedUuid(true);
    setTimeout(() => setCopiedUuid(false), 2000);
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0B0B0D] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const sidebarItems: Array<{
    id: RegistrationTab;
    label: string;
    description: string;
    count: number;
    icon: React.ReactNode;
    accent: string;
  }> = [
    {
      id: "company",
      label: "Company",
      description: "Organization & facility location",
      count: companies.length,
      icon: <Building2 className="w-5 h-5 text-emerald-400" />,
      accent: "border-emerald-500/40 bg-emerald-500/10",
    },
    {
      id: "greenhouse",
      label: "Greenhouse",
      description: "Cluster unit & crop type",
      count: greenhouses.length,
      icon: <Warehouse className="w-5 h-5 text-teal-400" />,
      accent: "border-teal-500/40 bg-teal-500/10",
    },
    {
      id: "module",
      label: "Sensor / Actuator",
      description: "ESP node or actuator device",
      count: devices.length,
      icon: <Cpu className="w-5 h-5 text-amber-400" />,
      accent: "border-amber-500/40 bg-amber-500/10",
    },
  ];

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-[#E5E5EA] font-sans flex flex-col">
      {feedbackMsg && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border text-sm font-medium shadow-2xl flex items-center space-x-2 ${
            feedbackMsg.type === "success"
              ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-300"
              : "bg-rose-950/90 border-rose-500/40 text-rose-300"
          }`}
        >
          {feedbackMsg.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

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
                className="group relative py-1.5 text-sm font-medium text-[#8E8E93] hover:text-white transition-colors"
              >
                <span>Analytics</span>
                <span className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-white/30 scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left" />
              </Link>
              <Link
                href="/registers"
                className="group relative py-1.5 text-sm font-bold text-white transition-colors"
              >
                <span>New Registers</span>
                <span className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 shadow-[0_0_12px_rgba(52,211,153,0.75)]" />
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

      {/* Main Split Layout: Left Sidebar + Right Registration Form */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Left Sidebar */}
          <aside className="w-full lg:w-80 shrink-0 bg-[#141417] border border-[#282830] rounded-2xl p-5 space-y-5">
            <div className="px-1 pt-1">
              <span className="text-xs uppercase tracking-wider font-semibold text-[#8E8E93]">
                Registration Type
              </span>
              <h2 className="text-lg font-semibold text-white mt-0.5">Select Provisioning</h2>
            </div>

            <div className="space-y-2.5">
              {sidebarItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full text-left p-4 rounded-xl border transition flex items-center justify-between gap-3 ${
                      isActive
                        ? `${item.accent} shadow-sm`
                        : "border-transparent bg-[#1A1A20]/60 hover:bg-[#1C1C24] hover:border-[#2C2C36]"
                    }`}
                  >
                    <div className="flex items-center space-x-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#0E0E12] border border-[#282830] flex items-center justify-center shrink-0">
                        {item.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white flex items-center space-x-2">
                          <span>{item.label}</span>
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/[0.06] text-[#A1A1A6]">
                            {item.count}
                          </span>
                        </div>
                        <p className="text-xs text-[#8E8E93] truncate mt-0.5">{item.description}</p>
                      </div>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 shrink-0 transition ${
                        isActive ? "text-white translate-x-0.5" : "text-[#52525A]"
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            <div className="border-t border-[#24242C] pt-4 px-1">
              <span className="text-xs uppercase tracking-wider font-semibold text-[#6E6E73] block mb-2.5">
                Cluster Hierarchy
              </span>
              <div className="text-xs text-[#A1A1A6] space-y-2">
                <div className="flex items-center space-x-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold flex items-center justify-center">
                    1
                  </span>
                  <span>Register Company &amp; Facility</span>
                </div>
                <div className="flex items-center space-x-2.5">
                  <span className="w-5 h-5 rounded-full bg-teal-500/15 text-teal-400 text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <span>Create Greenhouse &amp; Crop</span>
                </div>
                <div className="flex items-center space-x-2.5">
                  <span className="w-5 h-5 rounded-full bg-amber-500/15 text-amber-400 text-xs font-bold flex items-center justify-center">
                    3
                  </span>
                  <span>Provision Sensors &amp; Actuators</span>
                </div>
              </div>
            </div>
          </aside>

          {/* Right Side: Single-Column Registration Form */}
          <section className="flex-1 w-full max-w-2xl space-y-6">
            {activeTab === "company" && (
              <form
                onSubmit={handleCreateCompany}
                className="bg-[#141417] border border-[#282830] rounded-2xl p-6 sm:p-8 shadow-xl space-y-5"
              >
                <div className="flex items-start space-x-3.5 border-b border-[#24242C] pb-5">
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Register New Company</h2>
                    <p className="text-sm text-[#8E8E93] mt-1">
                      Create a top-level agricultural organization to group your greenhouses and devices.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#D1D1D6] block">
                    Company Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. City Green Agro"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    className="w-full bg-[#0E0E12] border border-[#282830] rounded-xl px-4 py-3 text-base text-white placeholder-[#52525A] focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#D1D1D6] block">
                    Facility Location <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-[#6E6E73] absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Colombo, LK"
                      value={newCompanyLocation}
                      onChange={(e) => setNewCompanyLocation(e.target.value)}
                      className="w-full bg-[#0E0E12] border border-[#282830] rounded-xl pl-10 pr-4 py-3 text-base text-white placeholder-[#52525A] focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#D1D1D6] block">
                    Description <span className="text-[#6E6E73]">(Optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Notes about this facility, climate zone, or operations..."
                    value={newCompanyDescription}
                    onChange={(e) => setNewCompanyDescription(e.target.value)}
                    className="w-full bg-[#0E0E12] border border-[#282830] rounded-xl px-4 py-3 text-base text-white placeholder-[#52525A] focus:outline-none focus:border-emerald-500 transition resize-none"
                  />
                </div>

                <div className="flex items-center justify-end pt-3 border-t border-[#24242C]">
                  <button
                    type="submit"
                    disabled={isCreatingCompany}
                    className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-lg shadow-emerald-500/20 flex items-center space-x-2 transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{isCreatingCompany ? "Registering Company..." : "Register Company"}</span>
                  </button>
                </div>
              </form>
            )}

            {activeTab === "greenhouse" && (
              <form
                onSubmit={handleCreateGreenhouse}
                className="bg-[#141417] border border-[#282830] rounded-2xl p-6 sm:p-8 shadow-xl space-y-5"
              >
                <div className="flex items-start space-x-3.5 border-b border-[#24242C] pb-5">
                  <div className="w-11 h-11 rounded-xl bg-teal-500/10 border border-teal-500/25 flex items-center justify-center shrink-0">
                    <Warehouse className="w-5 h-5 text-teal-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Register New Greenhouse</h2>
                    <p className="text-sm text-[#8E8E93] mt-1">
                      Assign a greenhouse unit under a company and specify the primary crop being cultivated.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#D1D1D6] block">
                    Parent Company <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={newGhCompanyId}
                    onChange={(e) => setNewGhCompanyId(e.target.value)}
                    className="w-full bg-[#0E0E12] border border-[#282830] rounded-xl px-4 py-3 text-base text-white focus:outline-none focus:border-teal-500 transition"
                  >
                    {companies.length === 0 && <option value="">No companies registered yet</option>}
                    {companies.map((c) => (
                      <option key={c.companyId} value={c.companyId}>
                        {c.name} ({c.location})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#D1D1D6] block">
                    Greenhouse Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Green House D"
                    value={newGhName}
                    onChange={(e) => setNewGhName(e.target.value)}
                    className="w-full bg-[#0E0E12] border border-[#282830] rounded-xl px-4 py-3 text-base text-white placeholder-[#52525A] focus:outline-none focus:border-teal-500 transition"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#D1D1D6] block">
                    Crop / Plant <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Sprout className="w-4 h-4 text-emerald-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Bell Pepper"
                      value={newGhPlant}
                      onChange={(e) => setNewGhPlant(e.target.value)}
                      className="w-full bg-[#0E0E12] border border-[#282830] rounded-xl pl-10 pr-4 py-3 text-base text-white placeholder-[#52525A] focus:outline-none focus:border-teal-500 transition"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#D1D1D6] block">
                    Description <span className="text-[#6E6E73]">(Optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Hydroponic bed layout, irrigation schedule, or target climate notes..."
                    value={newGhDescription}
                    onChange={(e) => setNewGhDescription(e.target.value)}
                    className="w-full bg-[#0E0E12] border border-[#282830] rounded-xl px-4 py-3 text-base text-white placeholder-[#52525A] focus:outline-none focus:border-teal-500 transition resize-none"
                  />
                </div>

                <div className="flex items-center justify-end pt-3 border-t border-[#24242C]">
                  <button
                    type="submit"
                    disabled={isCreatingGh || companies.length === 0}
                    className="px-6 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-500/20 flex items-center space-x-2 transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{isCreatingGh ? "Registering Greenhouse..." : "Register Greenhouse"}</span>
                  </button>
                </div>
              </form>
            )}

            {activeTab === "module" && (
              <form
                onSubmit={handleRegisterModule}
                className="bg-[#141417] border border-[#282830] rounded-2xl p-6 sm:p-8 shadow-xl space-y-5"
              >
                <div className="flex items-start space-x-3.5 border-b border-[#24242C] pb-5">
                  <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center shrink-0">
                    <Cpu className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Register Sensor or Actuator Module</h2>
                    <p className="text-sm text-[#8E8E93] mt-1">
                      Provision a new ESP sensor node or actuator controller inside a greenhouse.
                    </p>
                  </div>
                </div>

                {/* Familiar Radio-Style Segmented Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#D1D1D6] block">Module Type</label>
                  <div
                    role="radiogroup"
                    aria-label="Module Type"
                    className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                  >
                    <label
                      className={`cursor-pointer p-4 rounded-xl border transition flex items-center space-x-3 ${
                        moduleCategory === "sensor"
                          ? "bg-emerald-500/10 border-emerald-500/50 text-white"
                          : "bg-[#0E0E12] border-[#282830] text-[#A1A1A6] hover:border-[#3A3A46]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="moduleCategory"
                        value="sensor"
                        checked={moduleCategory === "sensor"}
                        onChange={() => setModuleCategory("sensor")}
                        className="sr-only"
                      />
                      <span
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          moduleCategory === "sensor" ? "border-emerald-400" : "border-[#52525A]"
                        }`}
                      >
                        {moduleCategory === "sensor" && (
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                        )}
                      </span>
                      <Cpu className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-sm font-semibold">Sensor Module</div>
                        <div className="text-xs text-[#8E8E93]">Env &amp; soil telemetry</div>
                      </div>
                    </label>

                    <label
                      className={`cursor-pointer p-4 rounded-xl border transition flex items-center space-x-3 ${
                        moduleCategory === "actuator"
                          ? "bg-amber-500/10 border-amber-500/50 text-white"
                          : "bg-[#0E0E12] border-[#282830] text-[#A1A1A6] hover:border-[#3A3A46]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="moduleCategory"
                        value="actuator"
                        checked={moduleCategory === "actuator"}
                        onChange={() => setModuleCategory("actuator")}
                        className="sr-only"
                      />
                      <span
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          moduleCategory === "actuator" ? "border-amber-400" : "border-[#52525A]"
                        }`}
                      >
                        {moduleCategory === "actuator" && (
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                        )}
                      </span>
                      <Power className="w-5 h-5 text-amber-400 shrink-0" />
                      <div>
                        <div className="text-sm font-semibold">Actuator Module</div>
                        <div className="text-xs text-[#8E8E93]">Fan, pump, valve or light</div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Single-column inputs one by one */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#D1D1D6] block">
                    Target Greenhouse <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={newDeviceGreenhouseId}
                    onChange={(e) => setNewDeviceGreenhouseId(e.target.value)}
                    className="w-full bg-[#0E0E12] border border-[#282830] rounded-xl px-4 py-3 text-base text-white focus:outline-none focus:border-emerald-500 transition"
                  >
                    {greenhouses.length === 0 && <option value="">No greenhouses registered yet</option>}
                    {greenhouses.map((g) => (
                      <option key={g.greenhouseId} value={g.greenhouseId}>
                        {g.name} ({g.plant})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#D1D1D6] block">Module Name</label>
                  <input
                    type="text"
                    placeholder={
                      moduleCategory === "actuator" ? "e.g. Exhaust Fan 1" : "e.g. Bed A Telemetry Node"
                    }
                    value={newDeviceName}
                    onChange={(e) => setNewDeviceName(e.target.value)}
                    className="w-full bg-[#0E0E12] border border-[#282830] rounded-xl px-4 py-3 text-base text-white placeholder-[#52525A] focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                {moduleCategory === "sensor" ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#D1D1D6] block">Soil Probe Type</label>
                    <select
                      value={newDeviceSensorType}
                      onChange={(e) => setNewDeviceSensorType(e.target.value)}
                      className="w-full bg-[#0E0E12] border border-[#282830] rounded-xl px-4 py-3 text-base text-white focus:outline-none focus:border-emerald-500 transition"
                    >
                      <option value="fc28">FC-28 Soil Probe</option>
                      <option value="md0869">MD0869 Soil Probe</option>
                    </select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#D1D1D6] block">Actuator Type</label>
                    <select
                      value={newDeviceActuatorType}
                      onChange={(e) => setNewDeviceActuatorType(e.target.value)}
                      className="w-full bg-[#0E0E12] border border-[#282830] rounded-xl px-4 py-3 text-base text-white focus:outline-none focus:border-amber-500 transition"
                    >
                      <option value="fan">Exhaust / Circulation Fan</option>
                      <option value="pump">Water Pump</option>
                      <option value="valve">Irrigation Valve</option>
                      <option value="light">Grow Light</option>
                    </select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#D1D1D6] block">Zone / Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Zone 1 - Main Bed"
                    value={newDeviceLocation}
                    onChange={(e) => setNewDeviceLocation(e.target.value)}
                    className="w-full bg-[#0E0E12] border border-[#282830] rounded-xl px-4 py-3 text-base text-white placeholder-[#52525A] focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#D1D1D6] block">
                    Hub Sub-Node ID <span className="text-[#6E6E73]">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. sn-0001"
                    value={newDeviceSubNodeId}
                    onChange={(e) => setNewDeviceSubNodeId(e.target.value)}
                    className="w-full bg-[#0E0E12] border border-[#282830] rounded-xl px-4 py-3 text-base text-white font-mono placeholder-[#52525A] focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#D1D1D6] block">
                    Custom Device UUID <span className="text-[#6E6E73]">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Leave blank to auto-generate"
                    value={newDeviceId}
                    onChange={(e) => setNewDeviceId(e.target.value)}
                    className="w-full bg-[#0E0E12] border border-[#282830] rounded-xl px-4 py-3 text-base text-white font-mono placeholder-[#52525A] focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                <div className="flex items-center justify-end pt-3 border-t border-[#24242C]">
                  <button
                    type="submit"
                    disabled={isRegistering || greenhouses.length === 0}
                    className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-lg shadow-emerald-500/20 flex items-center space-x-2 transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{isRegistering ? "Provisioning Module..." : "Register Module"}</span>
                  </button>
                </div>
              </form>
            )}

            {provisionedInfo && (
              <div className="bg-[#141417] border border-emerald-500/40 rounded-2xl p-6 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center space-x-2 text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-base font-semibold text-white">
                      {provisionedInfo.name} ({provisionedInfo.category === "actuator" ? "Actuator" : "Sensor"}) Provisioned
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyUuid(provisionedInfo.deviceId)}
                    className="px-3.5 py-2 bg-[#1C1C22] hover:bg-[#282830] border border-[#282830] rounded-xl text-sm font-medium text-white flex items-center space-x-1.5 transition"
                  >
                    {copiedUuid ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedUuid ? "Copied" : "Copy UUID"}</span>
                  </button>
                </div>
                <div className="bg-[#0B0B0E] border border-[#24242A] rounded-xl p-3.5 font-mono text-sm text-teal-300 select-all overflow-x-auto">
                  const char* DEVICE_ID = &quot;{provisionedInfo.deviceId}&quot;;
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
