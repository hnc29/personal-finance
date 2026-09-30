"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";

export const ImpersonationBanner: React.FC = () => {
  const router = useRouter();
  const { user, isImpersonating, exitViewAs } = useAuth();

  if (!isImpersonating || !user) {
    return null;
  }

  const handleExit = async () => {
    await exitViewAs();
    router.push("/users");
  };

  return (
    <div
      style={{
        background: "linear-gradient(90deg, #d97706, #b45309)",
        color: "#ffffff",
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: "13px",
        fontWeight: "500",
        position: "sticky",
        top: 0,
        zIndex: 9999,
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "16px" }}>👀</span>
        <span>
          Đang xem dữ liệu với tư cách: <strong>@{user.username}</strong>
          {user.display_name && ` (${user.display_name})`}
          {user.impersonated_by_username && (
            <span style={{ opacity: 0.9, marginLeft: "6px" }}>
              — Quản trị viên: <em>@{user.impersonated_by_username}</em>
            </span>
          )}
        </span>
        <span
          style={{
            background: "rgba(0,0,0,0.2)",
            padding: "2px 8px",
            borderRadius: "4px",
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Chế độ View As User
        </span>
      </div>

      <button
        onClick={handleExit}
        style={{
          background: "#ffffff",
          color: "#92400e",
          border: "none",
          borderRadius: "6px",
          padding: "6px 14px",
          fontSize: "12px",
          fontWeight: "700",
          cursor: "pointer",
          boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
          transition: "all 0.2s ease",
          whiteSpace: "nowrap",
        }}
      >
        ← Thoát chế độ xem (Quay lại Admin)
      </button>
    </div>
  );
};
