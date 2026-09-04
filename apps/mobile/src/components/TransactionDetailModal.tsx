import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { formatVND, formatDate } from "../utils/formatters";
import { Account, Category, FinancialEvent } from "../types";
import { api } from "../api/client";
import { AccountLogo } from "./AccountLogo";

interface TransactionDetailModalProps {
  visible: boolean;
  event: FinancialEvent | null;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
  onEdit: (event: FinancialEvent) => void;
  onDeleted: () => void;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  visible,
  event,
  accounts,
  categories,
  onClose,
  onEdit,
  onDeleted,
}) => {
  const insets = useSafeAreaInsets();
  const [isDeleting, setIsDeleting] = useState(false);

  if (!event) return null;

  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  // Build category breadcrumb path
  const getCategoryPath = (catId: number | null): string => {
    if (!catId) return "Chưa phân loại";
    const path: string[] = [];
    let current = categoryMap.get(catId);
    let count = 0;
    while (current && count < 4) {
      path.unshift(current.name);
      if (current.parent_id) {
        current = categoryMap.get(current.parent_id);
      } else {
        break;
      }
      count++;
    }
    return path.join(" › ");
  };

  const isEditable = [
    "EXPENSE",
    "INCOME",
    "TRANSFER",
    "CREDIT_CARD_PAYMENT",
  ].includes(event.event_type);

  const getEventMeta = () => {
    switch (event.event_type) {
      case "EXPENSE":
        return {
          title: "Khoản chi tiêu",
          color: colors.expense,
          bgColor: colors.expenseBg,
          icon: "arrow-up-circle",
          sign: "-",
        };
      case "INCOME":
        return {
          title: "Khoản thu nhập",
          color: colors.income,
          bgColor: colors.incomeBg,
          icon: "arrow-down-circle",
          sign: "+",
        };
      case "TRANSFER":
        return {
          title: "Chuyển tiền nội bộ",
          color: colors.transfer,
          bgColor: colors.transferBg,
          icon: "swap-horizontal",
          sign: "",
        };
      case "CREDIT_CARD_PAYMENT":
        return {
          title: "Thanh toán thẻ tín dụng",
          color: "#8b5cf6",
          bgColor: "rgba(139, 92, 246, 0.12)",
          icon: "card",
          sign: "",
        };
      case "INTEREST":
        return {
          title: "Tiền lãi tiết kiệm",
          color: colors.savings,
          bgColor: colors.savingsBg,
          icon: "cash",
          sign: "+",
        };
      case "SAVINGS_DEPOSIT":
        return {
          title: "Gửi tiền tiết kiệm",
          color: colors.savings,
          bgColor: colors.savingsBg,
          icon: "shield-checkmark",
          sign: "-",
        };
      case "SAVINGS_WITHDRAWAL":
        return {
          title: "Rút tiền tiết kiệm",
          color: colors.savings,
          bgColor: colors.savingsBg,
          icon: "wallet",
          sign: "+",
        };
      case "ADJUSTMENT":
        return {
          title: "Điều chỉnh số dư",
          color: colors.textSecondary,
          bgColor: colors.surfaceElevated,
          icon: "options",
          sign: "",
        };
      default:
        return {
          title: "Giao dịch",
          color: colors.text,
          bgColor: colors.surfaceElevated,
          icon: "receipt",
          sign: "",
        };
    }
  };

  const meta = getEventMeta();

  // Compute total display amount
  const primaryAmount = event.entries.length > 0
    ? Math.abs(parseFloat(event.entries[0].amount) || 0)
    : 0;

  const handleDelete = () => {
    Alert.alert(
      "Xác nhận xoá",
      "Bạn có chắc chắn muốn xoá vĩnh viễn giao dịch này khỏi sổ cái?",
      [
        { text: "Huỷ", style: "cancel" },
        {
          text: "Xoá giao dịch",
          style: "destructive",
          onPress: async () => {
            try {
              setIsDeleting(true);
              await api.deleteEvent(event.id);
              onClose();
              onDeleted();
            } catch (err: any) {
              Alert.alert("Lỗi khi xoá", err?.message || "Không thể xoá giao dịch.");
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Chi tiết giao dịch</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Main Hero Banner */}
            <View style={[styles.heroCard, { backgroundColor: meta.bgColor }]}>
              <View style={styles.heroBadge}>
                <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                <Text style={[styles.heroType, { color: meta.color }]}>{meta.title}</Text>
              </View>

              <Text style={[styles.heroAmount, { color: meta.color }]}>
                {meta.sign}{formatVND(primaryAmount)}
              </Text>

              <Text style={styles.heroDate}>
                {formatDate(event.transaction_date)}
                {event.occurred_at ? ` · ${new Date(event.occurred_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : ""}
              </Text>
            </View>

            {/* Details Grid */}
            <View style={styles.detailsGroup}>
              {/* Category */}
              {event.event_type !== "TRANSFER" && event.event_type !== "CREDIT_CARD_PAYMENT" && (
                <View style={styles.detailRow}>
                  <View style={styles.detailIconWrapper}>
                    <Ionicons name="folder-outline" size={18} color={colors.textSecondary} />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Danh mục</Text>
                    <Text style={styles.detailValue}>{getCategoryPath(event.category_id)}</Text>
                  </View>
                </View>
              )}

              {/* Payee */}
              {event.payee_text ? (
                <View style={styles.detailRow}>
                  <View style={styles.detailIconWrapper}>
                    <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Người nhận / Đơn vị</Text>
                    <Text style={styles.detailValue}>{event.payee_text}</Text>
                  </View>
                </View>
              ) : null}

              {/* Trip / Event */}
              {event.trip_event_text ? (
                <View style={styles.detailRow}>
                  <View style={styles.detailIconWrapper}>
                    <Ionicons name="airplane-outline" size={18} color={colors.textSecondary} />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Chuyến đi / Sự kiện</Text>
                    <Text style={styles.detailValue}>{event.trip_event_text}</Text>
                  </View>
                </View>
              ) : null}

              {/* Note */}
              {event.note ? (
                <View style={styles.detailRow}>
                  <View style={styles.detailIconWrapper}>
                    <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Ghi chú</Text>
                    <Text style={styles.detailValue}>{event.note}</Text>
                  </View>
                </View>
              ) : null}
            </View>

            {/* Account Entries Breakdown */}
            <View style={styles.entriesSection}>
              <Text style={styles.sectionTitle}>Tài khoản hạch toán ({event.entries.length})</Text>
              <View style={styles.entriesCard}>
                {event.entries.map((entry, idx) => {
                  const acc = accountMap.get(entry.account_id);
                  const amtNum = parseFloat(entry.amount) || 0;
                  const isNegative = amtNum < 0;

                  return (
                    <View
                      key={entry.id || idx}
                      style={[
                        styles.entryRow,
                        idx > 0 && styles.entryBorderTop,
                      ]}
                    >
                      <AccountLogo
                        name={acc?.name || "Tài khoản"}
                        accountType={acc?.account_type || "BANK"}
                        size={36}
                      />
                      <View style={styles.entryInfo}>
                        <Text style={styles.entryAccName}>{acc?.name || `Tài khoản #${entry.account_id}`}</Text>
                        <Text style={styles.entryAccType}>
                          {acc?.account_type === "CASH" ? "Tiền mặt" : acc?.account_type === "BANK" ? "Ngân hàng" : acc?.account_type === "EWALLET" ? "Ví điện tử" : "Thẻ tín dụng"}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.entryAmount,
                          { color: isNegative ? colors.expense : colors.income },
                        ]}
                      >
                        {isNegative ? "" : "+"}{formatVND(amtNum)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Actions */}
            {isEditable && (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.editBtn]}
                  onPress={() => {
                    onClose();
                    onEdit(event);
                  }}
                >
                  <Ionicons name="create-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.editBtnText}>Chỉnh sửa</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.deleteBtn]}
                  onPress={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color="#ef4444" />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={18} color="#ef4444" style={{ marginRight: 6 }} />
                      <Text style={styles.deleteBtnText}>Xoá</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
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
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  heroType: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heroAmount: {
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 6,
  },
  heroDate: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  detailsGroup: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    paddingVertical: 6,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  detailIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  entriesSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textSecondary,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  entriesCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  entryBorderTop: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  entryInfo: {
    flex: 1,
    marginLeft: 12,
  },
  entryAccName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  entryAccType: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  entryAmount: {
    fontSize: 14,
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  editBtn: {
    backgroundColor: colors.primary,
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
  deleteBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.25)",
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ef4444",
  },
});
