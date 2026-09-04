import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Account, Category, EventInput, EventType } from "../types";
import { api } from "../api/client";
import { AccountLogo } from "./AccountLogo";
import { CategoryPickerModal } from "./CategoryPickerModal";

interface QuickAddModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  accounts: Account[];
  categories: Category[];
}

const WEEKDAYS = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

function getCategoryRoot(cat: Category, allCats: Category[]): Category {
  const byId = new Map(allCats.map((c) => [c.id, c]));
  let current: Category = cat;
  const seen = new Set<number>();
  while (current.parent_id != null && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = byId.get(current.parent_id);
    if (!parent) break;
    current = parent;
  }
  return current;
}

function filterCategoriesForType(type: EventType, allCats: Category[]): Category[] {
  const isExpense = type === "EXPENSE";
  const isIncome = type === "INCOME";
  if (!isExpense && !isIncome) return allCats;

  return allCats.filter((c) => {
    const root = getCategoryRoot(c, allCats);
    const rootName = root.name.toLowerCase();
    if (isExpense) {
      return (
        rootName.includes("expense") ||
        rootName.includes("chi") ||
        rootName.includes("tiêu") ||
        (!rootName.includes("income") && !rootName.includes("thu") && !rootName.includes("lương"))
      );
    }
    if (isIncome) {
      return (
        rootName.includes("income") ||
        rootName.includes("thu") ||
        rootName.includes("lương") ||
        rootName.includes("thưởng") ||
        rootName.includes("lãi")
      );
    }
    return true;
  });
}

