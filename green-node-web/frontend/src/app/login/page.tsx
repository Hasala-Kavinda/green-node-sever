"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Leaf, Lock, User, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    setTimeout(() => {
      const success = login(username.trim(), password);
      if (success) {
        router.push("/");
      } else {
        setError("Invalid username or password. Please use 'admin' and 'admin'.");
        setIsSubmitting(false);
      }
    }, 300);
  };

  const handleFillDemo = () => {
    setUsername("admin");
    setPassword("admin");
    setError(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0C] px-4 py-12 relative overflow-hidden">
      {/* Background radial ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-emerald-500/10 blur-[130px] rounded-full pointer-events-none" />

      <div className="w-full max-w-[420px] relative z-10">
        {/* Brand Icon & Heading */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-xl shadow-emerald-500/20 mb-4 ring-1 ring-white/10">
            <Leaf className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Green Node
          </h1>
          <p className="text-sm text-[#8E8E93] mt-1.5">
            IoT Environment & Soil Telemetry Hub
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#141417] border border-[#282830] rounded-2xl p-7 shadow-2xl backdrop-blur-xl">
          <div className="mb-6">
            <h2 className="text-lg font-medium text-white tracking-tight">Sign In</h2>
            <p className="text-xs text-[#8E8E93] mt-1">
              Enter your credentials to access the live monitoring dashboard.
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start space-x-2.5 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#A1A1A6] mb-1.5">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6E6E73]">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                  autoFocus
                  className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-[#5A5A60] focus:outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 transition duration-150"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-medium text-[#A1A1A6]">
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleFillDemo}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 transition"
                >
                  Fill Demo (admin/admin)
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6E6E73]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-[#1C1C20] border border-[#2C2C32] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-[#5A5A60] focus:outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 transition duration-150"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-medium text-sm py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-500/20 transition duration-150 flex items-center justify-center space-x-2 disabled:opacity-60"
            >
              <span>{isSubmitting ? "Signing in..." : "Continue to Dashboard"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick preset pill */}
          <div className="mt-6 pt-5 border-t border-[#24242A] text-center">
            <div className="inline-flex items-center space-x-1.5 text-xs text-[#8E8E93] bg-[#1C1C20] px-3 py-1.5 rounded-full border border-[#282830]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Default credentials: <strong className="text-[#F5F5F7]">admin</strong> / <strong className="text-[#F5F5F7]">admin</strong></span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[#52525A] mt-8">
          Green Node IoT Platform • ESP32-C3 SuperMini Telemetry
        </p>
      </div>
    </div>
  );
}
