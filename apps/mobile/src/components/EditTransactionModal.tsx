import React, { useState, useEffect } from "react";
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
import { formatVND } from "../utils/formatters";
import { Account, Category, FinancialEvent, EventType } from "../types";
import { api } from "../api/client";
import { CategoryPickerModal } from "./CategoryPickerModal";

interface EditTransactionModalProps {
  visible: boolean;
  event: FinancialEvent | null;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  visible,
  event,
  accounts,
  categories,
  onClose,
  onSaved,
}) => {
  const insets = useSafeAreaInsets();
  const [eventType, setEventType] = useState<EventType>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [fromAccountId, setFromAccountId] = useState<number | null>(null);
  const [toAccountId, setToAccountId] = useState<number | null>(null);
  const [payee, setPayee] = useState("");
  const [trip, setTrip] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);

  const selectedCat = categories.find((c) => c.id === categoryId);

  useEffect(() => {
    if (event) {
      setEventType(event.event_type);
      setDate(event.transaction_date || new Date().toISOString().split("T")[0]);
      setCategoryId(event.category_id);
      setPayee(event.payee_text || "");
      setTrip(event.trip_event_text || "");
      setNote(event.note || "");

      if (event.event_type === "TRANSFER" || event.event_type === "CREDIT_CARD_PAYMENT") {
        const fromEntry = event.entries.find((e) => parseFloat(e.amount) < 0);
        const toEntry = event.entries.find((e) => parseFloat(e.amount) > 0);
        if (fromEntry) {
          setFromAccountId(fromEntry.account_id);
          setAmount(String(Math.abs(parseFloat(fromEntry.amount))));
        }
        if (toEntry) {
          setToAccountId(toEntry.account_id);
        }
      } else {
        if (event.entries.length > 0) {
          setFromAccountId(event.entries[0].account_id);
          setAmount(String(Math.abs(parseFloat(event.entries[0].amount))));
        }
      }
    }
  }, [event]);

  const handleAmountChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, "");
    setAmount(cleaned);
  };

  const handleSave = async () => {
    if (!event) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert("Lỗi", "Vui lòng nhập số tiền hợp lệ lớn hơn 0");
      return;
    }

    if (!fromAccountId) {
      Alert.alert("Lỗi", "Vui lòng chọn tài khoản thanh toán");
      return;
    }

    if (
      (eventType === "TRANSFER" || eventType === "CREDIT_CARD_PAYMENT") &&
      !toAccountId
    ) {
      Alert.alert("Lỗi", "Vui lòng chọn tài khoản nhận tiền");
      return;
    }

    if (
      (eventType === "TRANSFER" || eventType === "CREDIT_CARD_PAYMENT") &&
      fromAccountId === toAccountId
    ) {
      Alert.alert("Lỗi", "Tài khoản nguồn và đích không được trùng nhau");
      return;
    }

    try {
      setLoading(true);
      const entries = [];
      const amtStr = numAmount.toFixed(4);

      if (eventType === "EXPENSE") {
        entries.push({ account_id: fromAccountId, amount: `-${amtStr}` });
      } else if (eventType === "INCOME") {
        entries.push({ account_id: fromAccountId, amount: amtStr });
      } else {
        entries.push({ account_id: fromAccountId, amount: `-${amtStr}` });
        entries.push({ account_id: toAccountId!, amount: amtStr });
      }

      await api.updateEvent(event.id, {
        event_type: eventType,
        transaction_date: date,
        category_id: (eventType === "EXPENSE" || eventType === "INCOME") ? categoryId : null,
        payee_text: payee.trim() || undefined,
        trip_event_text: trip.trim() || undefined,
        note: note.trim() || undefined,
        entries,
      });

      onClose();
      onSaved();
    } catch (err: any) {
      Alert.alert("Lỗi cập nhật", err?.message || "Không thể cập nhật giao dịch.");
    } finally {
      setLoading(false);
    }
  };

  if (!event) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Chỉnh sửa giao dịch</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Amount Field */}
            <View style={styles.amountContainer}>
              <Text style={styles.currencyPrefix}>₫</Text>
              <TextInput
                style={styles.amountInput}
                value={amount ? Number(amount).toLocaleString("vi-VN") : ""}
                onChangeText={handleAmountChange}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                autoFocus
              />
            </View>

            {/* Date Field */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Ngày giao dịch (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={date}
                onChangeText={setDate}
                placeholder="2026-08-30"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Category Selector for Expense / Income */}
            {(eventType === "EXPENSE" || eventType === "INCOME") && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Nhóm danh mục</Text>
                <TouchableOpacity
                  style={styles.categoryPickerBtn}
                  onPress={() => setShowCatPicker(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={selectedCat?.icon as any || "grid-outline"}
                    size={20}
                    color={colors.primary}
                    style={{ marginRight: 10 }}
                  />
                  <Text
                    style={[
                      styles.categoryPickerBtnText,
                      !selectedCat && { color: colors.textMuted },
                    ]}
                    numberOfLines={1}
                  >
                    {selectedCat?.name || "Chọn nhóm danh mục..."}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {/* From Account */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                {eventType === "INCOME" ? "Tài khoản nhận tiền" : "Tài khoản thanh toán / nguồn"}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
                {accounts.filter((a) => a.is_active).map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.pill, fromAccountId === a.id && styles.pillActive]}
                    onPress={() => setFromAccountId(a.id)}
                  >
                    <Text style={[styles.pillText, fromAccountId === a.id && styles.pillTextActive]}>
                      {a.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* To Account (Transfer / Card payment) */}
            {(eventType === "TRANSFER" || eventType === "CREDIT_CARD_PAYMENT") && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Tài khoản nhận / đích</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
                  {accounts.filter((a) => a.is_active && a.id !== fromAccountId).map((a) => (
                    <TouchableOpacity
                      key={a.id}
                      style={[styles.pill, toAccountId === a.id && styles.pillActive]}
                      onPress={() => setToAccountId(a.id)}
                    >
                      <Text style={[styles.pillText, toAccountId === a.id && styles.pillTextActive]}>
                        {a.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Payee */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Người nhận / Đơn vị (tuỳ chọn)</Text>
              <TextInput
                style={styles.input}
                value={payee}
                onChangeText={setPayee}
                placeholder="Shopee, Circle K, Highlands..."
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Trip / Event */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Chuyến đi / Sự kiện (tuỳ chọn)</Text>
              <TextInput
                style={styles.input}
                value={trip}
                onChangeText={setTrip}
                placeholder="Du lịch Đà Nẵng, Tết 2026..."
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Note */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Ghi chú (tuỳ chọn)</Text>
              <TextInput
                style={[styles.input, { height: 64, textAlignVertical: "top" }]}
                value={note}
                onChangeText={setNote}
                placeholder="Nội dung chi tiết..."
                placeholderTextColor={colors.textMuted}
                multiline
              />
            </View>

            {/* Submit button */}
            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitButtonText}>Lưu thay đổi</Text>
              )}
            </TouchableOpacity>

            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <CategoryPickerModal
        visible={showCatPicker}
        eventType={eventType}
        categories={categories}
        selectedCategoryId={categoryId}
        onSelect={(catId) => setCategoryId(catId)}
        onClose={() => setShowCatPicker(false)}
      />
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
  amountContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  currencyPrefix: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.primary,
    marginRight: 6,
  },
  amountInput: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
    minWidth: 140,
    textAlign: "center",
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
  categoryPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryPickerBtnText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
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
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  pillTextActive: {
    color: "#ffffff",
  },
  submitButton: {
    backgroundColor: colors.primary,
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
