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
import { Account, CryptoInput } from "../types";
import { api } from "../api/client";

interface AddCryptoModalProps {
  visible: boolean;
  accounts: Account[];
  onClose: () => void;
  onSuccess: () => void;
}

const POPULAR_COINS = [
  { symbol: "BTC", name: "Bitcoin" },
  { symbol: "ETH", name: "Ethereum" },
  { symbol: "SOL", name: "Solana" },
  { symbol: "BNB", name: "BNB" },
  { symbol: "USDT", name: "Tether USD" },
  { symbol: "SUI", name: "Sui" },
  { symbol: "TON", name: "Toncoin" },
  { symbol: "DOGE", name: "Dogecoin" },
];

export const AddCryptoModal: React.FC<AddCryptoModalProps> = ({
  visible,
  accounts,
  onClose,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const [symbol, setSymbol] = useState("BTC");
  const [displayName, setDisplayName] = useState("Bitcoin");
  const [quantity, setQuantity] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [fundingAccountId, setFundingAccountId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCoinSelect = (coin: { symbol: string; name: string }) => {
    setSymbol(coin.symbol);
    setDisplayName(coin.name);
  };

  const handleQtyChange = (val: string) => {
    setQuantity(val);
    const qNum = parseFloat(val.replace(",", ".")) || 0;
    const pNum = parseFloat(purchasePrice.replace(/[^0-9]/g, "")) || 0;
    if (qNum > 0 && pNum > 0) {
      setTotalCost(String(Math.round(qNum * pNum)));
    }
  };

  const handlePriceChange = (val: string) => {
    const cleaned = val.replace(/[^0-9]/g, "");
    setPurchasePrice(cleaned);
    const pNum = parseFloat(cleaned) || 0;
    const qNum = parseFloat(quantity.replace(",", ".")) || 0;
    if (qNum > 0 && pNum > 0) {
      setTotalCost(String(Math.round(qNum * pNum)));
    }
  };

  const handleTotalCostChange = (val: string) => {
    const cleaned = val.replace(/[^0-9]/g, "");
    setTotalCost(cleaned);
    const tNum = parseFloat(cleaned) || 0;
    const qNum = parseFloat(quantity.replace(",", ".")) || 0;
    if (tNum > 0 && qNum > 0) {
      setPurchasePrice(String(Math.round(tNum / qNum)));
    }
  };

  const handleSubmit = async () => {
    const qNum = parseFloat(quantity.replace(",", "."));
    if (isNaN(qNum) || qNum <= 0) {
      Alert.alert("Lỗi", "Vui lòng nhập số lượng coin hợp lệ");
      return;
    }

    const tNum = parseFloat(totalCost);
    if (isNaN(tNum) || tNum <= 0) {
      Alert.alert("Lỗi", "Vui lòng nhập tổng giá vốn");
      return;
    }

    try {
      setLoading(true);
      const data: CryptoInput = {
        symbol: symbol.toUpperCase().trim(),
        display_name: displayName.trim() || symbol.toUpperCase().trim(),
        quantity: qNum.toFixed(8),
        purchase_price: purchasePrice ? parseFloat(purchasePrice).toFixed(4) : undefined,
        total_cost: tNum.toFixed(4),
        purchase_date: purchaseDate || undefined,
        funding_account_id: fundingAccountId || undefined,
      };

      await api.createCrypto(data);
      onClose();
      onSuccess();
    } catch (err: any) {
      Alert.alert("Lỗi khi thêm crypto", err?.message || "Không thể tạo tài sản crypto.");
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
            <Text style={styles.headerTitle}>Thêm Tiền mã hoá (Crypto)</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Quick coin suggestions */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Gợi ý đồng coin phổ biến</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
                {POPULAR_COINS.map((c) => (
                  <TouchableOpacity
                    key={c.symbol}
                    style={[styles.pill, symbol === c.symbol && styles.pillActive]}
                    onPress={() => handleCoinSelect(c)}
                  >
                    <Text style={[styles.pillText, symbol === c.symbol && styles.pillTextActive]}>
                      {c.symbol}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Symbol & Name */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Mã coin (Ký hiệu)</Text>
              <TextInput
                style={styles.input}
                value={symbol}
                onChangeText={(v) => setSymbol(v.toUpperCase())}
                placeholder="BTC, ETH, SOL..."
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Tên đồng coin</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Bitcoin, Ethereum..."
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Quantity */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Số lượng coin</Text>
              <TextInput
                style={styles.input}
                value={quantity}
                onChangeText={handleQtyChange}
                placeholder="0.25"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>

            {/* Price per coin */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Đơn giá mua (₫/coin)</Text>
              <TextInput
                style={styles.input}
                value={purchasePrice ? Number(purchasePrice).toLocaleString("vi-VN") : ""}
                onChangeText={handlePriceChange}
                placeholder="2.350.000.000"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </View>

            {/* Total Cost */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Tổng vốn đã mua (₫)</Text>
              <TextInput
                style={styles.input}
                value={totalCost ? Number(totalCost).toLocaleString("vi-VN") : ""}
                onChangeText={handleTotalCostChange}
                placeholder="587.500.000"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </View>

            {/* Purchase date */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Ngày mua (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={purchaseDate}
                onChangeText={setPurchaseDate}
                placeholder="2026-08-30"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Funding Account */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Trừ tiền từ tài khoản (tuỳ chọn)</Text>
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
              style={[styles.submitButton, { backgroundColor: colors.crypto }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitButtonText}>Thêm vào danh mục</Text>
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
    backgroundColor: colors.crypto,
    borderColor: colors.crypto,
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
