"use client";

import React, { useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{ message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessData(null);

    const normEmail = email.trim().toLowerCase();
    if (!normEmail || !normEmail.includes("@")) {
      setError("Vui lòng nhập địa chỉ email hợp lệ");
      return;
    }

    setLoading(true);
    try {
      const res = await api.auth.forgotPassword(normEmail);
      setSuccessData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Yêu cầu đặt lại mật khẩu thất bại";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at top, #1e293b, #0f172a)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#f8fafc",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "rgba(30, 41, 59, 0.75)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          backdropFilter: "blur(12px)",
          borderRadius: "24px",
          padding: "36px",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto",
              fontSize: "24px",
              boxShadow: "0 8px 16px rgba(37, 99, 235, 0.3)",
            }}
          >
            ✉️
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", margin: 0 }}>Quên Mật Khẩu</h1>
          <p style={{ color: "#94a3b8", fontSize: "14px", marginTop: "8px" }}>
            Nhập email của bạn để nhận liên kết đặt lại mật khẩu
          </p>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#fca5a5",
              borderRadius: "10px",
              padding: "12px 16px",
              fontSize: "13px",
              marginBottom: "20px",
            }}
          >
            {error}
          </div>
        )}

        {successData ? (
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                background: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#6ee7b7",
                borderRadius: "12px",
                padding: "16px",
                fontSize: "14px",
                marginBottom: "20px",
                lineHeight: "1.5",
              }}
            >
              ✓ {successData.message}
            </div>

            <div style={{ marginTop: "24px" }}>
              <Link
                href="/login"
                style={{
                  color: "#94a3b8",
                  fontSize: "14px",
                  textDecoration: "none",
                }}
              >
                ← Quay lại Đăng nhập
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: "500",
                  color: "#cbd5e1",
                  marginBottom: "6px",
                }}
              >
                Email tài khoản
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                style={{
                  width: "100%",
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  color: "#f8fafc",
                  fontSize: "14px",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                color: "#ffffff",
                border: "none",
                borderRadius: "12px",
                padding: "12px",
                fontSize: "15px",
                fontWeight: "600",
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Đang gửi yêu cầu..." : "Gửi liên kết đặt lại mật khẩu"}
            </button>

            <div style={{ textAlign: "center", marginTop: "12px" }}>
              <Link
                href="/login"
                style={{
                  color: "#94a3b8",
                  fontSize: "14px",
                  textDecoration: "none",
                }}
              >
                ← Quay lại Đăng nhập
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
