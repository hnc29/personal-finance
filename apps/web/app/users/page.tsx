"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { api, User, UserAdminInput, validatePasswordPolicy } from "../../lib/api";

export default function UserManagementPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user: currentUser, isLoading: authLoading, viewAsUser } = useAuth();

  const [showAddModal, setShowAddModal] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Admin Change Password Modal State
  const [changePasswordUser, setChangePasswordUser] = useState<User | null>(null);
  const [adminNewPassword, setAdminNewPassword] = useState("");
  const [adminConfirmPassword, setAdminConfirmPassword] = useState("");
  const [adminPwError, setAdminPwError] = useState<string | null>(null);
  const [adminPwSuccess, setAdminPwSuccess] = useState(false);

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

  const changePasswordMutation = useMutation({
    mutationFn: ({ userId, newPassword }: { userId: number; newPassword: string }) =>
      api.users.changePassword(userId, newPassword),
    onSuccess: () => {
      setAdminPwSuccess(true);
      setTimeout(() => {
        setAdminPwSuccess(false);
        setChangePasswordUser(null);
        setAdminNewPassword("");
        setAdminConfirmPassword("");
        setAdminPwError(null);
      }, 1500);
    },
    onError: (err: Error) => {
      setAdminPwError(err.message || "Không thể đổi mật khẩu");
    },
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || username.trim().length < 3) {
      setFormError("Tên đăng nhập tối thiểu 3 ký tự");
      return;
    }
    const policyErr = validatePasswordPolicy(password);
    if (policyErr) {
      setFormError(policyErr);
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

  const handleViewAs = async (u: User) => {
    if (u.id === currentUser?.id) return;
    if (
      confirm(
        `Chuyển sang chế độ xem dữ liệu của người dùng "${u.username}"? Bạn có thể quay lại tài khoản Admin bất cứ lúc nào qua thanh thông báo trên cùng.`
      )
    ) {
      try {
        await viewAsUser(u.id);
        router.push("/");
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Không thể xem dưới danh nghĩa người dùng này");
      }
    }
  };

  const handleAdminChangePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPwError(null);
    if (!changePasswordUser) return;

    const policyErr = validatePasswordPolicy(adminNewPassword);
    if (policyErr) {
      setAdminPwError(policyErr);
      return;
    }

    if (adminNewPassword !== adminConfirmPassword) {
      setAdminPwError("Mật khẩu xác nhận không khớp");
      return;
    }

    changePasswordMutation.mutate({
      userId: changePasswordUser.id,
      newPassword: adminNewPassword,
    });
  };

  const addPwHasMinLen = password.length >= 8;
  const addPwHasUpper = /[A-Z]/.test(password);
  const addPwHasDigit = /[0-9]/.test(password);

  const adminPwHasMinLen = adminNewPassword.length >= 8;
  const adminPwHasUpper = /[A-Z]/.test(adminNewPassword);
  const adminPwHasDigit = /[0-9]/.test(adminNewPassword);
  const adminPwMatch = adminNewPassword.length > 0 && adminNewPassword === adminConfirmPassword;

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
      maxWidth: "1050px",
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
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "800px" }}>
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
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                          {/* View As User button */}
                          {!isSelf && (
                            <button
                              onClick={() => handleViewAs(u)}
                              title="Xem dữ liệu tài chính với tư cách người dùng này"
                              style={{
                                background: "rgba(245, 158, 11, 0.15)",
                                color: "#fbbf24",
                                border: "1px solid rgba(245, 158, 11, 0.3)",
                                borderRadius: "8px",
                                padding: "6px 10px",
                                fontSize: "12px",
                                fontWeight: "600",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <span>👁</span> View As
                            </button>
                          )}

                          {/* Admin Change Password button */}
                          <button
                            onClick={() => {
                              setChangePasswordUser(u);
                              setAdminNewPassword("");
                              setAdminConfirmPassword("");
                              setAdminPwError(null);
                              setAdminPwSuccess(false);
                            }}
                            title="Đổi mật khẩu người dùng"
                            style={{
                              background: "rgba(59, 130, 246, 0.15)",
                              color: "#60a5fa",
                              border: "1px solid rgba(59, 130, 246, 0.3)",
                              borderRadius: "8px",
                              padding: "6px 10px",
                              fontSize: "12px",
                              fontWeight: "600",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <span>🔑</span> Đổi MK
                          </button>

                          {/* Delete button */}
                          {!isSelf && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              style={{
                                background: "rgba(239, 68, 68, 0.12)",
                                color: "#f87171",
                                border: "1px solid rgba(239, 68, 68, 0.25)",
                                borderRadius: "8px",
                                padding: "6px 10px",
                                fontSize: "12px",
                                fontWeight: "600",
                                cursor: "pointer",
                              }}
                            >
                              Xoá
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Admin Change Password Modal */}
      {changePasswordUser && (
        <div style={{
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
          zIndex: 9999,
        }}>
          <div style={{
            width: "100%",
            maxWidth: "440px",
            background: "#1e293b",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "20px",
            padding: "28px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.6)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: "700", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <span>🔑</span> Đổi Mật Khẩu Cho @{changePasswordUser.username}
              </h2>
              <button
                onClick={() => setChangePasswordUser(null)}
                style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "20px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {adminPwError && (
              <div style={{
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#fca5a5",
                padding: "10px 14px",
                borderRadius: "8px",
                marginBottom: "16px",
                fontSize: "13px",
              }}>
                {adminPwError}
              </div>
            )}

            {adminPwSuccess && (
              <div style={{
                background: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#6ee7b7",
                padding: "10px 14px",
                borderRadius: "8px",
                marginBottom: "16px",
                fontSize: "13px",
                textAlign: "center",
              }}>
                ✓ Đổi mật khẩu thành công!
              </div>
            )}

            <form onSubmit={handleAdminChangePasswordSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#cbd5e1", marginBottom: "6px" }}>
                  Mật khẩu mới cho @{changePasswordUser.username} *
                </label>
                <input
                  type="password"
                  value={adminNewPassword}
                  onChange={(e) => setAdminNewPassword(e.target.value)}
                  placeholder="Tối thiểu 8 ký tự, gồm chữ hoa và số"
                  required
                  style={{
                    width: "100%",
                    height: "40px",
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "8px",
                    padding: "0 12px",
                    color: "#f8fafc",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ marginTop: "6px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ color: adminPwHasMinLen ? "#34d399" : "#94a3b8" }}>
                    {adminPwHasMinLen ? "✓" : "○"} Tối thiểu 8 ký tự
                  </span>
                  <span style={{ color: adminPwHasUpper ? "#34d399" : "#94a3b8" }}>
                    {adminPwHasUpper ? "✓" : "○"} Chứa ít nhất 1 chữ cái in hoa (A-Z)
                  </span>
                  <span style={{ color: adminPwHasDigit ? "#34d399" : "#94a3b8" }}>
                    {adminPwHasDigit ? "✓" : "○"} Chứa ít nhất 1 chữ số (0-9)
                  </span>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#cbd5e1", marginBottom: "6px" }}>
                  Xác nhận mật khẩu mới *
                </label>
                <input
                  type="password"
                  value={adminConfirmPassword}
                  onChange={(e) => setAdminConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  required
                  style={{
                    width: "100%",
                    height: "40px",
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "8px",
                    padding: "0 12px",
                    color: "#f8fafc",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
                {adminConfirmPassword && (
                  <span style={{ fontSize: "12px", color: adminPwMatch ? "#34d399" : "#f87171", marginTop: "4px", display: "block" }}>
                    {adminPwMatch ? "✓ Mật khẩu khớp nhau" : "✕ Mật khẩu không khớp"}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setChangePasswordUser(null)}
                  disabled={changePasswordMutation.isPending}
                  style={{
                    flex: 1,
                    height: "40px",
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
                  disabled={changePasswordMutation.isPending || !adminPwHasMinLen || !adminPwHasUpper || !adminPwHasDigit || !adminPwMatch}
                  style={{
                    flex: 1,
                    height: "40px",
                    background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                    border: "none",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: changePasswordMutation.isPending || !adminPwHasMinLen || !adminPwHasUpper || !adminPwHasDigit || !adminPwMatch ? "not-allowed" : "pointer",
                    opacity: changePasswordMutation.isPending || !adminPwHasMinLen || !adminPwHasUpper || !adminPwHasDigit || !adminPwMatch ? 0.6 : 1,
                  }}
                >
                  {changePasswordMutation.isPending ? "Đang lưu..." : "Đổi mật khẩu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  placeholder="Tối thiểu 8 ký tự, gồm chữ hoa và số"
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
                <div style={{ marginTop: "4px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ color: addPwHasMinLen ? "#34d399" : "#94a3b8" }}>
                    {addPwHasMinLen ? "✓" : "○"} Tối thiểu 8 ký tự
                  </span>
                  <span style={{ color: addPwHasUpper ? "#34d399" : "#94a3b8" }}>
                    {addPwHasUpper ? "✓" : "○"} Chứa ít nhất 1 chữ cái in hoa (A-Z)
                  </span>
                  <span style={{ color: addPwHasDigit ? "#34d399" : "#94a3b8" }}>
                    {addPwHasDigit ? "✓" : "○"} Chứa ít nhất 1 chữ số (0-9)
                  </span>
                </div>
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
                  disabled={createUserMutation.isPending || !addPwHasMinLen || !addPwHasUpper || !addPwHasDigit}
                  style={{
                    flex: 1,
                    height: "42px",
                    background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                    border: "none",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: createUserMutation.isPending || !addPwHasMinLen || !addPwHasUpper || !addPwHasDigit ? "not-allowed" : "pointer",
                    opacity: createUserMutation.isPending || !addPwHasMinLen || !addPwHasUpper || !addPwHasDigit ? 0.6 : 1,
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
