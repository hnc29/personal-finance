"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { user, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      router.push("/");
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorMessage("Vui lòng nhập tên đăng nhập");
      return;
    }
    if (!password) {
      setErrorMessage("Vui lòng nhập mật khẩu");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await login(username.trim(), password);
      router.push("/");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "radial-gradient(circle at 50% 20%, #1e293b 0%, #0f172a 100%)",
      padding: "20px",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      color: "#f8fafc",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "420px",
        background: "rgba(30, 41, 59, 0.8)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "24px",
        padding: "36px",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
      }}>
        {/* Branding Header */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{
            width: "64px",
            height: "64px",
            background: "linear-gradient(135deg, #2563eb, #3b82f6)",
            borderRadius: "18px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "16px",
            boxShadow: "0 10px 25px -5px rgba(37, 99, 235, 0.4)",
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" color="#fff">
              <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
              <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
              <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
            </svg>
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", margin: "0 0 8px 0" }}>Personal Finance</h1>
          <p style={{ fontSize: "14px", color: "#94a3b8", margin: 0 }}>Đăng nhập để quản lý tài chính và tài sản của bạn</p>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div style={{
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#fca5a5",
            padding: "12px 14px",
            borderRadius: "12px",
            marginBottom: "20px",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}>
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>
              Tên đăng nhập
            </label>
            <input
              type="text"
              placeholder="Nhập tên đăng nhập (vd: admin)"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setErrorMessage(null);
              }}
              autoFocus
              style={{
                width: "100%",
                height: "44px",
                background: "rgba(15, 23, 42, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "10px",
                padding: "0 14px",
                color: "#f8fafc",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>
              Mật khẩu
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Nhập mật khẩu"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMessage(null);
                }}
                style={{
                  width: "100%",
                  height: "44px",
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "10px",
                  padding: "0 40px 0 14px",
                  color: "#f8fafc",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#94a3b8",
                  fontSize: "13px",
                  padding: "4px",
                }}
              >
                {showPassword ? "Ẩn" : "Hiện"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              height: "46px",
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              border: "none",
              borderRadius: "10px",
              color: "#ffffff",
              fontSize: "15px",
              fontWeight: "600",
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.7 : 1,
              marginTop: "6px",
              boxShadow: "0 10px 15px -3px rgba(37, 99, 235, 0.3)",
              transition: "all 0.2s ease",
            }}
          >
            {isLoading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        {/* Footer Link */}
        <div style={{ textAlign: "center", marginTop: "24px", fontSize: "14px", color: "#94a3b8" }}>
          Chưa có tài khoản?{" "}
          <Link href="/register" style={{ color: "#38bdf8", fontWeight: "600", textDecoration: "none" }}>
            Đăng ký tài khoản
          </Link>
        </div>

        {/* Hint */}
        <div style={{ marginTop: "20px", textAlign: "center", fontSize: "12px", color: "#64748b" }}>
          Tài khoản mặc định: <b>admin</b> / mật khẩu: <b>admin</b>
        </div>
      </div>
    </div>
  );
}
