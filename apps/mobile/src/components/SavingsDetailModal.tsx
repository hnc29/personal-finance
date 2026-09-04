import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { formatVND } from "../utils/formatters";
import { Account, SavingsHolding } from "../types";
import { api } from "../api/client";

interface SavingsDetailModalProps {
  visible: boolean;
  savings: SavingsHolding | null;
  accounts: Account[];
  onClose: () => void;
  onSuccess: () => void;
}

export const SavingsDetailModal: React.FC<SavingsDetailModalProps> = ({
  visible,
  savings,
  accounts,
  onClose,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const [actionType, setActionType] = useState<"VIEW" | "CLOSE" | "EARLY_CLOSE">("VIEW");
  const [receivingAccountId, setReceivingAccountId] = useState<number | null>(null);
  const [actualInterest, setActualInterest] = useState("");
  const [closedDate, setClosedDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);

  if (!savings) return null;

  const principalNum = parseFloat(savings.principal) || 0;

  const handleCloseSavings = async () => {
    if (!receivingAccountId) {
      Alert.alert("Lỗi", "Vui lòng chọn tài khoản nhận tiền gốc và lãi");
      return;
    }

    try {
      setLoading(true);
      if (actionType === "CLOSE") {
        await api.closeSavings(savings.id, {
          closed_date: closedDate,
          receiving_account_id: receivingAccountId,
          actual_interest: actualInterest ? parseFloat(actualInterest.replace(/[^0-9]/g, "")).toFixed(4) : undefined,
        });
      } else {
        await api.earlyCloseSavings(savings.id, {
          closed_date: closedDate,
          receiving_account_id: receivingAccountId,
        });
      }

      Alert.alert("Thành công", "Đã tất toán sổ tiết kiệm thành công!");
      onClose();
      onSuccess();
    } catch (err: any) {
      Alert.alert("Lỗi tất toán", err?.message || "Không thể tất toán sổ tiết kiệm.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {actionType === "VIEW" ? "Chi tiết sổ tiết kiệm" : actionType === "CLOSE" ? "Tất toán đúng hạn" : "Tất toán trước hạn"}
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                if (actionType !== "VIEW") {
                  setActionType("VIEW");
                } else {
                  onClose();
                }
              }}
            >
              <Ionicons name={actionType === "VIEW" ? "close" : "arrow-back"} size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {actionType === "VIEW" ? (
              <>
                {/* Hero Card */}
                <View style={styles.heroCard}>
                  <View style={styles.badgeRow}>
                    <Ionicons name="shield-checkmark" size={16} color={colors.savings} />
                    <Text style={styles.badgeText}>{savings.bank_name || "Ngân hàng"}</Text>
                    <View style={[styles.statusPill, savings.status === "ACTIVE" || savings.status === "OPEN" ? styles.statusActive : styles.statusClosed]}>
                      <Text style={styles.statusText}>{savings.status === "ACTIVE" || savings.status === "OPEN" ? "Đang gửi" : "Đã tất toán"}</Text>
                    </View>
                  </View>

                  <Text style={styles.heroPrincipal}>{formatVND(principalNum)}</Text>
                  <Text style={styles.heroName}>{savings.name}</Text>
                </View>

                {/* Actions */}
                {(savings.status === "ACTIVE" || savings.status === "OPEN") && (
                  <View style={styles.actionsGrid}>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: colors.savings }]}
                      onPress={() => setActionType("CLOSE")}
                    >
                      <Ionicons name="checkmark-circle-outline" size={20} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text style={styles.actionButtonText}>Tất toán đúng hạn</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionButton, styles.earlyCloseBtn]}
                      onPress={() => setActionType("EARLY_CLOSE")}
                    >
                      <Ionicons name="alert-circle-outline" size={20} color="#f59e0b" style={{ marginRight: 6 }} />
                      <Text style={[styles.actionButtonText, { color: "#f59e0b" }]}>Tất toán trước hạn</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            ) : (
              <>
                {/* Close Form */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Ngày tất toán (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    value={closedDate}
                    onChangeText={setClosedDate}
                    placeholder="2026-08-30"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>

                {actionType === "CLOSE" && (
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Tiền lãi thực nhận (₫)</Text>
                    <TextInput
                      style={styles.input}
                      value={actualInterest ? Number(actualInterest).toLocaleString("vi-VN") : ""}
                      onChangeText={(v) => setActualInterest(v.replace(/[^0-9]/g, ""))}
                      placeholder="Nhập tiền lãi ngân hàng đã trả..."
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                    />
                  </View>
                )}

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Tài khoản nhận tiền gốc & lãi</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
                    {accounts.filter((a) => a.is_active && a.account_type !== "CREDIT_CARD").map((a) => (
                      <TouchableOpacity
                        key={a.id}
                        style={[styles.pill, receivingAccountId === a.id && styles.pillActive]}
                        onPress={() => setReceivingAccountId(a.id)}
                      >
                        <Text style={[styles.pillText, receivingAccountId === a.id && styles.pillTextActive]}>
                          {a.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, { backgroundColor: actionType === "CLOSE" ? colors.savings : "#f59e0b" }]}
                  onPress={handleCloseSavings}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.submitButtonText}>Xác nhận tất toán</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  heroCard: {
    backgroundColor: colors.savingsBg,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.25)",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.savings,
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusActive: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
  },
  statusClosed: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.savings,
  },
  heroPrincipal: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.savings,
    marginVertical: 4,
  },
  heroName: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
  },
  actionsGrid: {
    gap: 10,
  },
  actionButton: {
    flexDirection: "row",
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  earlyCloseBtn: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  formGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillsRow: {
    flexDirection: "row",
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.savings,
    borderColor: colors.savings,
  },
  pillText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  pillTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  submitButton: {
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
});
