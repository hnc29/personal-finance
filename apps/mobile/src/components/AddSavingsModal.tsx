import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { Account, SavingsAccountInput } from "../types";
import { api } from "../api/client";

interface AddSavingsModalProps {
  visible: boolean;
  accounts: Account[];
  onClose: () => void;
  onSuccess: () => void;
}

const BANK_PRESETS = [
  "Vietcombank",
  "BIDV",
  "VietinBank",
  "Agribank",
  "Techcombank",
  "MB Bank",
  "VPBank",
  "ACB",
  "HDBank",
  "VIB",
  "TPBank",
  "Sacombank",
];

const TERM_PRESETS = [
  { label: "1 tháng", months: 1 },
  { label: "3 tháng", months: 3 },
  { label: "6 tháng", months: 6 },
  { label: "12 tháng (1 năm)", months: 12 },
  { label: "24 tháng (2 năm)", months: 24 },
];

export const AddSavingsModal: React.FC<AddSavingsModalProps> = ({
  visible,
  accounts,
  onClose,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const [bankName, setBankName] = useState("Vietcombank");
  const [name, setName] = useState("Sổ tiết kiệm Vietcombank");
  const [principal, setPrincipal] = useState("");
  const [annualRate, setAnnualRate] = useState("5.2");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [maturityDate, setMaturityDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split("T")[0];
  });
  const [fundingAccountId, setFundingAccountId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const handleBankSelect = (b: string) => {
    setBankName(b);
    setName(`Sổ tiết kiệm ${b}`);
  };

  const handleTermSelect = (months: number) => {
    const start = new Date(startDate || new Date().toISOString().split("T")[0]);
    start.setMonth(start.getMonth() + months);
    setMaturityDate(start.toISOString().split("T")[0]);
  };

  const handleSubmit = async () => {
    const pNum = parseFloat(principal.replace(/[^0-9]/g, ""));
    if (isNaN(pNum) || pNum <= 0) {
      Alert.alert("Lỗi", "Vui lòng nhập số tiền gửi gốc hợp lệ");
      return;
    }

    try {
      setLoading(true);
      const data: SavingsAccountInput = {
        name: name.trim() || `Sổ tiết kiệm ${bankName}`,
        bank_name: bankName,
        principal: pNum.toFixed(4),
        annual_rate: annualRate ? (parseFloat(annualRate.replace(",", ".")) / 100).toFixed(4) : undefined,
        start_date: startDate || undefined,
        maturity_date: maturityDate || undefined,
        funding_account_id: fundingAccountId || undefined,
      };

      await api.createSavings(data);
      onClose();
      onSuccess();
    } catch (err: any) {
      Alert.alert("Lỗi khi mở sổ", err?.message || "Không thể tạo sổ tiết kiệm.");
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
            <Text style={styles.headerTitle}>Mở Sổ Tiết Kiệm</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Bank presets */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Ngân hàng gửi tiền</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
                {BANK_PRESETS.map((b) => (
                  <TouchableOpacity
                    key={b}
                    style={[styles.pill, bankName === b && styles.pillActive]}
                    onPress={() => handleBankSelect(b)}
                  >
                    <Text style={[styles.pillText, bankName === b && styles.pillTextActive]}>
                      {b}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Name */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Tên sổ tiết kiệm</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Sổ tiết kiệm Vietcombank 1 năm..."
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Principal */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Số tiền gửi gốc (₫)</Text>
              <TextInput
                style={styles.input}
                value={principal ? Number(principal).toLocaleString("vi-VN") : ""}
                onChangeText={(v) => setPrincipal(v.replace(/[^0-9]/g, ""))}
                placeholder="100.000.000"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </View>

            {/* Term presets */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Chọn nhanh kỳ hạn gửi</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
                {TERM_PRESETS.map((t) => (
                  <TouchableOpacity
                    key={t.label}
                    style={styles.smallPill}
                    onPress={() => handleTermSelect(t.months)}
                  >
                    <Text style={styles.smallPillText}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Annual Rate */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Lãi suất (% / năm)</Text>
              <TextInput
                style={styles.input}
                value={annualRate}
                onChangeText={setAnnualRate}
                placeholder="5.2"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>

            {/* Dates */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Ngày gửi</Text>
                <TextInput
                  style={styles.input}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="2026-08-30"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Ngày đáo hạn</Text>
                <TextInput
                  style={styles.input}
                  value={maturityDate}
                  onChangeText={setMaturityDate}
                  placeholder="2027-08-30"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            {/* Funding Account */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Trừ tiền từ tài khoản nguồn</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
                <TouchableOpacity
                  style={[styles.pill, fundingAccountId === null && styles.pillActive]}
                  onPress={() => setFundingAccountId(null)}
                >
                  <Text style={[styles.pillText, fundingAccountId === null && styles.pillTextActive]}>
                    Không trừ ví
                  </Text>
                </TouchableOpacity>
                {accounts.filter((a) => a.is_active && a.account_type !== "CREDIT_CARD").map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.pill, fundingAccountId === a.id && styles.pillActive]}
                    onPress={() => setFundingAccountId(a.id)}
                  >
                    <Text style={[styles.pillText, fundingAccountId === a.id && styles.pillTextActive]}>
                      {a.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: colors.savings }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitButtonText}>Mở sổ tiết kiệm</Text>
              )}
            </TouchableOpacity>

            <View style={{ height: 20 }} />
          </ScrollView>
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
    maxHeight: "90%",
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
  smallPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    marginRight: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallPillText: {
    fontSize: 11,
    color: colors.savings,
    fontWeight: "600",
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
