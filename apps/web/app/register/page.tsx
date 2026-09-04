"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";

export default function RegisterPage() {
  const router = useRouter();
  const { user, register } = useAuth();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    if (username.trim().length < 3) {
      setErrorMessage("Tên đăng nhập tối thiểu 3 ký tự");
      return;
    }
    if (!password) {
      setErrorMessage("Vui lòng nhập mật khẩu");
      return;
    }
    if (password.length < 3) {
      setErrorMessage("Mật khẩu tối thiểu 3 ký tự");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Mật khẩu xác nhận không khớp");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await register(
        username.trim(),
        password,
        displayName.trim() || undefined,
        email.trim() || undefined,
      );
      router.push("/");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Đăng ký thất bại. Vui lòng thử lại.");
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
        maxWidth: "440px",
        background: "rgba(30, 41, 59, 0.8)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "24px",
        padding: "36px",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
      }}>
        {/* Branding Header */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{
            width: "60px",
            height: "60px",
            background: "linear-gradient(135deg, #10b981, #059669)",
            borderRadius: "18px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "14px",
            boxShadow: "0 10px 25px -5px rgba(16, 185, 129, 0.4)",
          }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" color="#fff">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", margin: "0 0 6px 0" }}>Tạo Tài Khoản Mới</h1>
          <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>Quản lý dữ liệu tài chính cá nhân độc lập và bảo mật</p>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div style={{
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#fca5a5",
            padding: "12px 14px",
            borderRadius: "12px",
            marginBottom: "18px",
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
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#cbd5e1", marginBottom: "4px" }}>
              Tên đăng nhập *
            </label>
            <input
              type="text"
              placeholder="Nhập tên đăng nhập (vd: hoangnc)"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setErrorMessage(null);
              }}
              autoFocus
              style={{
                width: "100%",
                height: "42px",
                background: "rgba(15, 23, 42, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "10px",
                padding: "0 12px",
                color: "#f8fafc",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#cbd5e1", marginBottom: "4px" }}>
              Tên hiển thị
            </label>
            <input
              type="text"
              placeholder="Họ và tên hoặc biệt danh"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={{
                width: "100%",
                height: "42px",
                background: "rgba(15, 23, 42, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "10px",
                padding: "0 12px",
                color: "#f8fafc",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#cbd5e1", marginBottom: "4px" }}>
              Email (tuỳ chọn)
            </label>
            <input
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                height: "42px",
                background: "rgba(15, 23, 42, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "10px",
                padding: "0 12px",
                color: "#f8fafc",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#cbd5e1", marginBottom: "4px" }}>
              Mật khẩu *
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Tối thiểu 3 ký tự"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMessage(null);
                }}
                style={{
                  width: "100%",
                  height: "42px",
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "10px",
                  padding: "0 38px 0 12px",
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
                  fontSize: "12px",
                  padding: "4px",
                }}
              >
                {showPassword ? "Ẩn" : "Hiện"}
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#cbd5e1", marginBottom: "4px" }}>
              Xác nhận mật khẩu *
            </label>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Nhập lại mật khẩu"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setErrorMessage(null);
              }}
              style={{
                width: "100%",
                height: "42px",
                background: "rgba(15, 23, 42, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "10px",
                padding: "0 12px",
                color: "#f8fafc",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              height: "46px",
              background: "linear-gradient(135deg, #10b981, #059669)",
              border: "none",
              borderRadius: "10px",
              color: "#ffffff",
              fontSize: "15px",
              fontWeight: "600",
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.7 : 1,
              marginTop: "8px",
              boxShadow: "0 10px 15px -3px rgba(16, 185, 129, 0.3)",
              transition: "all 0.2s ease",
            }}
          >
            {isLoading ? "Đang đăng ký..." : "Đăng ký tài khoản"}
          </button>
        </form>

        {/* Footer Link */}
        <div style={{ textAlign: "center", marginTop: "20px", fontSize: "14px", color: "#94a3b8" }}>
          Đã có tài khoản?{" "}
          <Link href="/login" style={{ color: "#34d399", fontWeight: "600", textDecoration: "none" }}>
            Đăng nhập ngay
          </Link>
        </div>
      </div>
    </div>
  );
}
