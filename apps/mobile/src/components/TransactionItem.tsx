import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FinancialEvent, Category, Account } from "../types";
import { colors } from "../theme/colors";
import { formatVND, formatDate } from "../utils/formatters";

interface TransactionItemProps {
  event: FinancialEvent;
  categories?: Category[];
  accounts?: Account[];
  onPress?: () => void;
}

export const TransactionItem: React.FC<TransactionItemProps> = ({
  event,
  categories = [],
  accounts = [],
  onPress,
}) => {
  const category = categories.find((c) => c.id === event.category_id);
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

  // Calculate amount based on event type
  let amount = 0;
  let isNegative = false;
  let typeLabel = "Chi tiêu";
  let iconName: keyof typeof Ionicons.glyphMap = "arrow-up-circle-outline";
  let iconColor = colors.expense;
  let bgColor = colors.expenseBg;

  if (event.event_type === "INCOME") {
    typeLabel = "Thu nhập";
    iconName = "arrow-down-circle-outline";
    iconColor = colors.income;
    bgColor = colors.incomeBg;
    const positiveEntry = event.entries.find((e) => parseFloat(e.amount) > 0);
    amount = positiveEntry ? Math.abs(parseFloat(positiveEntry.amount)) : 0;
  } else if (event.event_type === "EXPENSE") {
    typeLabel = "Chi tiêu";
    iconName = "arrow-up-circle-outline";
    iconColor = colors.expense;
    bgColor = colors.expenseBg;
    isNegative = true;
    const negativeEntry = event.entries.find((e) => parseFloat(e.amount) < 0);
    amount = negativeEntry ? Math.abs(parseFloat(negativeEntry.amount)) : 0;
  } else if (event.event_type === "TRANSFER") {
    typeLabel = "Chuyển khoản";
    iconName = "swap-horizontal-outline";
    iconColor = colors.transfer;
    bgColor = colors.transferBg;
    const transferEntry = event.entries.find((e) => parseFloat(e.amount) < 0);
    amount = transferEntry ? Math.abs(parseFloat(transferEntry.amount)) : 0;
  } else if (event.event_type === "CREDIT_CARD_PAYMENT") {
    typeLabel = "Trả nợ thẻ";
    iconName = "card-outline";
    iconColor = "#8b5cf6";
    bgColor = "rgba(139, 92, 246, 0.12)";
    const transferEntry = event.entries.find((e) => parseFloat(e.amount) < 0);
    amount = transferEntry ? Math.abs(parseFloat(transferEntry.amount)) : 0;
  } else if (event.event_type === "INTEREST") {
    typeLabel = "Lãi tiết kiệm";
    iconName = "cash-outline";
    iconColor = colors.savings;
    bgColor = colors.savingsBg;
    amount = event.entries[0] ? Math.abs(parseFloat(event.entries[0].amount)) : 0;
  } else if (event.event_type === "SAVINGS_DEPOSIT") {
    typeLabel = "Gửi tiết kiệm";
    iconName = "shield-checkmark-outline";
    iconColor = colors.savings;
    bgColor = colors.savingsBg;
    isNegative = true;
    amount = event.entries[0] ? Math.abs(parseFloat(event.entries[0].amount)) : 0;
  } else if (event.event_type === "SAVINGS_WITHDRAWAL") {
    typeLabel = "Rút tiết kiệm";
    iconName = "wallet-outline";
    iconColor = colors.savings;
    bgColor = colors.savingsBg;
    amount = event.entries[0] ? Math.abs(parseFloat(event.entries[0].amount)) : 0;
  } else if (event.event_type === "ADJUSTMENT") {
    typeLabel = "Điều chỉnh số dư";
    iconName = "options-outline";
    iconColor = colors.textSecondary;
    bgColor = colors.surfaceElevated;
    const activeEntry = event.entries[0];
    const amtNum = activeEntry ? parseFloat(activeEntry.amount) : 0;
    isNegative = amtNum < 0;
    amount = Math.abs(amtNum);
  } else {
    typeLabel = event.event_type;
    iconName = "receipt-outline";
    iconColor = colors.textSecondary;
    bgColor = colors.surfaceElevated;
    amount = event.entries[0] ? Math.abs(parseFloat(event.entries[0].amount)) : 0;
  }

  // Account description
  let accountDesc = "";
  if (event.event_type === "TRANSFER" || event.event_type === "CREDIT_CARD_PAYMENT") {
    const fromEntry = event.entries.find((e) => parseFloat(e.amount) < 0);
    const toEntry = event.entries.find((e) => parseFloat(e.amount) > 0);
    const fromName = fromEntry ? accountMap.get(fromEntry.account_id) ?? "Tài khoản" : "Tài khoản";
    const toName = toEntry ? accountMap.get(toEntry.account_id) ?? "Tài khoản" : "Tài khoản";
    accountDesc = `${fromName} ➔ ${toName}`;
  } else {
    const activeEntry = event.entries[0];
    accountDesc = activeEntry ? accountMap.get(activeEntry.account_id) ?? "" : "";
  }

  const title = event.payee_text || category?.name || event.note || typeLabel;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconWrapper, { backgroundColor: bgColor }]}>
        <Ionicons name={iconName} size={22} color={iconColor} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{formatDate(event.transaction_date)}</Text>
          {accountDesc ? <Text style={styles.dot}>•</Text> : null}
          {accountDesc ? (
            <Text style={styles.metaText} numberOfLines={1}>
              {accountDesc}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.amountWrapper}>
        <Text
          style={[
            styles.amount,
            { color: event.event_type === "INCOME" || event.event_type === "INTEREST" ? colors.income : colors.text },
          ]}
        >
          {isNegative ? "-" : (event.event_type === "INCOME" || event.event_type === "INTEREST") ? "+" : ""}
          {formatVND(amount)}
        </Text>
        {event.note && (
          <Text style={styles.note} numberOfLines={1}>
            {event.note}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  metaText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  dot: {
    color: colors.textMuted,
    marginHorizontal: 4,
    fontSize: 12,
  },
  amountWrapper: {
    alignItems: "flex-end",
  },
  amount: {
    fontSize: 15,
    fontWeight: "700",
  },
  note: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    maxWidth: 100,
  },
});
