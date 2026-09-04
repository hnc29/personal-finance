import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiBaseUrl, setApiBaseUrl } from "../api/config";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { Header } from "../components/Header";
import { Card } from "../components/Card";
import { CategoriesModal } from "../components/CategoriesModal";
import { UserManagementModal } from "../components/UserManagementModal";
import { ChangePasswordModal } from "../components/ChangePasswordModal";
import { useAuth } from "../context/AuthContext";

export const SettingsScreen = () => {
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const [apiUrl, setApiUrlInput] = useState<string>("http://10.0.2.2:8000");
  const [testing, setTesting] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [categoriesModalVisible, setCategoriesModalVisible] = useState(false);
  const [userModalVisible, setUserModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [serverStatus, setServerStatus] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
  }>({
    tested: false,
    success: false,
    message: "",
  });

  const { data: categories = [], refetch: refetchCategories } = useQuery({
    queryKey: ["categories"],
    queryFn: api.getCategories,
  });

  useEffect(() => {
    getApiBaseUrl().then((url) => {
      setApiUrlInput(url);
    });
  }, []);

  const handleTestConnection = async () => {
    if (!apiUrl.trim()) {
      Alert.alert("Lỗi", "Vui lòng nhập URL máy chủ API");
      return;
    }

    try {
      setTesting(true);
      await setApiBaseUrl(apiUrl.trim());
      const res = await api.checkHealth();
      setServerStatus({
        tested: true,
        success: true,
        message: `Kết nối thành công! (${res.app || "Personal Finance"} - Trạng thái: ${res.status})`,
      });
      queryClient.invalidateQueries();
    } catch (err: any) {
      setServerStatus({
        tested: true,
        success: false,
        message: `Kết nối thất bại: ${err?.message || "Không thể kết nối tới máy chủ"}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await setApiBaseUrl(apiUrl.trim());
      await queryClient.invalidateQueries();
      Alert.alert("Thành công", "Đã lưu địa chỉ máy chủ API và làm mới dữ liệu");
    } catch (err: any) {
      Alert.alert("Lỗi", err?.message || "Không thể lưu cấu hình");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Đăng xuất",
      "Bạn có chắc chắn muốn đăng xuất khỏi tài khoản này?",
      [
        { text: "Huỷ", style: "cancel" },
        {
          text: "Đăng xuất",
          style: "destructive",
          onPress: async () => {
            await logout();
            queryClient.clear();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Cài đặt" subtitle="Tài khoản, Hệ thống & Danh mục" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* User Account Card */}
        {user && (
          <Card elevated style={styles.sectionCard}>
            <View style={styles.userProfileRow}>
              <View style={styles.userAvatar}>
                <Ionicons
                  name={user.is_admin ? "shield-checkmark" : "person"}
                  size={26}
                  color={user.is_admin ? colors.primary : colors.text}
                />
              </View>
              <View style={styles.userProfileInfo}>
                <View style={styles.nameBadgeRow}>
                  <Text style={styles.profileDisplayName}>{user.display_name || user.username}</Text>
                  {user.is_admin && (
                    <View style={styles.adminBadge}>
                      <Text style={styles.adminBadgeText}>Admin</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.profileUsername}>@{user.username} {user.email ? `• ${user.email}` : ""}</Text>
              </View>
            </View>

            <View style={styles.userActionList}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => setPasswordModalVisible(true)}
              >
                <View style={styles.menuItemLeft}>
                  <View style={styles.menuIconBg}>
                    <Ionicons name="key-outline" size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.menuTitle}>Đổi mật khẩu</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>

              {user.is_admin && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => setUserModalVisible(true)}
                >
                  <View style={styles.menuItemLeft}>
                    <View style={styles.menuIconBg}>
                      <Ionicons name="people-outline" size={18} color={colors.primary} />
                    </View>
                    <View>
                      <Text style={styles.menuTitle}>Quản lý người dùng</Text>
                      <Text style={styles.menuSubtitle}>Thêm, phân quyền & xoá user</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.menuItem, { borderBottomWidth: 0 }]}
                onPress={handleLogout}
              >
                <View style={styles.menuItemLeft}>
                  <View style={[styles.menuIconBg, { backgroundColor: "rgba(239, 68, 68, 0.12)" }]}>
                    <Ionicons name="log-out-outline" size={18} color="#ef4444" />
                  </View>
                  <Text style={[styles.menuTitle, { color: "#ef4444" }]}>Đăng xuất / Chuyển tài khoản</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </Card>
        )}

        {/* Category Management Card */}
        <Card elevated style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="folder-open-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.sectionTitle}>Quản lý danh mục thu / chi</Text>
          </View>
          <Text style={styles.sectionDesc}>
            Cấu hình cây danh mục phân cấp 3 cấp, phân loại chi tiêu, thu nhập và gán biểu tượng đại diện.
          </Text>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => setCategoriesModalVisible(true)}
          >
            <View style={styles.menuItemLeft}>
              <View style={styles.menuIconBg}>
                <Ionicons name="list" size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.menuTitle}>Danh mục chi tiêu & thu nhập</Text>
                <Text style={styles.menuSubtitle}>{categories.length} danh mục đã tạo</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </Card>

        {/* Server Connection Settings */}
        <Card elevated style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="server-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.sectionTitle}>Kết nối máy chủ (Backend API)</Text>
          </View>
          <Text style={styles.sectionDesc}>
            Địa chỉ API FastAPI đang chạy backend.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>URL Máy Chủ</Text>
            <TextInput
              style={styles.textInput}
              value={apiUrl}
              onChangeText={setApiUrlInput}
              placeholder="http://10.0.2.2:8000"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {serverStatus.tested && (
            <View
              style={[
                styles.statusBanner,
                serverStatus.success ? styles.statusSuccess : styles.statusError,
              ]}
            >
              <Ionicons
                name={serverStatus.success ? "checkmark-circle" : "alert-circle"}
                size={18}
                color={serverStatus.success ? colors.income : colors.expense}
                style={{ marginRight: 8 }}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: serverStatus.success ? colors.income : colors.expense },
                ]}
              >
                {serverStatus.message}
              </Text>
            </View>
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.btn, styles.btnOutline]}
              onPress={handleTestConnection}
              disabled={testing || saving}
            >
              {testing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="pulse" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.btnOutlineText}>Kiểm tra kết nối</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={handleSave}
              disabled={testing || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="save" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.btnPrimaryText}>Lưu cấu hình</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Card>

        {/* System Info */}
        <Card elevated style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="information-circle-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.sectionTitle}>Thông tin ứng dụng</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phiên bản</Text>
            <Text style={styles.infoValue}>1.0.0 (Local-first & Multi-user)</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Môi trường</Text>
            <Text style={styles.infoValue}>Expo / React Native</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Cơ sở dữ liệu</Text>
            <Text style={styles.infoValue}>SQLite WAL / Multi-tenant Isolation</Text>
          </View>
        </Card>
      </ScrollView>

      <CategoriesModal
        visible={categoriesModalVisible}
        categories={categories}
        onRefresh={refetchCategories}
        onClose={() => setCategoriesModalVisible(false)}
      />

      <UserManagementModal
        visible={userModalVisible}
        onClose={() => setUserModalVisible(false)}
      />

      <ChangePasswordModal
        visible={passwordModalVisible}
        onClose={() => setPasswordModalVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  sectionDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 14,
    lineHeight: 18,
  },
  userProfileRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  userAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(37, 99, 235, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.25)",
  },
  userProfileInfo: {
    flex: 1,
  },
  nameBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  profileDisplayName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  adminBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  adminBadgeText: {
    color: "#f59e0b",
    fontSize: 11,
    fontWeight: "700",
  },
  profileUsername: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  userActionList: {
    gap: 2,
  },
  menuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  menuIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(37, 99, 235, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  menuSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    color: colors.text,
    fontSize: 14,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  statusSuccess: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderColor: colors.income,
    borderWidth: 1,
  },
  statusError: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: colors.expense,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    flex: 1,
    fontWeight: "500",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },
  btn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: "transparent",
  },
  btnOutlineText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  btnPrimary: {
    backgroundColor: colors.primary,
  },
  btnPrimaryText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text,
  },
});
