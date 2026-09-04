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
import { MetalHolding, MetalUpdate } from "../types";
import { api } from "../api/client";

interface EditMetalModalProps {
  visible: boolean;
  metal: MetalHolding | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

const BRAND_OPTIONS = ["SJC", "DOJI", "PNJ", "BTMC", "BTMH", "RAW"];

export const EditMetalModal: React.FC<EditMetalModalProps> = ({
  visible,
  metal,
  onClose,
  onSaved,
  onDeleted,
}) => {
  const insets = useSafeAreaInsets();
  const [brand, setBrand] = useState("SJC");
  const [productType, setProductType] = useState("");
  const [quantityGrams, setQuantityGrams] = useState("");
  const [unitMode, setUnitMode] = useState<"CHI" | "GRAM">("CHI");
  const [displayQty, setDisplayQty] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [excludedFromReports, setExcludedFromReports] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (metal) {
      setBrand(metal.brand || "SJC");
      setProductType(metal.product_type || "");
      const grams = parseFloat(metal.quantity_grams) || 0;
      setQuantityGrams(String(grams));
      setDisplayQty((grams / 3.75).toFixed(2));
      setUnitMode("CHI");
      setPricePerUnit(metal.purchase_price ? String(Math.round(parseFloat(metal.purchase_price))) : "");
      setTotalCost(metal.total_cost ? String(Math.round(parseFloat(metal.total_cost))) : "");
      setPurchaseDate(metal.purchase_date || "");
      setExcludedFromReports(!!metal.excluded_from_reports);
    }
  }, [metal]);

  const handleQtyChange = (val: string) => {
    setDisplayQty(val);
    const qNum = parseFloat(val.replace(",", ".")) || 0;
    const grams = unitMode === "CHI" ? qNum * 3.75 : qNum;
    setQuantityGrams(String(grams));
  };

  const handleSave = async () => {
    if (!metal) return;
    const gNum = parseFloat(quantityGrams);
    if (isNaN(gNum) || gNum <= 0) {
      Alert.alert("Lỗi", "Vui lòng nhập khối lượng vàng hợp lệ");
      return;
    }

    const tNum = parseFloat(totalCost);
    if (isNaN(tNum) || tNum <= 0) {
      Alert.alert("Lỗi", "Vui lòng nhập giá vốn");
      return;
    }

    try {
      setLoading(true);
      const data: MetalUpdate = {
        brand,
        product_type: productType.trim() || "Vàng",
        quantity_grams: gNum.toFixed(4),
        purchase_price: pricePerUnit ? parseFloat(pricePerUnit).toFixed(4) : undefined,
        total_cost: tNum.toFixed(4),
        purchase_date: purchaseDate || undefined,
        excluded_from_reports: excludedFromReports,
      };

      await api.updateMetal(metal.id, data);
      onClose();
      onSaved();
    } catch (err: any) {
      Alert.alert("Lỗi cập nhật", err?.message || "Không thể cập nhật tài sản.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (!metal) return;
    Alert.alert(
      "Xác nhận xoá",
      `Bạn có chắc chắn muốn xoá tài sản vàng "${metal.brand} - ${metal.product_type}"?`,
      [
        { text: "Huỷ", style: "cancel" },
        {
          text: "Xoá tài sản",
          style: "destructive",
          onPress: async () => {
            try {
              setDeleting(true);
              await api.deleteMetal(metal.id);
              onClose();
              onDeleted();
            } catch (err: any) {
              Alert.alert("Lỗi khi xoá", err?.message || "Không thể xoá tài sản.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (!metal) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Chỉnh sửa Vàng & Kim loại quý</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Brand selection */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Thương hiệu</Text>
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

            {/* Product Type */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Loại sản phẩm</Text>
              <TextInput
                style={styles.input}
                value={productType}
                onChangeText={setProductType}
                placeholder="Nhẫn tròn trơn, Vàng miếng SJC..."
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Quantity */}
            <View style={styles.formGroup}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <Text style={styles.label}>Khối lượng</Text>
                <View style={styles.unitToggle}>
                  <TouchableOpacity
                    style={[styles.unitBtn, unitMode === "CHI" && styles.unitBtnActive]}
                    onPress={() => {
                      setUnitMode("CHI");
                      const g = parseFloat(quantityGrams) || 0;
                      setDisplayQty((g / 3.75).toFixed(2));
                    }}
                  >
                    <Text style={[styles.unitBtnText, unitMode === "CHI" && styles.unitBtnTextActive]}>Chỉ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.unitBtn, unitMode === "GRAM" && styles.unitBtnActive]}
                    onPress={() => {
                      setUnitMode("GRAM");
                      const g = parseFloat(quantityGrams) || 0;
                      setDisplayQty(String(g));
                    }}
                  >
                    <Text style={[styles.unitBtnText, unitMode === "GRAM" && styles.unitBtnTextActive]}>Gram</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TextInput
                style={styles.input}
                value={displayQty}
                onChangeText={handleQtyChange}
                placeholder="2.5"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>

            {/* Purchase price */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Đơn giá mua (₫)</Text>
              <TextInput
                style={styles.input}
                value={pricePerUnit ? Number(pricePerUnit).toLocaleString("vi-VN") : ""}
                onChangeText={(v) => setPricePerUnit(v.replace(/[^0-9]/g, ""))}
                placeholder="8.500.000"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </View>

            {/* Total Cost */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Tổng giá vốn (₫)</Text>
              <TextInput
                style={styles.input}
                value={totalCost ? Number(totalCost).toLocaleString("vi-VN") : ""}
                onChangeText={(v) => setTotalCost(v.replace(/[^0-9]/g, ""))}
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

            {/* Excluded from reports checkbox */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setExcludedFromReports(!excludedFromReports)}
            >
              <Ionicons
                name={excludedFromReports ? "checkbox" : "square-outline"}
                size={20}
                color={excludedFromReports ? colors.primary : colors.textSecondary}
              />
              <Text style={styles.checkboxLabel}>Không tính vào báo cáo & Tài sản ròng</Text>
            </TouchableOpacity>

            {/* Actions */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.gold }]}
                onPress={handleSave}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#000000" />
                ) : (
                  <Text style={[styles.actionBtnText, { color: "#000000" }]}>Lưu thay đổi</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.deleteBtn]}
                onPress={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#ef4444" />
                ) : (
                  <Text style={[styles.actionBtnText, { color: "#ef4444" }]}>Xoá</Text>
                )}
              </TouchableOpacity>
            </View>

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
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 10,
  },
  checkboxLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
  },
  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.25)",
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
