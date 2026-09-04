import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { formatVND } from "../utils/formatters";
import { Account } from "../types";
import { api } from "../api/client";

interface BalanceAdjustmentModalProps {
  visible: boolean;
  account: Account | null;
  currentBalance: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const BalanceAdjustmentModal: React.FC<BalanceAdjustmentModalProps> = ({
  visible,
  account,
  currentBalance,
  onClose,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const [actualBalance, setActualBalance] = useState("");
  const [note, setNote] = useState("Điều chỉnh số dư thực tế");
  const [loading, setLoading] = useState(false);

  if (!account) return null;

  const currentBalNum = parseFloat(currentBalance) || 0;
  const actualBalNum = parseFloat(actualBalance.replace(/[^0-9-]/g, "")) || 0;
  const deltaNum = actualBalNum - currentBalNum;
  const isPositiveDelta = deltaNum >= 0;

  const handleAdjust = async () => {
    if (actualBalance === "") {
      Alert.alert("Lỗi", "Vui lòng nhập số dư thực tế hiện tại");
      return;
    }

    if (deltaNum === 0) {
      Alert.alert("Thông báo", "Số dư mới không thay đổi so với số dư hiện tại.");
      return;
    }

    try {
      setLoading(true);
      const today = new Date().toISOString().split("T")[0];
      const deltaStr = deltaNum.toFixed(4);

      await api.createEvent({
        event_type: "ADJUSTMENT",
        transaction_date: today,
        note: note.trim() || `Điều chỉnh số dư tài khoản ${account.name}`,
        entries: [
          {
            account_id: account.id,
            amount: deltaStr,
          },
        ],
      });

      Alert.alert("Thành công", "Đã ghi nhận giao dịch điều chỉnh số dư!");
      onClose();
      onSuccess();
    } catch (err: any) {
      Alert.alert("Lỗi điều chỉnh", err?.message || "Không thể điều chỉnh số dư.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Điều chỉnh số dư</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.accNameTitle}>{account.name}</Text>
            <Text style={styles.currentBalLabel}>
              Số dư trên sổ hiện tại: <Text style={styles.currentBalValue}>{formatVND(currentBalNum)}</Text>
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Số dư thực tế mới (₫)</Text>
              <TextInput
                style={styles.input}
                value={actualBalance ? Number(actualBalance).toLocaleString("vi-VN") : ""}
                onChangeText={(v) => setActualBalance(v.replace(/[^0-9-]/g, ""))}
                placeholder="Nhập số dư thực tế theo sao kê..."
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                autoFocus
              />
            </View>

            {actualBalance !== "" && (
              <View style={[styles.deltaCard, isPositiveDelta ? styles.deltaPositive : styles.deltaNegative]}>
                <Text style={styles.deltaLabel}>Chênh lệch điều chỉnh:</Text>
                <Text style={[styles.deltaValue, { color: isPositiveDelta ? colors.income : colors.expense }]}>
                  {isPositiveDelta ? "+" : ""}{formatVND(deltaNum)}
                </Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.label}>Lý do điều chỉnh (tuỳ chọn)</Text>
              <TextInput
                style={styles.input}
                value={note}
                onChangeText={setNote}
                placeholder="Khớp số dư thực tế..."
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleAdjust}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitButtonText}>Xác nhận điều chỉnh</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  accNameTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  currentBalLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  currentBalValue: {
    fontWeight: "700",
    color: colors.text,
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
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deltaCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  deltaPositive: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
  },
  deltaNegative: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },
  deltaLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  deltaValue: {
    fontSize: 15,
    fontWeight: "800",
  },
  submitButton: {
    backgroundColor: colors.primary,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    marginBottom: 10,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
});
