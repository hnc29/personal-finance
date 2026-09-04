import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { colors } from "../theme/colors";
import { api } from "../api/client";
import { User, UserAdminInput } from "../types";
import { useAuth } from "../context/AuthContext";

interface UserManagementModalProps {
  visible: boolean;
  onClose: () => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  visible,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: users = [], isLoading, refetch } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: api.listUsers,
    enabled: visible && !!currentUser?.is_admin,
  });

  const createUserMutation = useMutation({
    mutationFn: (data: UserAdminInput) => api.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowAddForm(false);
      setUsername("");
      setPassword("");
      setDisplayName("");
      setEmail("");
      setIsAdmin(false);
      setErrorMessage(null);
      Alert.alert("Thành công", "Tạo người dùng mới thành công!");
    },
    onError: (err: any) => {
      setErrorMessage(err?.message || "Không thể tạo người dùng");
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => api.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      Alert.alert("Thành công", "Đã xoá người dùng và toàn bộ dữ liệu liên quan.");
    },
    onError: (err: any) => {
      Alert.alert("Lỗi", err?.message || "Không thể xoá người dùng");
    },
  });

  const handleCreateUser = () => {
    if (!username.trim() || username.trim().length < 3) {
      setErrorMessage("Tên đăng nhập tối thiểu 3 ký tự");
      return;
    }
    if (!password || password.length < 3) {
      setErrorMessage("Mật khẩu tối thiểu 3 ký tự");
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

  const confirmDeleteUser = (u: User) => {
    if (u.id === currentUser?.id) {
      Alert.alert("Cảnh báo", "Bạn không thể xoá chính tài khoản đang đăng nhập!");
      return;
    }

    Alert.alert(
      "Xác nhận xoá",
      `Bạn có chắc chắn muốn xoá người dùng "${u.username}"? Mọi tài khoản, giao dịch và dữ liệu tài sản của người dùng này sẽ bị xoá vĩnh viễn.`,
      [
        { text: "Huỷ", style: "cancel" },
        {
          text: "Xoá vĩnh viễn",
          style: "destructive",
          onPress: () => deleteUserMutation.mutate(u.id),
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Quản Lý Người Dùng</Text>
              <Text style={styles.subtitle}>Phân quyền và quản lý tài khoản thành viên</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
            {/* Action Bar */}
            <View style={styles.actionBar}>
              <Text style={styles.sectionHeader}>Danh sách người dùng ({users.length})</Text>
              <TouchableOpacity
                style={styles.addUserButton}
                onPress={() => {
                  setShowAddForm(!showAddForm);
                  setErrorMessage(null);
                }}
              >
                <Ionicons
                  name={showAddForm ? "remove-circle-outline" : "add-circle-outline"}
                  size={18}
                  color="#ffffff"
                />
                <Text style={styles.addUserButtonText}>
                  {showAddForm ? "Đóng biểu mẫu" : "Thêm người dùng"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Add User Form */}
            {showAddForm && (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>Tạo Tài Khoản Mới</Text>

                {errorMessage ? (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle" size={16} color="#ef4444" />
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  </View>
                ) : null}

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Tên đăng nhập *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="vd: nguyenvana"
                    placeholderTextColor={colors.textMuted}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Mật khẩu *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Tối thiểu 3 ký tự"
                    placeholderTextColor={colors.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Tên hiển thị</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Họ và tên"
                    placeholderTextColor={colors.textMuted}
                    value={displayName}
                    onChangeText={setDisplayName}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email (tuỳ chọn)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="email@example.com"
                    placeholderTextColor={colors.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setIsAdmin(!isAdmin)}
                >
                  <Ionicons
                    name={isAdmin ? "checkbox" : "square-outline"}
                    size={22}
                    color={isAdmin ? colors.primary : colors.textMuted}
                  />
                  <Text style={styles.checkboxLabel}>Cấp quyền Quản trị viên (Admin)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    createUserMutation.isPending && styles.buttonDisabled,
                  ]}
                  onPress={handleCreateUser}
                  disabled={createUserMutation.isPending}
                >
                  {createUserMutation.isPending ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.submitButtonText}>Tạo tài khoản</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Users List */}
            {isLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 32 }} />
            ) : (
              <View style={styles.listContainer}>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <View key={u.id} style={styles.userCard}>
                      <View style={styles.userAvatar}>
                        <Ionicons
                          name={u.is_admin ? "shield-checkmark" : "person"}
                          size={22}
                          color={u.is_admin ? colors.primary : colors.textMuted}
                        />
                      </View>

                      <View style={styles.userInfo}>
                        <View style={styles.userNameRow}>
                          <Text style={styles.userName}>
                            {u.display_name || u.username}
                          </Text>
                          {isSelf && (
                            <View style={styles.selfBadge}>
                              <Text style={styles.selfBadgeText}>Bạn</Text>
                            </View>
                          )}
                          {u.is_admin && (
                            <View style={styles.adminBadge}>
                              <Text style={styles.adminBadgeText}>Admin</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.userSub}>
                          @{u.username} {u.email ? `• ${u.email}` : ""}
                        </Text>
                      </View>

                      {!isSelf && (
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => confirmDeleteUser(u)}
                        >
                          <Ionicons name="trash-outline" size={18} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  actionBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  addUserButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  addUserButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  formCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 12,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 6,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "500",
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: colors.surface,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 14,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 10,
    gap: 8,
  },
  checkboxLabel: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "500",
  },
  submitButton: {
    backgroundColor: colors.primary,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  listContainer: {
    gap: 10,
    marginBottom: 40,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  userName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  selfBadge: {
    backgroundColor: "rgba(37, 99, 235, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  selfBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "700",
  },
  adminBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  adminBadgeText: {
    color: "#f59e0b",
    fontSize: 10,
    fontWeight: "700",
  },
  userSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
});
