import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Account } from "../types";
import { colors } from "../theme/colors";
import { formatVND } from "../utils/formatters";
import { AccountLogo } from "./AccountLogo";

interface AccountCardProps {
  account: Account;
  balance?: string;
  onPress?: () => void;
}

export const AccountCard: React.FC<AccountCardProps> = ({
  account,
  balance,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={[styles.container, !account.is_active && styles.inactiveContainer]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
    >
      <View style={styles.logoWrapper}>
        <AccountLogo name={account.name} accountType={account.account_type} size={42} />
      </View>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, !account.is_active && styles.inactiveText]} numberOfLines={1}>
            {account.name}
          </Text>
          {!account.is_active && (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveBadgeText}>Đã ẩn</Text>
            </View>
          )}
        </View>
        <Text style={styles.type}>
          {account.account_type === "BANK"
            ? "Ngân hàng"
            : account.account_type === "CREDIT_CARD"
            ? `Thẻ tín dụng${account.credit_limit ? ` (HM: ${formatVND(account.credit_limit)})` : ""}`
            : account.account_type === "EWALLET"
            ? "Ví điện tử"
            : "Tiền mặt"}
        </Text>
      </View>
      <View style={styles.balanceContainer}>
        <Text style={styles.balance}>{formatVND(balance ?? "0")}</Text>
        {onPress && (
          <View style={styles.editRow}>
            <Ionicons name="create-outline" size={13} color={colors.textMuted} />
            <Text style={styles.editText}>Sửa</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  inactiveContainer: {
    opacity: 0.6,
    borderStyle: "dashed",
  },
  logoWrapper: {
    marginRight: 12,
  },
  info: {
    flex: 1,
    marginRight: 10,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  inactiveText: {
    color: colors.textMuted,
  },
  inactiveBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  inactiveBadgeText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  type: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  balanceContainer: {
    alignItems: "flex-end",
  },
  balance: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
  },
  editText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500",
  },
});
