import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { formatVND } from "../utils/formatters";
import { Header } from "../components/Header";
import { Card } from "../components/Card";
import { AccountCard } from "../components/AccountCard";
import { TransactionItem } from "../components/TransactionItem";
import { QuickAddModal } from "../components/QuickAddModal";
import { EditAccountModal } from "../components/EditAccountModal";
import { BalanceAdjustmentModal } from "../components/BalanceAdjustmentModal";
import { TransactionDetailModal } from "../components/TransactionDetailModal";
import { EditTransactionModal } from "../components/EditTransactionModal";
import { CategoriesModal } from "../components/CategoriesModal";
import { Account, FinancialEvent } from "../types";

export const DashboardScreen = () => {
  const queryClient = useQueryClient();
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [adjustModalVisible, setAdjustModalVisible] = useState(false);
  const [categoriesModalVisible, setCategoriesModalVisible] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<FinancialEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<FinancialEvent | null>(null);

  // Queries
  const {
    data: portfolio,
    isLoading: loadingPortfolio,
    refetch: refetchPortfolio,
  } = useQuery({
    queryKey: ["portfolio"],
    queryFn: api.getPortfolioOverview,
  });

  const {
    data: accounts = [],
    isLoading: loadingAccounts,
    refetch: refetchAccounts,
  } = useQuery({
    queryKey: ["accounts"],
    queryFn: api.getAccounts,
  });

  const {
    data: categories = [],
    refetch: refetchCategories,
  } = useQuery({
    queryKey: ["categories"],
    queryFn: api.getCategories,
  });

  const {
    data: events = [],
    isLoading: loadingEvents,
    refetch: refetchEvents,
  } = useQuery({
    queryKey: ["recentEvents"],
    queryFn: () => api.getEvents(50, 0),
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchPortfolio(),
      refetchAccounts(),
      refetchCategories(),
      refetchEvents(),
    ]);
    setRefreshing(false);
  };

  const balanceMap = new Map<number, string>();
  let cashTotal = 0;
  let bankTotal = 0;
  let ewalletTotal = 0;
  let creditCardDebt = 0;

  for (const acc of accounts) {
    const pRow = portfolio?.accounts?.find((a) => a.id === acc.id);
    const balStr = pRow?.value ?? "0";
    balanceMap.set(acc.id, balStr);
    const balNum = parseFloat(balStr) || 0;

    if (acc.is_active) {
      if (acc.account_type === "CREDIT_CARD") {
        if (balNum < 0) {
          creditCardDebt += Math.abs(balNum);
        }
      } else if (acc.account_type === "CASH") {
        cashTotal += balNum;
      } else if (acc.account_type === "BANK") {
        bankTotal += balNum;
      } else if (acc.account_type === "EWALLET") {
        ewalletTotal += balNum;
      }
    }
  }

  const liquidTotal = cashTotal + bankTotal + ewalletTotal;
  const currentFinance = liquidTotal - creditCardDebt;

  let savingsTotal = 0;
  if (portfolio?.savings) {
    for (const s of portfolio.savings) {
      if (!s.excluded_from_reports) {
        savingsTotal += parseFloat(s.value ?? "0") || 0;
      }
    }
  }

  let metalsTotal = 0;
  if (portfolio?.precious_metals) {
    for (const m of portfolio.precious_metals) {
      if (!m.excluded_from_reports) {
        const unitPrice = m.quote?.valuation_price ? parseFloat(m.quote.valuation_price) : null;
        const grams = m.quantity ? parseFloat(m.quantity) : 0;
        const liveVal = unitPrice && grams > 0 ? unitPrice * (grams / 3.75) : null;
        metalsTotal += liveVal ?? (parseFloat(m.value ?? "0") || 0);
      }
    }
  }

  let cryptoTotal = 0;
  if (portfolio?.crypto) {
    for (const cr of portfolio.crypto) {
      if (!cr.excluded_from_reports) {
        const unitPrice = cr.quote?.valuation_price ? parseFloat(cr.quote.valuation_price) : null;
        const qty = cr.quantity ? parseFloat(cr.quantity) : 0;
        const liveVal = unitPrice && qty > 0 ? unitPrice * qty : null;
        cryptoTotal += liveVal ?? (parseFloat(cr.value ?? "0") || 0);
      }
    }
  }

  const investedValue = savingsTotal + metalsTotal + cryptoTotal;

  // 3-way liquid asset allocation percentages (Tiền mặt, Ngân hàng, Ví điện tử)
  const totalPositiveLiquid = Math.max(0, cashTotal) + Math.max(0, bankTotal) + Math.max(0, ewalletTotal);
  const pctCash = totalPositiveLiquid > 0 ? (Math.max(0, cashTotal) / totalPositiveLiquid) * 100 : 0;
  const pctBank = totalPositiveLiquid > 0 ? (Math.max(0, bankTotal) / totalPositiveLiquid) * 100 : 0;
  const pctEwallet = totalPositiveLiquid > 0 ? (Math.max(0, ewalletTotal) / totalPositiveLiquid) * 100 : 0;

  // Sort events by date descending
  const sortedRecentEvents = [...events].sort((a, b) => {
    if (b.transaction_date !== a.transaction_date) {
      return b.transaction_date.localeCompare(a.transaction_date);
    }
    if (b.occurred_at && a.occurred_at) {
      return b.occurred_at.localeCompare(a.occurred_at);
    }
    return b.id - a.id;
  });

  const handleAccountPress = (acc: Account) => {
    setSelectedAccount(acc);
    Alert.alert(
      acc.name,
      `Số dư hiện tại: ${formatVND(parseFloat(balanceMap.get(acc.id) || "0"))}`,
      [
        {
          text: "Chỉnh sửa thông tin ví",
          onPress: () => setAccountModalVisible(true),
        },
        {
          text: "Điều chỉnh số dư thực tế",
          onPress: () => setAdjustModalVisible(true),
        },
        { text: "Đóng", style: "cancel" },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Header
        title="Tổng quan"
        subtitle="Quản lý tài chính gia đình"
        rightElement={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => setCategoriesModalVisible(true)}
            >
              <Ionicons name="folder-open-outline" size={20} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setQuickAddVisible(true)}
            >
              <Ionicons name="add" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* Current Finance Banner */}
        <Card elevated style={styles.netWorthCard}>
          <View style={styles.netWorthHeader}>
            <Text style={styles.netWorthLabel}>Tài chính hiện tại (Số dư ví - Dư nợ)</Text>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>
                {portfolio?.valuation_complete ? "Trực tuyến" : "Đang cập nhật"}
              </Text>
            </View>
          </View>

          {loadingPortfolio ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
          ) : (
            <Text style={[styles.netWorthValue, { color: currentFinance < 0 ? colors.expense : colors.text }]}>
              {formatVND(currentFinance)}
            </Text>
          )}

          {/* 3-Part Financial Balance Cards */}
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Tài sản các ví/TK</Text>
              <Text style={[styles.statValue, { color: colors.primary }]}>{formatVND(liquidTotal)}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Dư nợ thẻ & nợ khác</Text>
              <Text style={[styles.statValue, { color: creditCardDebt > 0 ? colors.expense : colors.textMuted }]}>
                {creditCardDebt > 0 ? `-${formatVND(creditCardDebt)}` : "0 ₫"}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Tài sản đầu tư</Text>
              <Text style={styles.statValue}>
                {formatVND(investedValue)}
              </Text>
            </View>
          </View>

          {/* 3-Way Liquid Asset Allocation Bar (Tiền mặt, Ngân hàng, Ví điện tử) */}
          {totalPositiveLiquid > 0 && (
            <View style={styles.allocationWrapper}>
              <View style={styles.allocationBar}>
                {pctCash > 0 && <View style={[styles.barSegment, { width: `${pctCash}%`, backgroundColor: "#10b981" }]} />}
                {pctBank > 0 && <View style={[styles.barSegment, { width: `${pctBank}%`, backgroundColor: "#3b82f6" }]} />}
                {pctEwallet > 0 && <View style={[styles.barSegment, { width: `${pctEwallet}%`, backgroundColor: "#ec4899" }]} />}
              </View>

              <View style={styles.legendRow}>
                {pctCash > 0 && (
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#10b981" }]} />
                    <Text style={styles.legendText}>Tiền mặt: {formatVND(cashTotal)} ({pctCash.toFixed(0)}%)</Text>
                  </View>
                )}
                {pctBank > 0 && (
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#3b82f6" }]} />
                    <Text style={styles.legendText}>Ngân hàng: {formatVND(bankTotal)} ({pctBank.toFixed(0)}%)</Text>
                  </View>
                )}
                {pctEwallet > 0 && (
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#ec4899" }]} />
                    <Text style={styles.legendText}>Ví điện tử: {formatVND(ewalletTotal)} ({pctEwallet.toFixed(0)}%)</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </Card>

        {/* Quick Action Bar */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.expenseBg }]}
            onPress={() => setQuickAddVisible(true)}
          >
            <Ionicons name="arrow-up-circle" size={20} color={colors.expense} />
            <Text style={[styles.actionText, { color: colors.expense }]}>Chi tiêu</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.incomeBg }]}
            onPress={() => setQuickAddVisible(true)}
          >
            <Ionicons name="arrow-down-circle" size={20} color={colors.income} />
            <Text style={[styles.actionText, { color: colors.income }]}>Thu nhập</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.transferBg }]}
            onPress={() => setQuickAddVisible(true)}
          >
            <Ionicons name="swap-horizontal" size={20} color={colors.transfer} />
            <Text style={[styles.actionText, { color: colors.transfer }]}>Chuyển tiền</Text>
          </TouchableOpacity>
        </View>

        {/* 10 Recent Transactions Section of All Accounts */}
        <View style={[styles.sectionHeader, { marginTop: 8 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="time-outline" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>10 giao dịch gần nhất</Text>
          </View>
        </View>

        <Card style={{ padding: 0, overflow: "hidden" }}>
          {loadingEvents ? (
            <ActivityIndicator color={colors.primary} style={{ margin: 20 }} />
          ) : sortedRecentEvents.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="receipt-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>Chưa có giao dịch nào</Text>
            </View>
          ) : (
            sortedRecentEvents.slice(0, 10).map((ev) => (
              <TransactionItem
                key={ev.id}
                event={ev}
                categories={categories}
                accounts={accounts}
                onPress={() => setSelectedEvent(ev)}
              />
            ))
          )}
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modals */}
      <QuickAddModal
        visible={quickAddVisible}
        onClose={() => setQuickAddVisible(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["portfolio"] });
          queryClient.invalidateQueries({ queryKey: ["accounts"] });
          queryClient.invalidateQueries({ queryKey: ["recentEvents"] });
        }}
        accounts={accounts}
        categories={categories}
      />

      <EditAccountModal
        visible={accountModalVisible}
        account={selectedAccount}
        onClose={() => {
          setAccountModalVisible(false);
          setSelectedAccount(null);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["accounts"] });
          queryClient.invalidateQueries({ queryKey: ["portfolio"] });
        }}
      />

      <BalanceAdjustmentModal
        visible={adjustModalVisible}
        account={selectedAccount}
        currentBalance={selectedAccount ? balanceMap.get(selectedAccount.id) || "0" : "0"}
        onClose={() => {
          setAdjustModalVisible(false);
          setSelectedAccount(null);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["accounts"] });
          queryClient.invalidateQueries({ queryKey: ["portfolio"] });
          queryClient.invalidateQueries({ queryKey: ["recentEvents"] });
        }}
      />

      <CategoriesModal
        visible={categoriesModalVisible}
        categories={categories}
        onClose={() => setCategoriesModalVisible(false)}
        onRefresh={() => {
          queryClient.invalidateQueries({ queryKey: ["categories"] });
        }}
      />

      <TransactionDetailModal
        visible={!!selectedEvent}
        event={selectedEvent}
        accounts={accounts}
        categories={categories}
        onClose={() => setSelectedEvent(null)}
        onEdit={(ev) => {
          setSelectedEvent(null);
          setEditingEvent(ev);
        }}
        onDeleted={() => {
          refetchEvents();
          refetchPortfolio();
        }}
      />

      <EditTransactionModal
        visible={!!editingEvent}
        event={editingEvent}
        accounts={accounts}
        categories={categories}
        onClose={() => setEditingEvent(null)}
        onSaved={() => {
          refetchEvents();
          refetchPortfolio();
        }}
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
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerButton: {
    backgroundColor: colors.primary,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  netWorthCard: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  netWorthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  netWorthLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginRight: 5,
  },
  liveText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: "700",
  },
  netWorthValue: {
    fontSize: 30,
    fontWeight: "800",
    color: colors.text,
    marginVertical: 8,
  },
  statsGrid: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statItem: {
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
    marginHorizontal: 6,
  },
  statLabel: {
    fontSize: 10,
    color: colors.textMuted,
    marginBottom: 3,
  },
  statValue: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  allocationWrapper: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  allocationBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  barSegment: {
    height: "100%",
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  legendText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  quickActions: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "700",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  addAccountButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addAccountText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: "600",
  },
  emptyBox: {
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: colors.textMuted,
    marginTop: 8,
    fontSize: 13,
  },
});
