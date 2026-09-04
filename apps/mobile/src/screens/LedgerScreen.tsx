import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { FinancialEvent } from "../types";
import { Header } from "../components/Header";
import { Card } from "../components/Card";
import { TransactionItem } from "../components/TransactionItem";
import { TransactionDetailModal } from "../components/TransactionDetailModal";
import { EditTransactionModal } from "../components/EditTransactionModal";

export const LedgerScreen = () => {
  const [filterType, setFilterType] = useState<string>("ALL");
  const [filterAccountId, setFilterAccountId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedEvent, setSelectedEvent] = useState<FinancialEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<FinancialEvent | null>(null);

  const {
    data: events = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["ledgerEvents"],
    queryFn: () => api.getEvents(100, 0),
  });

  const { data: categories = [], refetch: refetchCategories } = useQuery({
    queryKey: ["categories"],
    queryFn: api.getCategories,
  });

  const { data: accounts = [], refetch: refetchAccounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: api.getAccounts,
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchCategories(), refetchAccounts()]);
    setRefreshing(false);
  };

  const filteredEvents = events.filter((ev) => {
    // Type filter
    if (filterType !== "ALL" && ev.event_type !== filterType) return false;

    // Account filter
    if (filterAccountId !== null) {
      const hasAccount = ev.entries.some((e) => e.account_id === filterAccountId);
      if (!hasAccount) return false;
    }

    // Search query
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchPayee = ev.payee_text?.toLowerCase().includes(q);
      const matchNote = ev.note?.toLowerCase().includes(q);
      const matchTrip = ev.trip_event_text?.toLowerCase().includes(q);
      const cat = categories.find((c) => c.id === ev.category_id);
      const matchCat = cat?.name.toLowerCase().includes(q);
      return matchPayee || matchNote || matchTrip || matchCat;
    }

    return true;
  });

  // Sort events by newest transaction_date and occurred_at first
  const sortedEvents = [...filteredEvents].sort((a, b) => {
    if (b.transaction_date !== a.transaction_date) {
      return b.transaction_date.localeCompare(a.transaction_date);
    }
    if (b.occurred_at && a.occurred_at) {
      return b.occurred_at.localeCompare(a.occurred_at);
    }
    return b.id - a.id;
  });

  return (
    <View style={styles.container}>
      <Header title="Sổ cái" subtitle="Lịch sử giao dịch & dòng tiền" />

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm theo người nhận, ghi chú, danh mục..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery !== "" && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs by Event Type */}
      <View style={styles.filterRowWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {[
            { key: "ALL", label: "Tất cả" },
            { key: "EXPENSE", label: "Chi tiêu" },
            { key: "INCOME", label: "Thu nhập" },
            { key: "TRANSFER", label: "Chuyển tiền" },
            { key: "CREDIT_CARD_PAYMENT", label: "Trả thẻ" },
            { key: "INTEREST", label: "Tiền lãi" },
            { key: "SAVINGS_DEPOSIT", label: "Gửi tiết kiệm" },
            { key: "SAVINGS_WITHDRAWAL", label: "Rút tiết kiệm" },
            { key: "ADJUSTMENT", label: "Điều chỉnh" },
          ].map((tab) => {
            const isSelected = filterType === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.filterTab, isSelected && styles.filterTabActive]}
                onPress={() => setFilterType(tab.key)}
              >
                <Text style={[styles.filterText, isSelected && styles.filterTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Filter by Account */}
      {accounts.length > 0 && (
        <View style={styles.accountFilterWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountFilterRow}>
            <TouchableOpacity
              style={[styles.accountPill, filterAccountId === null && styles.accountPillActive]}
              onPress={() => setFilterAccountId(null)}
            >
              <Text style={[styles.accountPillText, filterAccountId === null && styles.accountPillTextActive]}>
                Tất cả tài khoản
              </Text>
            </TouchableOpacity>
            {accounts.filter((a) => a.is_active).map((acc) => {
              const isSel = filterAccountId === acc.id;
              return (
                <TouchableOpacity
                  key={acc.id}
                  style={[styles.accountPill, isSel && styles.accountPillActive]}
                  onPress={() => setFilterAccountId(acc.id)}
                >
                  <Text style={[styles.accountPillText, isSel && styles.accountPillTextActive]}>
                    {acc.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Transactions List */}
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
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ margin: 30 }} />
          ) : sortedEvents.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="documents-outline" size={36} color={colors.textMuted} />
              <Text style={styles.emptyText}>Không tìm thấy giao dịch nào</Text>
            </View>
          ) : (
            sortedEvents.map((ev) => (
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
          refetch();
        }}
      />

      <EditTransactionModal
        visible={!!editingEvent}
        event={editingEvent}
        accounts={accounts}
        categories={categories}
        onClose={() => setEditingEvent(null)}
        onSaved={() => {
          refetch();
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
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    height: 42,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
  },
  filterRowWrapper: {
    marginBottom: 6,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  filterTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  accountFilterWrapper: {
    marginBottom: 10,
  },
  accountFilterRow: {
    paddingHorizontal: 16,
    gap: 6,
  },
  accountPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  accountPillActive: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  accountPillText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500",
  },
  accountPillTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  emptyBox: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: colors.textMuted,
    marginTop: 10,
    fontSize: 14,
  },
});
