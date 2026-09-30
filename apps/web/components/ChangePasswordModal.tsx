"use client";

import React, { useState } from "react";
import { api, validatePasswordPolicy } from "../lib/api";

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const hasMinLen = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasDigit = /[0-9]/.test(newPassword);
  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!oldPassword) {
      setError("Vui lòng nhập mật khẩu hiện tại");
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
      await api.auth.changePassword(oldPassword, newPassword);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
        onClose();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Đổi mật khẩu thất bại";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        zIndex: 10000,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          background: "#1e293b",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "20px",
          padding: "28px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.6)",
          color: "#f8fafc",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: "700", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🔑</span> Đổi Mật Khẩu
          </h2>
          <button
            onClick={onClose}
            disabled={loading}
            style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "20px", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#fca5a5",
              borderRadius: "8px",
              padding: "10px 14px",
              fontSize: "13px",
              marginBottom: "16px",
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              background: "rgba(16, 185, 129, 0.15)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              color: "#6ee7b7",
              borderRadius: "8px",
              padding: "10px 14px",
              fontSize: "13px",
              marginBottom: "16px",
              textAlign: "center",
            }}
          >
            ✓ Đổi mật khẩu thành công!
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#cbd5e1", marginBottom: "6px" }}>
              Mật khẩu hiện tại
            </label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Nhập mật khẩu hiện tại"
              required
              style={{
                width: "100%",
                background: "rgba(15, 23, 42, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "10px",
                padding: "10px 14px",
                color: "#f8fafc",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#cbd5e1", marginBottom: "6px" }}>
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
                borderRadius: "10px",
                padding: "10px 14px",
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
            <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#cbd5e1", marginBottom: "6px" }}>
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
                borderRadius: "10px",
                padding: "10px 14px",
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

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                color: "#cbd5e1",
                border: "none",
                borderRadius: "10px",
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer",
              }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading || !hasMinLen || !hasUpper || !hasDigit || !isMatch}
              style={{
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: loading || !hasMinLen || !hasUpper || !hasDigit || !isMatch ? "not-allowed" : "pointer",
                opacity: loading || !hasMinLen || !hasUpper || !hasDigit || !isMatch ? 0.6 : 1,
              }}
            >
              {loading ? "Đang xử lý..." : "Lưu mật khẩu mới"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