function getCategoryPath(category: Category, allCategories: Category[]): string {
  const byId = new Map(allCategories.map((c) => [c.id, c]));
  const names: string[] = [];
  let current: Category | undefined = category;
  const seen = new Set<number>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const isRoot = current.parent_id == null;
    const isGenericRoot = current.name.toLowerCase() === "expenses" || current.name.toLowerCase() === "income" || current.name.toLowerCase() === "chi tiêu" || current.name.toLowerCase() === "thu nhập";
    if (!isRoot || !isGenericRoot || names.length === 0) {
      names.unshift(current.name);
    }
    current = current.parent_id == null ? undefined : byId.get(current.parent_id);
  }
  return names.join(" › ");
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  visible,
  onClose,
  onSuccess,
  accounts,
  categories,
}) => {
  const insets = useSafeAreaInsets();
  const [eventType, setEventType] = useState<EventType>("EXPENSE");
  const [amountRaw, setAmountRaw] = useState<string>("");
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    accounts[0]?.id ?? null
  );
  const [targetAccountId, setTargetAccountId] = useState<number | null>(
    accounts.length > 1 ? accounts[1]?.id ?? null : null
  );

  const activeAccounts = accounts.filter((a) => a.is_active);
  const activeCategories = categories.filter((c) => c.is_active);

  const expenseCategories = filterCategoriesForType("EXPENSE", activeCategories);
  const incomeCategories = filterCategoriesForType("INCOME", activeCategories);
  const currentTypeCategories = eventType === "INCOME" ? incomeCategories : expenseCategories;

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    expenseCategories[0]?.id ?? activeCategories[0]?.id ?? null
  );
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [note, setNote] = useState<string>("");
  const [payee, setPayee] = useState<string>("");
  const [trip, setTrip] = useState<string>("");
  const [showMoreDetails, setShowMoreDetails] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Sub-pickers
  const [showAccountPicker, setShowAccountPicker] = useState<boolean>(false);
  const [showTargetAccountPicker, setShowTargetAccountPicker] = useState<boolean>(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState<boolean>(false);

  const selectedAccount = activeAccounts.find((a) => a.id === selectedAccountId) || activeAccounts[0];
  const targetAccount = activeAccounts.find((a) => a.id === targetAccountId);
  const selectedCategory = activeCategories.find((c) => c.id === selectedCategoryId);

  const handleTypeChange = (type: EventType) => {
    setEventType(type);
    const validCats = type === "INCOME" ? incomeCategories : expenseCategories;
    if (selectedCategoryId && !validCats.some((c) => c.id === selectedCategoryId)) {
      setSelectedCategoryId(validCats[0]?.id ?? null);
    }
  };

  const handleAmountChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, "");
    setAmountRaw(cleaned);
  };

  const formatDisplayAmount = (raw: string) => {
    if (!raw) return "0";
    return Number(raw).toLocaleString("vi-VN");
  };

  const formatDateText = (d: Date): string => {
    const weekday = WEEKDAYS[d.getDay()];
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear();
    return `${weekday}, ${day}/${month}/${year}`;
  };

  const handlePrevDay = () => {
    setSelectedDate(new Date(selectedDate.getTime() - 86400000));
  };

  const handleNextDay = () => {
    setSelectedDate(new Date(selectedDate.getTime() + 86400000));
  };

  const handleSubmit = async () => {
    const amountNum = parseFloat(amountRaw);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert("Lỗi", "Vui lòng nhập số tiền hợp lệ");
      return;
    }

    if (!selectedAccount) {
      Alert.alert("Lỗi", "Vui lòng chọn tài khoản");
      return;
    }

    const year = selectedDate.getFullYear();
    const month = (selectedDate.getMonth() + 1).toString().padStart(2, "0");
    const day = selectedDate.getDate().toString().padStart(2, "0");
    const transactionDateStr = `${year}-${month}-${day}`;

    try {
      setSubmitting(true);
      let entries: { account_id: number; amount: string }[] = [];

      if (eventType === "EXPENSE") {
        entries = [{ account_id: selectedAccount.id, amount: (-amountNum).toString() }];
      } else if (eventType === "INCOME") {
        entries = [{ account_id: selectedAccount.id, amount: amountNum.toString() }];
      } else if (eventType === "TRANSFER" || eventType === "CREDIT_CARD_PAYMENT") {
        if (!targetAccountId || targetAccountId === selectedAccount.id) {
          Alert.alert("Lỗi", "Vui lòng chọn tài khoản đích khác tài khoản nguồn");
          setSubmitting(false);
          return;
        }
        entries = [
          { account_id: selectedAccount.id, amount: (-amountNum).toString() },
          { account_id: targetAccountId, amount: amountNum.toString() },
        ];
      }

      const payload: EventInput = {
        event_type: eventType,
        transaction_date: transactionDateStr,
        category_id: (eventType === "TRANSFER" || eventType === "CREDIT_CARD_PAYMENT") ? null : selectedCategoryId,
        payee_text: payee.trim() || undefined,
        trip_event_text: trip.trim() || undefined,
        note: note.trim() || undefined,
        entries,
      };

      await api.createEvent(payload);
      // Reset form
      setAmountRaw("");
      setPayee("");
      setTrip("");
      setNote("");
      setShowMoreDetails(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert("Lỗi khi lưu giao dịch", err?.message || "Không thể kết nối máy chủ");
    } finally {
      setSubmitting(false);
    }
  };

  const parsedAmount = amountRaw ? parseFloat(amountRaw) : 0;
  const isAmountValid = parsedAmount > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.cancelBtnText}>Huỷ</Text>
            </TouchableOpacity>

            <Text style={styles.title}>Thêm Giao Dịch</Text>

            <View style={{ width: 64 }} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {/* Main Form Card */}
            <View style={styles.mainCard}>
              {/* Segmented Control Tabs */}
              <View style={styles.segmentedContainer}>
                <TouchableOpacity
                  style={[styles.segmentTab, eventType === "EXPENSE" && styles.segmentTabActive]}
                  onPress={() => handleTypeChange("EXPENSE")}
                >
                  <Text style={[styles.segmentText, eventType === "EXPENSE" && styles.segmentTextActive]}>
                    Khoản chi
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.segmentTab, eventType === "INCOME" && styles.segmentTabActive]}
                  onPress={() => handleTypeChange("INCOME")}
                >
                  <Text style={[styles.segmentText, eventType === "INCOME" && styles.segmentTextActive]}>
                    Khoản thu
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.segmentTab, (eventType === "TRANSFER" || eventType === "CREDIT_CARD_PAYMENT") && styles.segmentTabActive]}
                  onPress={() => handleTypeChange("TRANSFER")}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      (eventType === "TRANSFER" || eventType === "CREDIT_CARD_PAYMENT") && styles.segmentTextActive,
                    ]}
                  >
                    Chuyển tiền
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Row 1: Account Selector */}
              <TouchableOpacity
                style={styles.formRow}
                onPress={() => setShowAccountPicker(true)}
                activeOpacity={0.7}
              >
                <View style={styles.rowLeftIcon}>
                  {selectedAccount ? (
                    <AccountLogo
                      name={selectedAccount.name}
                      accountType={selectedAccount.account_type}
                      size={32}
                    />
                  ) : (
                    <View style={styles.accountIconPlaceholder}>
                      <Ionicons name="wallet-outline" size={18} color="#64748b" />
                    </View>
                  )}
                </View>

                <View style={styles.rowCenter}>
                  <Text style={styles.rowValueText}>
                    {selectedAccount?.name || "Chọn tài khoản"}
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              {/* Row 2: Amount Input */}
              <View style={styles.formRow}>
                <View style={styles.vndBadge}>
                  <Text style={styles.vndText}>VND</Text>
                </View>

                <View style={styles.amountCenter}>
                  <Text style={styles.amountLabel}>Số tiền</Text>
                  <TextInput
                    style={styles.amountInput}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#cbd5e1"
                    value={amountRaw ? formatDisplayAmount(amountRaw) : ""}
                    onChangeText={handleAmountChange}
                  />
                </View>
              </View>

              <View style={styles.rowDivider} />

              {/* Row 3: Category / Nhóm (Hidden if Transfer/Vay nợ) */}
              {eventType !== "TRANSFER" && eventType !== "CREDIT_CARD_PAYMENT" && (
                <>
                  <TouchableOpacity
                    style={styles.formRow}
                    onPress={() => setShowCategoryPicker(true)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rowLeftIcon}>
                      <View
                        style={[
                          styles.categoryIconCircle,
                          selectedCategory && { backgroundColor: "rgba(16, 185, 129, 0.15)" },
                        ]}
                      >
                        <Ionicons
                          name={selectedCategory?.icon as any || "grid-outline"}
                          size={18}
                          color={selectedCategory ? "#10b981" : "#94a3b8"}
                        />
                      </View>
                    </View>

                    <View style={styles.rowCenter}>
                      <Text
                        style={[
                          styles.rowValueText,
                          !selectedCategory && { color: "#94a3b8" },
                        ]}
                        numberOfLines={1}
                      >
                        {selectedCategory ? getCategoryPath(selectedCategory, categories) : "Chọn nhóm"}
                      </Text>
                    </View>

                    <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                  </TouchableOpacity>

                  <View style={styles.rowDivider} />
                </>
              )}

              {/* If Transfer/Vay nợ: Destination Account */}
              {(eventType === "TRANSFER" || eventType === "CREDIT_CARD_PAYMENT") && (
                <>
                  <TouchableOpacity
                    style={styles.formRow}
                    onPress={() => setShowTargetAccountPicker(true)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rowLeftIcon}>
                      {targetAccount ? (
                        <AccountLogo
                          name={targetAccount.name}
                          accountType={targetAccount.account_type}
                          size={32}
                        />
                      ) : (
                        <View style={styles.accountIconPlaceholder}>
                          <Ionicons name="arrow-forward-circle-outline" size={18} color="#64748b" />
                        </View>
                      )}
                    </View>

                    <View style={styles.rowCenter}>
                      <Text style={styles.rowValueText}>
                        {targetAccount ? `Đến: ${targetAccount.name}` : "Chọn tài khoản đích"}
                      </Text>
                    </View>

                    <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                  </TouchableOpacity>

                  <View style={styles.rowDivider} />
                </>
              )}

              {/* Row 4: Note / Ghi chú */}
              <View style={styles.formRow}>
                <View style={styles.rowLeftIcon}>
                  <Ionicons name="reorder-three-outline" size={24} color="#64748b" />
                </View>

                <View style={styles.rowCenter}>
                  <TextInput
                    style={styles.noteInput}
                    placeholder="Ghi chú"
                    placeholderTextColor="#94a3b8"
                    value={note}
                    onChangeText={setNote}
                  />
                </View>

                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </View>

              <View style={styles.rowDivider} />

              {/* Row 5: Date Selector */}
              <View style={styles.formRow}>
                <View style={styles.rowLeftIcon}>
                  <Ionicons name="calendar-outline" size={22} color="#0f172a" />
                </View>

                <View style={styles.dateSelectorRow}>
                  <TouchableOpacity
                    style={styles.dateArrowBtn}
                    onPress={handlePrevDay}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="chevron-back" size={16} color="#16a34a" />
                  </TouchableOpacity>

                  <View style={styles.datePill}>
                    <Text style={styles.datePillText}>{formatDateText(selectedDate)}</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.dateArrowBtn}
                    onPress={handleNextDay}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="chevron-forward" size={16} color="#16a34a" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Button "Thêm chi tiết" */}
            <TouchableOpacity
              style={styles.addDetailBtn}
              onPress={() => setShowMoreDetails(!showMoreDetails)}
              activeOpacity={0.8}
            >
              <Text style={styles.addDetailBtnText}>
                {showMoreDetails ? "Thu gọn chi tiết" : "Thêm chi tiết"}
              </Text>
            </TouchableOpacity>

            {/* Expanded Extra Details Card */}
            {showMoreDetails && (
              <View style={[styles.mainCard, { marginTop: 12 }]}>
                {/* Payee */}
                <View style={styles.formRow}>
                  <View style={styles.rowLeftIcon}>
                    <Ionicons name="person-outline" size={20} color="#64748b" />
                  </View>
                  <View style={styles.rowCenter}>
                    <TextInput
                      style={styles.noteInput}
                      placeholder="Người nhận / Chi cho ai..."
                      placeholderTextColor="#94a3b8"
                      value={payee}
                      onChangeText={setPayee}
                    />
                  </View>
                </View>

                <View style={styles.rowDivider} />

                {/* Trip / Event */}
                <View style={styles.formRow}>
                  <View style={styles.rowLeftIcon}>
                    <Ionicons name="airplane-outline" size={20} color="#64748b" />
                  </View>
                  <View style={styles.rowCenter}>
                    <TextInput
                      style={styles.noteInput}
                      placeholder="Chuyến đi / Sự kiện..."
                      placeholderTextColor="#94a3b8"
                      value={trip}
                      onChangeText={setTrip}
                    />
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Bottom Bar: Action Button [Lưu] & Image Camera Icon */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[
                styles.saveBtn,
                isAmountValid ? styles.saveBtnActive : styles.saveBtnDisabled,
                submitting && { opacity: 0.7 },
              ]}
              onPress={handleSubmit}
              disabled={submitting || !isAmountValid}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.saveBtnText}>Lưu</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cameraBtn}
              onPress={() => {
                Alert.alert("Gợi ý", "Tính năng quét hóa đơn / ảnh biên lai đang được chuẩn bị.");
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="images" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Account Picker Modal */}
      <Modal visible={showAccountPicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setShowAccountPicker(false)}
        >
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerTitle}>Chọn tài khoản thanh toán</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {activeAccounts.map((acc) => (
                <TouchableOpacity
                  key={acc.id}
                  style={[
                    styles.pickerItem,
                    selectedAccountId === acc.id && styles.pickerItemActive,
                  ]}
                  onPress={() => {
                    setSelectedAccountId(acc.id);
                    setShowAccountPicker(false);
                  }}
                >
                  <AccountLogo name={acc.name} accountType={acc.account_type} size={32} />
                  <Text style={styles.pickerItemText}>{acc.name}</Text>
                  {selectedAccountId === acc.id && (
                    <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Target Account Picker Modal */}
      <Modal visible={showTargetAccountPicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setShowTargetAccountPicker(false)}
        >
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerTitle}>Chọn tài khoản đích</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {activeAccounts
                .filter((a) => a.id !== selectedAccountId)
                .map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.pickerItem,
                      targetAccountId === acc.id && styles.pickerItemActive,
                    ]}
                    onPress={() => {
                      setTargetAccountId(acc.id);
                      setShowTargetAccountPicker(false);
                    }}
                  >
                    <AccountLogo name={acc.name} accountType={acc.account_type} size={32} />
                    <Text style={styles.pickerItemText}>{acc.name}</Text>
                    {targetAccountId === acc.id && (
                      <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                    )}
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Category Picker Modal */}
      <CategoryPickerModal
        visible={showCategoryPicker}
        eventType={eventType}
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        onSelect={(catId) => setSelectedCategoryId(catId)}
        onClose={() => setShowCategoryPicker(false)}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#f4f5f7",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: "92%",
    flexDirection: "column",
    paddingTop: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  cancelBtn: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
  },
  scroll: {
    flex: 1,
  },
  mainCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    marginHorizontal: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  segmentedContainer: {
    flexDirection: "row",
    backgroundColor: "#f1f3f5",
    borderRadius: 20,
    padding: 4,
    marginBottom: 16,
  },
  segmentTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 16,
  },
  segmentTabActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },
  segmentTextActive: {
    color: "#0f172a",
    fontWeight: "700",
  },
  formRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  rowDivider: {
    height: 1,
    backgroundColor: "#f1f5f9",
  },
  rowLeftIcon: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowCenter: {
    flex: 1,
  },
  rowValueText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
  },
  vndBadge: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 12,
  },
  vndText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
  },
  amountCenter: {
    flex: 1,
  },
  amountLabel: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "500",
    marginBottom: 2,
  },
  amountInput: {
    fontSize: 34,
    fontWeight: "800",
    color: "#0f172a",
    padding: 0,
  },
  categoryIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  accountIconPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  noteInput: {
    fontSize: 16,
    fontWeight: "500",
    color: "#0f172a",
    padding: 0,
  },
  dateSelectorRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0fdf4",
    alignItems: "center",
    justifyContent: "center",
  },
  datePill: {
    flex: 1,
    backgroundColor: "#e8f5e9",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  datePillText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#16a34a",
  },
  addDetailBtn: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  addDetailBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#16a34a",
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 12,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: {
    backgroundColor: "#cbd5e1",
  },
  saveBtnActive: {
    backgroundColor: "#16a34a",
    shadowColor: "#16a34a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  cameraBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#16a34a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  pickerContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 16,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 12,
  },
  pickerItemActive: {
    backgroundColor: "#f0fdf4",
  },
  pickerItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#0f172a",
  },
});
