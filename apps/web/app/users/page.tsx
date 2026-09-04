"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { api, User, UserAdminInput } from "../../lib/api";

export default function UserManagementPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user: currentUser, isLoading: authLoading } = useAuth();

  const [showAddModal, setShowAddModal] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !currentUser) {
      router.push("/login");
    }
  }, [currentUser, authLoading, router]);

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: api.users.list,
    enabled: !!currentUser?.is_admin,
  });

  const createUserMutation = useMutation({
    mutationFn: (data: UserAdminInput) => api.users.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowAddModal(false);
      setUsername("");
      setPassword("");
      setDisplayName("");
      setEmail("");
      setIsAdmin(false);
      setFormError(null);
    },
    onError: (err: Error) => {
      setFormError(err.message || "Không thể tạo người dùng");
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => api.users.delete(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: Error) => {
      alert(err.message || "Không thể xoá người dùng");
    },
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || username.trim().length < 3) {
      setFormError("Tên đăng nhập tối thiểu 3 ký tự");
      return;
    }
    if (!password || password.length < 3) {
      setFormError("Mật khẩu tối thiểu 3 ký tự");
      return;
    }

    createUserMutation.mutate({
      username: username.trim(),
      password,
      display_name: displayName.trim() || undefined,
      email: email.trim() || undefined,
      is_admin: isAdmin,
    });
  };

  const handleDeleteUser = (u: User) => {
    if (u.id === currentUser?.id) {
      alert("Bạn không thể xoá tài khoản đang đăng nhập!");
      return;
    }
    if (confirm(`Bạn có chắc chắn muốn xoá người dùng "${u.username}"? Mọi tài khoản, giao dịch và dữ liệu tài sản của người dùng này sẽ bị xoá vĩnh viễn.`)) {
      deleteUserMutation.mutate(u.id);
    }
  };

  if (authLoading || (!currentUser?.is_admin && !authLoading)) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
        {!currentUser?.is_admin && !authLoading ? (
          <div>
            <h2>Bạn không có quyền truy cập trang này</h2>
            <Link href="/" style={{ color: "#38bdf8" }}>Quay lại Trang chủ</Link>
          </div>
        ) : (
          <div>Đang tải...</div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: "1000px",
      margin: "0 auto",
      padding: "32px 20px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      color: "#f8fafc",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "28px",
        flexWrap: "wrap",
        gap: "16px",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <Link href="/" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "14px" }}>
              ← Quay lại Sổ cái
            </Link>
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: "700", margin: 0 }}>Quản Lý Người Dùng & Phân Quyền</h1>
          <p style={{ color: "#94a3b8", fontSize: "14px", margin: "4px 0 0 0" }}>
            Mỗi người dùng có dữ liệu tài chính riêng biệt và hoàn toàn độc lập
          </p>
        </div>

        <button
          onClick={() => {
            setShowAddModal(true);
            setFormError(null);
          }}
          style={{
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            color: "#fff",
            border: "none",
            borderRadius: "10px",
            padding: "10px 18px",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
          }}
        >
          + Thêm người dùng mới
        </button>
      </div>

      {/* Users Table Card */}
      <div style={{
        background: "rgba(30, 41, 59, 0.7)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "16px",
        overflow: "hidden",
      }}>
        {isLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Đang tải danh sách...</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "rgba(15, 23, 42, 0.6)", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
                <th style={{ padding: "14px 18px", fontSize: "13px", fontWeight: "600", color: "#94a3b8" }}>Tên người dùng</th>
                <th style={{ padding: "14px 18px", fontSize: "13px", fontWeight: "600", color: "#94a3b8" }}>Tên hiển thị</th>
                <th style={{ padding: "14px 18px", fontSize: "13px", fontWeight: "600", color: "#94a3b8" }}>Email</th>
                <th style={{ padding: "14px 18px", fontSize: "13px", fontWeight: "600", color: "#94a3b8" }}>Vai trò</th>
                <th style={{ padding: "14px 18px", fontSize: "13px", fontWeight: "600", color: "#94a3b8" }}>Trạng thái</th>
                <th style={{ padding: "14px 18px", fontSize: "13px", fontWeight: "600", color: "#94a3b8", textAlign: "right" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
                    <td style={{ padding: "14px 18px", fontSize: "14px", fontWeight: "600" }}>
                      @{u.username}
                      {isSelf && (
                        <span style={{
                          marginLeft: "8px",
                          background: "rgba(37, 99, 235, 0.2)",
                          color: "#60a5fa",
                          fontSize: "11px",
                          padding: "2px 6px",
                          borderRadius: "4px",
                        }}>
                          Bạn
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: "14px", color: "#cbd5e1" }}>{u.display_name || "-"}</td>
                    <td style={{ padding: "14px 18px", fontSize: "14px", color: "#94a3b8" }}>{u.email || "-"}</td>
                    <td style={{ padding: "14px 18px", fontSize: "13px" }}>
                      {u.is_admin ? (
                        <span style={{
                          background: "rgba(245, 158, 11, 0.15)",
                          color: "#fbbf24",
                          padding: "3px 8px",
                          borderRadius: "6px",
                          fontWeight: "600",
                        }}>
                          Quản trị viên (Admin)
                        </span>
                      ) : (
                        <span style={{
                          background: "rgba(100, 116, 139, 0.2)",
                          color: "#94a3b8",
                          padding: "3px 8px",
                          borderRadius: "6px",
                        }}>
                          Thành viên
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: "13px" }}>
                      <span style={{
                        color: u.is_active ? "#34d399" : "#f87171",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}>
                        <span style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: u.is_active ? "#34d399" : "#f87171",
                        }} />
                        {u.is_active ? "Đang hoạt động" : "Tạm khoá"}
                      </span>
                    </td>
                    <td style={{ padding: "14px 18px", textAlign: "right" }}>
                      {!isSelf && (
                        <button
                          onClick={() => handleDeleteUser(u)}
                          style={{
                            background: "rgba(239, 68, 68, 0.12)",
                            color: "#f87171",
                            border: "1px solid rgba(239, 68, 68, 0.25)",
                            borderRadius: "8px",
                            padding: "6px 12px",
                            fontSize: "12px",
                            fontWeight: "600",
                            cursor: "pointer",
                          }}
                        >
                          Xoá
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.7)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          zIndex: 999,
        }}>
          <div style={{
            width: "100%",
            maxWidth: "460px",
            background: "#1e293b",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "20px",
            padding: "28px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: "700", margin: 0 }}>Thêm Người Dùng Mới</h2>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "20px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {formError && (
              <div style={{
                background: "rgba(239, 68, 68, 0.15)",
                color: "#fca5a5",
                padding: "10px 14px",
                borderRadius: "10px",
                marginBottom: "16px",
                fontSize: "13px",
              }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateUser} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#cbd5e1", marginBottom: "4px" }}>
                  Tên đăng nhập *
                </label>
                <input
                  type="text"
                  placeholder="vd: nguyenvana"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={{
                    width: "100%",
                    height: "40px",
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: "8px",
                    padding: "0 12px",
                    color: "#f8fafc",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#cbd5e1", marginBottom: "4px" }}>
                  Mật khẩu *
                </label>
                <input
                  type="password"
                  placeholder="Tối thiểu 3 ký tự"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: "100%",
                    height: "40px",
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: "8px",
                    padding: "0 12px",
                    color: "#f8fafc",
                    fontSize: "14px",
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
                  placeholder="Họ và tên"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  style={{
                    width: "100%",
                    height: "40px",
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: "8px",
                    padding: "0 12px",
                    color: "#f8fafc",
                    fontSize: "14px",
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
                    height: "40px",
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: "8px",
                    padding: "0 12px",
                    color: "#f8fafc",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", margin: "6px 0" }}>
                <input
                  type="checkbox"
                  checked={isAdmin}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                />
                <span style={{ fontSize: "13px", color: "#cbd5e1" }}>Cấp quyền Quản trị viên (Admin)</span>
              </label>

              <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    flex: 1,
                    height: "42px",
                    background: "transparent",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "8px",
                    color: "#94a3b8",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  style={{
                    flex: 1,
                    height: "42px",
                    background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                    border: "none",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: createUserMutation.isPending ? "not-allowed" : "pointer",
                  }}
                >
                  {createUserMutation.isPending ? "Đang tạo..." : "Tạo tài khoản"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
