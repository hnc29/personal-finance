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
import { formatVND } from "../utils/formatters";
import { Account, MetalInput } from "../types";
import { api } from "../api/client";

interface AddMetalModalProps {
  visible: boolean;
  accounts: Account[];
  onClose: () => void;
  onSuccess: () => void;
}

const BRAND_OPTIONS = ["SJC", "DOJI", "PNJ", "BTMC", "BTMH", "RAW"];
const PRODUCT_PRESETS = [
  "Nhẫn tròn trơn 999.9",
  "Vàng miếng SJC 1 lượng",
  "Vàng miếng SJC 1 chỉ",
  "Vàng trang sức 24K",
  "Vàng nhẫn DOJI Hưng Thịnh Vượng",
  "Vàng Rồng Thăng Long BTMC",
];

export const AddMetalModal: React.FC<AddMetalModalProps> = ({
  visible,
  accounts,
  onClose,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const [brand, setBrand] = useState("SJC");
  const [productType, setProductType] = useState("Nhẫn tròn trơn 999.9");
  const [unitMode, setUnitMode] = useState<"CHI" | "GRAM">("CHI");
  const [quantity, setQuantity] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [fundingAccountId, setFundingAccountId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const handleQtyChange = (val: string) => {
    setQuantity(val);
    const qNum = parseFloat(val.replace(",", ".")) || 0;
    const pNum = parseFloat(pricePerUnit.replace(/[^0-9]/g, "")) || 0;
    if (qNum > 0 && pNum > 0) {
      setTotalCost(String(Math.round(qNum * pNum)));
    }
  };

  const handlePriceChange = (val: string) => {
    const cleaned = val.replace(/[^0-9]/g, "");
    setPricePerUnit(cleaned);
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
      setPricePerUnit(String(Math.round(tNum / qNum)));
    }
  };

  const handleSubmit = async () => {
    const qNum = parseFloat(quantity.replace(",", "."));
    if (isNaN(qNum) || qNum <= 0) {
      Alert.alert("Lỗi", "Vui lòng nhập số lượng vàng hợp lệ");
      return;
    }

    const tNum = parseFloat(totalCost);
    if (isNaN(tNum) || tNum <= 0) {
      Alert.alert("Lỗi", "Vui lòng nhập tổng giá vốn mua vàng");
      return;
    }

    const grams = unitMode === "CHI" ? qNum * 3.75 : qNum;

    try {
      setLoading(true);
      const data: MetalInput = {
        metal_type: "GOLD",
        brand,
        product_type: productType.trim() || "Vàng",
        purity: "0.9999",
        quantity_grams: grams.toFixed(4),
        purchase_price: pricePerUnit ? parseFloat(pricePerUnit).toFixed(4) : undefined,
        total_cost: tNum.toFixed(4),
        purchase_date: purchaseDate || undefined,
        funding_account_id: fundingAccountId || undefined,
      };

      await api.createMetal(data);
      onClose();
      onSuccess();
    } catch (err: any) {
      Alert.alert("Lỗi khi thêm vàng", err?.message || "Không thể tạo tài sản vàng.");
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
            <Text style={styles.headerTitle}>Thêm Vàng & Kim loại quý</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Brand selection */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Thương hiệu vàng</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
                {BRAND_OPTIONS.map((b) => (
                  <TouchableOpacity
                    key={b}
                    style={[styles.pill, brand === b && styles.pillActive]}
                    onPress={() => setBrand(b)}
                  >
                    <Text style={[styles.pillText, brand === b && styles.pillTextActive]}>
                      {b}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Product Type Presets */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Loại sản phẩm</Text>
              <TextInput
                style={styles.input}
                value={productType}
                onChangeText={setProductType}
                placeholder="Nhẫn trơn, Vàng miếng SJC..."
                placeholderTextColor={colors.textMuted}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.pillsRow, { marginTop: 6 }]}>
                {PRODUCT_PRESETS.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.smallPill, productType === p && styles.smallPillActive]}
                    onPress={() => setProductType(p)}
                  >
                    <Text style={[styles.smallPillText, productType === p && styles.smallPillTextActive]}>
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Unit & Quantity */}
            <View style={styles.formGroup}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <Text style={styles.label}>Khối lượng vàng</Text>
                <View style={styles.unitToggle}>
                  <TouchableOpacity
                    style={[styles.unitBtn, unitMode === "CHI" && styles.unitBtnActive]}
                    onPress={() => setUnitMode("CHI")}
                  >
                    <Text style={[styles.unitBtnText, unitMode === "CHI" && styles.unitBtnTextActive]}>Chỉ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.unitBtn, unitMode === "GRAM" && styles.unitBtnActive]}
                    onPress={() => setUnitMode("GRAM")}
                  >
                    <Text style={[styles.unitBtnText, unitMode === "GRAM" && styles.unitBtnTextActive]}>Gram</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TextInput
                style={styles.input}
                value={quantity}
                onChangeText={handleQtyChange}
                placeholder={unitMode === "CHI" ? "Số chỉ (ví dụ: 2.5)" : "Số gram (ví dụ: 9.375)"}
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>

            {/* Price per unit */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Đơn giá mua ({unitMode === "CHI" ? "₫/chỉ" : "₫/gram"})</Text>
              <TextInput
                style={styles.input}
                value={pricePerUnit ? Number(pricePerUnit).toLocaleString("vi-VN") : ""}
                onChangeText={handlePriceChange}
                placeholder="8.500.000"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </View>

            {/* Total Cost */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Tổng tiền đã trả (Giá vốn ₫)</Text>
              <TextInput
                style={styles.input}
                value={totalCost ? Number(totalCost).toLocaleString("vi-VN") : ""}
                onChangeText={handleTotalCostChange}
                placeholder="21.250.000"
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
              style={[styles.submitButton, { backgroundColor: colors.gold }]}
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
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  pillText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  pillTextActive: {
    color: "#000000",
    fontWeight: "700",
  },
  smallPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    marginRight: 6,
  },
  smallPillActive: {
    backgroundColor: "rgba(234, 179, 8, 0.2)",
    borderWidth: 1,
    borderColor: colors.gold,
  },
  smallPillText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  smallPillTextActive: {
    color: colors.gold,
    fontWeight: "600",
  },
  unitToggle: {
    flexDirection: "row",
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    padding: 2,
  },
  unitBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  unitBtnActive: {
    backgroundColor: colors.gold,
  },
  unitBtnText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  unitBtnTextActive: {
    color: "#000000",
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
    color: "#000000",
  },
});
