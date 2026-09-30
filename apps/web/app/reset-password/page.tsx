"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, validatePasswordPolicy } from "../../lib/api";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenParam = searchParams.get("token") || "";

  const [token, setToken] = useState(tokenParam);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasMinLen = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasDigit = /[0-9]/.test(newPassword);
  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanToken = token.trim();
    if (!cleanToken) {
      setError("Vui lòng cung cấp mã token đặt lại mật khẩu");
      return;
    }

    const policyErr = validatePasswordPolicy(newPassword);
    if (policyErr) {
      setError(policyErr);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }

    setLoading(true);
    try {
      await api.auth.resetPassword(cleanToken, newPassword);
      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Đặt lại mật khẩu thất bại";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
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
            background: "linear-gradient(135deg, #10b981, #059669)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px auto",
            fontSize: "24px",
            boxShadow: "0 8px 16px rgba(16, 185, 129, 0.3)",
          }}
        >
          🔐
        </div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", margin: 0 }}>Đặt Lại Mật Khẩu</h1>
        <p style={{ color: "#94a3b8", fontSize: "14px", marginTop: "8px" }}>
          Thiết lập mật khẩu mới cho tài khoản của bạn
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

      {success ? (
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              background: "rgba(16, 185, 129, 0.15)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              color: "#6ee7b7",
              borderRadius: "12px",
              padding: "18px",
              fontSize: "14px",
              marginBottom: "20px",
            }}
          >
            ✓ Đặt lại mật khẩu thành công! Đang chuyển hướng đến trang đăng nhập...
          </div>
          <Link
            href="/login"
            style={{
              color: "#38bdf8",
              fontSize: "14px",
              textDecoration: "underline",
            }}
          >
            Bấm vào đây nếu không tự chuyển hướng →
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {!tokenParam && (
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
                Mã Token đặt lại
              </label>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Dán mã token từ email"
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
          )}

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
              Mật khẩu mới
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nhập mật khẩu mới"
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

            {/* Password Policy Hints */}
            <div style={{ marginTop: "8px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ color: hasMinLen ? "#34d399" : "#94a3b8" }}>
                {hasMinLen ? "✓" : "○"} Tối thiểu 8 ký tự
              </span>
              <span style={{ color: hasUpper ? "#34d399" : "#94a3b8" }}>
                {hasUpper ? "✓" : "○"} Ít nhất 1 chữ cái in hoa (A-Z)
              </span>
              <span style={{ color: hasDigit ? "#34d399" : "#94a3b8" }}>
                {hasDigit ? "✓" : "○"} Ít nhất 1 chữ số (0-9)
              </span>
            </div>
          </div>

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
              Xác nhận mật khẩu mới
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu mới"
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
            {confirmPassword && (
              <span style={{ fontSize: "12px", color: isMatch ? "#34d399" : "#f87171", marginTop: "4px", display: "block" }}>
                {isMatch ? "✓ Mật khẩu khớp nhau" : "✕ Mật khẩu không khớp"}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !hasMinLen || !hasUpper || !hasDigit || !isMatch}
            style={{
              background: "linear-gradient(135deg, #10b981, #059669)",
              color: "#ffffff",
              border: "none",
              borderRadius: "12px",
              padding: "12px",
              fontSize: "15px",
              fontWeight: "600",
              cursor: loading || !hasMinLen || !hasUpper || !hasDigit || !isMatch ? "not-allowed" : "pointer",
              boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
              opacity: loading || !hasMinLen || !hasUpper || !hasDigit || !isMatch ? 0.7 : 1,
            }}
          >
            {loading ? "Đang xử lý..." : "Cập nhật mật khẩu"}
          </button>

          <div style={{ textAlign: "center", marginTop: "8px" }}>
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
  );
}

export default function ResetPasswordPage() {
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
      <Suspense fallback={<div style={{ color: "#94a3b8" }}>Đang tải...</div>}>
        <ResetPasswordContent />
      </Suspense>
    </div>
  );
}
