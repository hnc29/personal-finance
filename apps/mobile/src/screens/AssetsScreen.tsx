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
import { Account, MetalHolding, PortfolioRow, SavingsHolding, CryptoHolding } from "../types";
import { AddMetalModal } from "../components/AddMetalModal";
import { EditMetalModal } from "../components/EditMetalModal";
import { AddCryptoModal } from "../components/AddCryptoModal";
import { EditCryptoModal } from "../components/EditCryptoModal";
import { AddSavingsModal } from "../components/AddSavingsModal";
import { SavingsDetailModal } from "../components/SavingsDetailModal";
import { EditAccountModal } from "../components/EditAccountModal";
import { BalanceAdjustmentModal } from "../components/BalanceAdjustmentModal";

export const AssetsScreen = () => {
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState<"ALL" | "ACCOUNTS" | "GOLD" | "SAVINGS" | "CRYPTO">("ALL");

  // Modal states
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [showAdjustAccount, setShowAdjustAccount] = useState(false);

  const [showAddMetal, setShowAddMetal] = useState(false);
  const [editingMetal, setEditingMetal] = useState<MetalHolding | null>(null);

  const [showAddCrypto, setShowAddCrypto] = useState(false);
  const [editingCrypto, setEditingCrypto] = useState<CryptoHolding | null>(null);

  const [showAddSavings, setShowAddSavings] = useState(false);
  const [selectedSavings, setSelectedSavings] = useState<SavingsHolding | null>(null);

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
    data: metalsList = [],
    isLoading: loadingMetals,
    refetch: refetchMetals,
  } = useQuery({
    queryKey: ["metals"],
    queryFn: api.getMetals,
  });

  const {
    data: savingsList = [],
    isLoading: loadingSavings,
    refetch: refetchSavings,
  } = useQuery({
    queryKey: ["savings"],
    queryFn: api.getSavings,
  });

  const {
    data: cryptoList = [],
    isLoading: loadingCrypto,
    refetch: refetchCrypto,
  } = useQuery({
    queryKey: ["crypto"],
    queryFn: api.getCrypto,
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchPortfolio(),
      refetchAccounts(),
      refetchMetals(),
      refetchSavings(),
      refetchCrypto(),
    ]);
    setRefreshing(false);
  };

  const balanceMap = new Map<number, string>();
  let liquidTotal = 0;
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
      } else {
        liquidTotal += balNum;
      }
    }
  }

  const portfolioMetalsMap = new Map<number, PortfolioRow>(
    (portfolio?.precious_metals ?? []).map((m) => [m.id, m])
  );
  const portfolioSavingsMap = new Map<number, PortfolioRow>(
    (portfolio?.savings ?? []).map((s) => [s.id, s])
  );
  const portfolioCryptoMap = new Map<number, PortfolioRow>(
    (portfolio?.crypto ?? []).map((c) => [c.id, c])
  );

  // Combine metal holdings from API and Portfolio overview
  const displayedMetals = metalsList.length > 0
    ? metalsList
    : (portfolio?.precious_metals ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        product_type: m.name,
        brand: "Vàng",
        metal_type: "GOLD",
        purity: "99.99%",
        quantity_grams: m.quantity || "0",
        purchase_price: "0",
        total_cost: m.value || "0",
        purchase_date: null,
        excluded_from_reports: !!m.excluded_from_reports,
      } as MetalHolding));

  const displayedSavings = savingsList.length > 0
    ? savingsList
    : (portfolio?.savings ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        principal: s.value || "0",
        status: "ACTIVE",
        excluded_from_reports: !!s.excluded_from_reports,
      } as SavingsHolding));

  const displayedCrypto = cryptoList.length > 0
    ? cryptoList
    : (portfolio?.crypto ?? []).map((c) => ({
        id: c.id,
        coingecko_id: "",
        symbol: c.name,
        display_name: c.name,
        quantity: c.quantity || "0",
        purchase_price: "0",
        total_cost: c.value || "0",
        purchase_date: null,
        excluded_from_reports: !!c.excluded_from_reports,
      } as CryptoHolding));

  // Compute category specific totals using CURRENT LIVE MARKET VALUE
  let metalsTotalValuation = 0;
  let metalsTotalCost = 0;
  let metalsTotalGrams = 0;
  for (const m of displayedMetals) {
    if (!m.excluded_from_reports) {
      const pRow = portfolioMetalsMap.get(m.id);
      const currentUnitPrice = pRow?.quote?.valuation_price ? parseFloat(pRow.quote.valuation_price) : null;
      const hasLiveQuote = pRow?.quote?.state !== "UNAVAILABLE" && currentUnitPrice !== null;
      const grams = parseFloat(m.quantity_grams) || 0;
      const totalCostNum = parseFloat(m.total_cost) || 0;

      const currentVal = hasLiveQuote && currentUnitPrice !== null
        ? currentUnitPrice * (grams / 3.75)
        : (pRow?.value ? parseFloat(pRow.value) : totalCostNum);

      metalsTotalValuation += currentVal;
      metalsTotalCost += totalCostNum;
      metalsTotalGrams += grams;
    }
  }
  const metalsTotalChi = (metalsTotalGrams / 3.75).toFixed(2);

  let savingsTotalValuation = 0;
  for (const s of displayedSavings) {
    if (!s.excluded_from_reports) {
      const pRow = portfolioSavingsMap.get(s.id);
      const val = pRow?.value ? parseFloat(pRow.value) : parseFloat(s.principal) || 0;
      savingsTotalValuation += val;
    }
  }

  let cryptoTotalValuation = 0;
  let cryptoTotalCost = 0;
  for (const cr of displayedCrypto) {
    if (!cr.excluded_from_reports) {
      const pRow = portfolioCryptoMap.get(cr.id);
      const currentUnitPrice = pRow?.quote?.valuation_price ? parseFloat(pRow.quote.valuation_price) : null;
      const hasLiveQuote = pRow?.quote?.state !== "UNAVAILABLE" && currentUnitPrice !== null;
      const qty = parseFloat(cr.quantity) || 0;
      const totalCostNum = parseFloat(cr.total_cost) || 0;

      const currentVal = hasLiveQuote && currentUnitPrice !== null
        ? currentUnitPrice * qty
        : (pRow?.value ? parseFloat(pRow.value) : totalCostNum);

      cryptoTotalValuation += currentVal;
      cryptoTotalCost += totalCostNum;
    }
  }

  const totalAllAssets = liquidTotal + metalsTotalValuation + savingsTotalValuation + cryptoTotalValuation;

  // Active banner data according to selected tab
  const getBannerData = () => {
    switch (selectedTab) {
      case "ACCOUNTS":
        return {
          title: "Tổng tiền mặt & Tài khoản ví",
          amount: liquidTotal,
          subText: `${accounts.filter((a) => a.is_active).length} tài khoản ví đang hoạt động`,
          count: `${accounts.filter((a) => a.is_active).length} tài khoản`,
          color: colors.primary,
        };
      case "GOLD":
        return {
          title: "Tổng giá trị Vàng & Kim loại quý",
          amount: metalsTotalValuation,
          subText: `${metalsTotalChi} chỉ (${metalsTotalGrams.toFixed(1)}g) · Vốn: ${formatVND(metalsTotalCost)}`,
          count: `${displayedMetals.length} danh mục`,
          color: colors.gold,
        };
      case "SAVINGS":
        return {
          title: "Tổng tiền gửi tiết kiệm",
          amount: savingsTotalValuation,
          subText: "Tiết kiệm có kỳ hạn tại ngân hàng",
          count: `${displayedSavings.length} sổ tiết kiệm`,
          color: colors.savings,
        };
      case "CRYPTO":
        return {
          title: "Tổng giá trị Tiền mã hoá (Crypto)",
          amount: cryptoTotalValuation,
          subText: `Giá vốn: ${formatVND(cryptoTotalCost)}`,
          count: `${displayedCrypto.length} loại coin`,
          color: colors.crypto,
        };
      case "ALL":
      default:
        return {
          title: "Tổng giá trị tài sản & tích luỹ",
          amount: totalAllAssets,
          subText: `Ví: ${formatVND(liquidTotal)} · Vàng: ${formatVND(metalsTotalValuation)} · Tiết kiệm: ${formatVND(savingsTotalValuation)} · Crypto: ${formatVND(cryptoTotalValuation)}`,
          count: `${accounts.length + displayedMetals.length + displayedSavings.length + displayedCrypto.length} tài sản`,
          color: colors.primary,
        };
    }
  };

  const [isSyncingMetals, setIsSyncingMetals] = useState(false);
  const [isSyncingCrypto, setIsSyncingCrypto] = useState(false);

  const handleSyncMetals = async () => {
    try {
      setIsSyncingMetals(true);
      await api.syncMetalPrices();
      await Promise.all([refetchPortfolio(), refetchMetals()]);
    } catch {
      // ignore
    } finally {
      setIsSyncingMetals(false);
    }
  };

  const handleSyncCrypto = async () => {
    try {
      setIsSyncingCrypto(true);
      await api.syncCryptoPrices();
      await Promise.all([refetchPortfolio(), refetchCrypto()]);
    } catch {
      // ignore
    } finally {
      setIsSyncingCrypto(false);
    }
  };

  const handleAccountPress = (acc: Account) => {
    setSelectedAccount(acc);
    Alert.alert(
      acc.name,
      `Số dư hiện tại: ${formatVND(parseFloat(balanceMap.get(acc.id) || "0"))}`,
      [
        {
          text: "Chỉnh sửa thông tin ví",
          onPress: () => setShowAddAccount(true),
        },
        {
          text: "Điều chỉnh số dư thực tế",
          onPress: () => setShowAdjustAccount(true),
        },
        { text: "Đóng", style: "cancel" },
      ]
    );
  };

  const renderMetalRow = (item: MetalHolding) => {
    const pRow = portfolioMetalsMap.get(item.id);
    const currentUnitPrice = pRow?.quote?.valuation_price ? parseFloat(pRow.quote.valuation_price) : null;
    const hasLiveQuote = pRow?.quote?.state !== "UNAVAILABLE" && currentUnitPrice !== null;
    const grams = parseFloat(item.quantity_grams) || 0;
    const chi = (grams / 3.75).toFixed(2);
    const totalCostNum = parseFloat(item.total_cost) || 0;

    const currentVal = hasLiveQuote && currentUnitPrice !== null
      ? currentUnitPrice * (grams / 3.75)
      : (pRow?.value ? parseFloat(pRow.value) : totalCostNum);

    const deltaNum = currentVal - totalCostNum;
    const pnlPct = totalCostNum > 0 ? ((deltaNum / totalCostNum) * 100).toFixed(1) : "0.0";
    const isPos = deltaNum >= 0;

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.assetCard}
        onPress={() => setEditingMetal(item)}
        activeOpacity={0.7}
      >
        <View style={styles.assetCardTop}>
          <View style={[styles.iconWrapper, { backgroundColor: colors.goldBg }]}>
            <Ionicons name="sparkles" size={20} color={colors.gold} />
          </View>
          <View style={styles.assetInfo}>
            <Text style={styles.assetName} numberOfLines={1}>
              {item.brand ? `${item.brand} - ${item.product_type}` : item.product_type}
            </Text>
            <Text style={styles.assetSubtitle}>{grams > 0 ? `${grams}g (${chi} chỉ)` : "0 chỉ"}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.assetValue}>{formatVND(currentVal)}</Text>
            <View style={[styles.pnlBadge, isPos ? styles.pnlPositive : styles.pnlNegative]}>
              <Text style={[styles.pnlText, isPos ? styles.pnlTextPositive : styles.pnlTextNegative]}>
                {isPos ? "+" : ""}{formatVND(deltaNum)} ({isPos ? "+" : ""}{pnlPct}%)
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.assetCardDivider} />

        <View style={styles.assetCardBottom}>
          <View style={styles.metaRow}>
            <Text style={styles.priceMetaLabel}>Giá TT hiện tại:</Text>
            {hasLiveQuote && currentUnitPrice !== null ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={styles.priceMetaValue}>{formatVND(currentUnitPrice)}/chỉ</Text>
                {pRow?.quote?.provider && (
                  <View style={styles.providerTag}>
                    <Text style={styles.providerTagText}>{pRow.quote.provider}</Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.priceMetaValue}>—</Text>
            )}
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.priceMetaLabel}>Tổng giá vốn:</Text>
            <Text style={styles.priceMetaValue}>{formatVND(totalCostNum)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSavingsRow = (item: SavingsHolding) => {
    const pRow = portfolioSavingsMap.get(item.id);
    const value = pRow?.value ? parseFloat(pRow.value) : parseFloat(item.principal) || 0;

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.assetCard}
        onPress={() => setSelectedSavings(item)}
        activeOpacity={0.7}
      >
        <View style={styles.assetCardTop}>
          <View style={[styles.iconWrapper, { backgroundColor: colors.savingsBg }]}>
            <Ionicons name="shield-checkmark" size={20} color={colors.savings} />
          </View>
          <View style={styles.assetInfo}>
            <Text style={styles.assetName} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.badgeRow}>
              <Text style={styles.assetSubtitle}>{item.bank_name || "Tiết kiệm"}</Text>
              {item.status === "ACTIVE" && (
                <View style={[styles.quoteBadge, styles.quoteLive]}>
                  <Text style={[styles.quoteText, styles.quoteTextLive]}>Đang gửi</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={styles.assetValue}>{formatVND(value)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderCryptoRow = (item: CryptoHolding) => {
    const pRow = portfolioCryptoMap.get(item.id);
    const currentUnitPrice = pRow?.quote?.valuation_price ? parseFloat(pRow.quote.valuation_price) : null;
    const hasLiveQuote = pRow?.quote?.state !== "UNAVAILABLE" && currentUnitPrice !== null;
    const qty = parseFloat(item.quantity) || 0;
    const totalCostNum = parseFloat(item.total_cost) || 0;

    const currentVal = hasLiveQuote && currentUnitPrice !== null
      ? currentUnitPrice * qty
      : (pRow?.value ? parseFloat(pRow.value) : totalCostNum);

    const deltaNum = currentVal - totalCostNum;
    const pnlPct = totalCostNum > 0 ? ((deltaNum / totalCostNum) * 100).toFixed(1) : "0.0";
    const isPos = deltaNum >= 0;

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.assetCard}
        onPress={() => setEditingCrypto(item)}
        activeOpacity={0.7}
      >
        <View style={styles.assetCardTop}>
          <View style={[styles.iconWrapper, { backgroundColor: colors.cryptoBg }]}>
            <Ionicons name="logo-bitcoin" size={20} color={colors.crypto} />
          </View>
          <View style={styles.assetInfo}>
            <Text style={styles.assetName} numberOfLines={1}>
              {item.display_name || item.symbol.toUpperCase()}
            </Text>
            <Text style={styles.assetSubtitle}>
              {item.quantity} {item.symbol.toUpperCase()}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.assetValue}>{formatVND(currentVal)}</Text>
            <View style={[styles.pnlBadge, isPos ? styles.pnlPositive : styles.pnlNegative]}>
              <Text style={[styles.pnlText, isPos ? styles.pnlTextPositive : styles.pnlTextNegative]}>
                {isPos ? "+" : ""}{formatVND(deltaNum)} ({isPos ? "+" : ""}{pnlPct}%)
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.assetCardDivider} />

        <View style={styles.assetCardBottom}>
          <View style={styles.metaRow}>
            <Text style={styles.priceMetaLabel}>Giá TT hiện tại:</Text>
            {hasLiveQuote && currentUnitPrice !== null ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={styles.priceMetaValue}>{formatVND(currentUnitPrice)}</Text>
                {pRow?.quote?.provider && (
                  <View style={styles.providerTag}>
                    <Text style={styles.providerTagText}>{pRow.quote.provider}</Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.priceMetaValue}>—</Text>
            )}
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.priceMetaLabel}>Tổng giá vốn:</Text>
            <Text style={styles.priceMetaValue}>{formatVND(totalCostNum)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const isLoadingAll = loadingPortfolio && loadingMetals && loadingSavings && loadingCrypto;
  const banner = getBannerData();

  return (
    <View style={styles.container}>
      <Header title="Tài sản & Đầu tư" subtitle="Tiền mặt, Ngân hàng, Vàng, Tiết kiệm & Crypto" />

      {/* Tabs */}
      <View style={styles.tabsRowWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {[
            { key: "ALL", label: "Tất cả" },
            { key: "ACCOUNTS", label: "Tiền & Ví" },
            { key: "GOLD", label: "Vàng & Kim loại" },
            { key: "SAVINGS", label: "Sổ tiết kiệm" },
            { key: "CRYPTO", label: "Crypto" },
          ].map((tab) => {
            const isSelected = selectedTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabButton, isSelected && styles.tabButtonActive]}
                onPress={() => setSelectedTab(tab.key as any)}
              >
                <Text style={[styles.tabText, isSelected && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

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
        {/* Dynamic Category Overview Banner */}
        <Card elevated style={styles.overviewCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.overviewLabel}>{banner.title}</Text>
            <Text style={[styles.overviewCountBadge, { color: banner.color }]}>{banner.count}</Text>
          </View>
          {isLoadingAll ? (
            <ActivityIndicator color={banner.color} style={{ marginVertical: 8 }} />
          ) : (
            <Text style={[styles.overviewValue, { color: banner.color }]}>
              {formatVND(banner.amount)}
            </Text>
          )}
          {banner.subText !== "" && (
            <Text style={styles.overviewSubText}>{banner.subText}</Text>
          )}
        </Card>

        {/* Liquid Accounts & Wallets Section */}
        {(selectedTab === "ALL" || selectedTab === "ACCOUNTS") && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                <Ionicons name="wallet-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.sectionTitle}>Tiền mặt & Tài khoản ví</Text>
              </View>

              <TouchableOpacity
                style={styles.addMiniBtn}
                onPress={() => {
                  setSelectedAccount(null);
                  setShowAddAccount(true);
                }}
              >
                <Ionicons name="add" size={16} color={colors.primary} />
                <Text style={[styles.addMiniBtnText, { color: colors.primary }]}>Thêm ví</Text>
              </TouchableOpacity>
            </View>

            {loadingAccounts && accounts.length === 0 ? (
              <ActivityIndicator color={colors.primary} style={{ margin: 20 }} />
            ) : accounts.length === 0 ? (
              <Card style={{ padding: 20 }}>
                <Text style={styles.emptyText}>Chưa có tài khoản nào</Text>
              </Card>
            ) : (
              accounts.map((acc) => (
                <AccountCard
                  key={acc.id}
                  account={acc}
                  balance={balanceMap.get(acc.id)}
                  onPress={() => handleAccountPress(acc)}
                />
              ))
            )}
          </View>
        )}

        {/* Precious Metals Section */}
        {(selectedTab === "ALL" || selectedTab === "GOLD") && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                <Ionicons name="sparkles" size={18} color={colors.gold} style={{ marginRight: 6 }} />
                <Text style={styles.sectionTitle}>Vàng & Kim loại quý</Text>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <TouchableOpacity
                  style={styles.addMiniBtn}
                  onPress={() => setShowAddMetal(true)}
                >
                  <Ionicons name="add" size={16} color={colors.gold} />
                  <Text style={[styles.addMiniBtnText, { color: colors.gold }]}>Thêm</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.syncButton}
                  onPress={handleSyncMetals}
                  disabled={isSyncingMetals}
                >
                  {isSyncingMetals ? (
                    <ActivityIndicator size="small" color={colors.gold} />
                  ) : (
                    <>
                      <Ionicons name="refresh" size={13} color={colors.gold} style={{ marginRight: 4 }} />
                      <Text style={[styles.syncButtonText, { color: colors.gold }]}>Cập nhật giá</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {loadingMetals && displayedMetals.length === 0 ? (
              <ActivityIndicator color={colors.gold} style={{ margin: 20 }} />
            ) : displayedMetals.length === 0 ? (
              <Card style={{ padding: 20 }}>
                <Text style={styles.emptyText}>Chưa có tài sản vàng nào</Text>
              </Card>
            ) : (
              displayedMetals.map(renderMetalRow)
            )}
          </View>
        )}

        {/* Savings Section */}
        {(selectedTab === "ALL" || selectedTab === "SAVINGS") && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                <Ionicons name="shield-checkmark" size={18} color={colors.savings} style={{ marginRight: 6 }} />
                <Text style={styles.sectionTitle}>Sổ tiết kiệm</Text>
              </View>

              <TouchableOpacity
                style={styles.addMiniBtn}
                onPress={() => setShowAddSavings(true)}
              >
                <Ionicons name="add" size={16} color={colors.savings} />
                <Text style={[styles.addMiniBtnText, { color: colors.savings }]}>Mở sổ</Text>
              </TouchableOpacity>
            </View>

            {loadingSavings && displayedSavings.length === 0 ? (
              <ActivityIndicator color={colors.savings} style={{ margin: 20 }} />
            ) : displayedSavings.length === 0 ? (
              <Card style={{ padding: 20 }}>
                <Text style={styles.emptyText}>Chưa có sổ tiết kiệm nào</Text>
              </Card>
            ) : (
              displayedSavings.map(renderSavingsRow)
            )}
          </View>
        )}

        {/* Crypto Section */}
        {(selectedTab === "ALL" || selectedTab === "CRYPTO") && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                <Ionicons name="logo-bitcoin" size={18} color={colors.crypto} style={{ marginRight: 6 }} />
                <Text style={styles.sectionTitle}>Tiền mã hoá (Crypto)</Text>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <TouchableOpacity
                  style={styles.addMiniBtn}
                  onPress={() => setShowAddCrypto(true)}
                >
                  <Ionicons name="add" size={16} color={colors.crypto} />
                  <Text style={[styles.addMiniBtnText, { color: colors.crypto }]}>Thêm</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.syncButton}
                  onPress={handleSyncCrypto}
                  disabled={isSyncingCrypto}
                >
                  {isSyncingCrypto ? (
                    <ActivityIndicator size="small" color={colors.crypto} />
                  ) : (
                    <>
                      <Ionicons name="refresh" size={13} color={colors.crypto} style={{ marginRight: 4 }} />
                      <Text style={[styles.syncButtonText, { color: colors.crypto }]}>Cập nhật giá</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {loadingCrypto && displayedCrypto.length === 0 ? (
              <ActivityIndicator color={colors.crypto} style={{ margin: 20 }} />
            ) : displayedCrypto.length === 0 ? (
              <Card style={{ padding: 20 }}>
                <Text style={styles.emptyText}>Chưa có tài sản crypto nào</Text>
              </Card>
            ) : (
              displayedCrypto.map(renderCryptoRow)
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modals */}
      <EditAccountModal
        visible={showAddAccount}
        account={selectedAccount}
        onClose={() => {
          setShowAddAccount(false);
          setSelectedAccount(null);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["accounts"] });
          queryClient.invalidateQueries({ queryKey: ["portfolio"] });
        }}
      />

      <BalanceAdjustmentModal
        visible={showAdjustAccount}
        account={selectedAccount}
        currentBalance={selectedAccount ? balanceMap.get(selectedAccount.id) || "0" : "0"}
        onClose={() => {
          setShowAdjustAccount(false);
          setSelectedAccount(null);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["accounts"] });
          queryClient.invalidateQueries({ queryKey: ["portfolio"] });
        }}
      />

      <AddMetalModal
        visible={showAddMetal}
        accounts={accounts}
        onClose={() => setShowAddMetal(false)}
        onSuccess={() => {
          refetchMetals();
          refetchPortfolio();
        }}
      />

      <EditMetalModal
        visible={!!editingMetal}
        metal={editingMetal}
        onClose={() => setEditingMetal(null)}
        onSaved={() => {
          refetchMetals();
          refetchPortfolio();
        }}
        onDeleted={() => {
          refetchMetals();
          refetchPortfolio();
        }}
      />

      <AddCryptoModal
        visible={showAddCrypto}
        accounts={accounts}
        onClose={() => setShowAddCrypto(false)}
        onSuccess={() => {
          refetchCrypto();
          refetchPortfolio();
        }}
      />

      <EditCryptoModal
        visible={!!editingCrypto}
        crypto={editingCrypto}
        onClose={() => setEditingCrypto(null)}
        onSaved={() => {
          refetchCrypto();
          refetchPortfolio();
        }}
        onDeleted={() => {
          refetchCrypto();
          refetchPortfolio();
        }}
      />

      <AddSavingsModal
        visible={showAddSavings}
        accounts={accounts}
        onClose={() => setShowAddSavings(false)}
        onSuccess={() => {
          refetchSavings();
          refetchPortfolio();
        }}
      />

      <SavingsDetailModal
        visible={!!selectedSavings}
        savings={selectedSavings}
        accounts={accounts}
        onClose={() => setSelectedSavings(null)}
        onSuccess={() => {
          refetchSavings();
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
  tabsRowWrapper: {
    marginBottom: 12,
  },
  tabsRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  overviewCard: {
    padding: 16,
    marginBottom: 20,
  },
  overviewLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  overviewCountBadge: {
    fontSize: 12,
    fontWeight: "700",
  },
  overviewValue: {
    fontSize: 26,
    fontWeight: "800",
    marginVertical: 6,
  },
  overviewSubText: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  addMiniBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addMiniBtnText: {
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 2,
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  syncButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
  assetCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  assetCardTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  assetCardDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 10,
  },
  assetCardBottom: {
    gap: 6,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  iconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  assetInfo: {
    flex: 1,
    marginRight: 8,
  },
  assetName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
    gap: 6,
  },
  assetSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  assetValue: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  pnlBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 3,
  },
  pnlPositive: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  pnlNegative: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },
  pnlText: {
    fontSize: 10,
    fontWeight: "700",
  },
  pnlTextPositive: {
    color: "#10b981",
  },
  pnlTextNegative: {
    color: "#ef4444",
  },
  priceMetaLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  priceMetaValue: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  providerTag: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  providerTagText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#60a5fa",
  },
  quoteBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  quoteLive: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  quoteText: {
    fontSize: 10,
    fontWeight: "700",
  },
  quoteTextLive: {
    color: colors.primary,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    padding: 10,
  },
});
