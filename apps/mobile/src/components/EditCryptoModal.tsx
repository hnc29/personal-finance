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
import { CryptoHolding, CryptoUpdate } from "../types";
import { api } from "../api/client";

interface EditCryptoModalProps {
  visible: boolean;
  crypto: CryptoHolding | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export const EditCryptoModal: React.FC<EditCryptoModalProps> = ({
  visible,
  crypto,
  onClose,
  onSaved,
  onDeleted,
}) => {
  const insets = useSafeAreaInsets();
  const [symbol, setSymbol] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [excludedFromReports, setExcludedFromReports] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (crypto) {
      setSymbol(crypto.symbol || "");
      setDisplayName(crypto.display_name || "");
      setQuantity(crypto.quantity || "");
      setPurchasePrice(crypto.purchase_price ? String(Math.round(parseFloat(crypto.purchase_price))) : "");
      setTotalCost(crypto.total_cost ? String(Math.round(parseFloat(crypto.total_cost))) : "");
      setPurchaseDate(crypto.purchase_date || "");
      setExcludedFromReports(!!crypto.excluded_from_reports);
    }
  }, [crypto]);

  const handleSave = async () => {
    if (!crypto) return;
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
      const data: CryptoUpdate = {
        symbol: symbol.toUpperCase().trim(),
        display_name: displayName.trim() || symbol.toUpperCase().trim(),
        quantity: qNum.toFixed(8),
        purchase_price: purchasePrice ? parseFloat(purchasePrice).toFixed(4) : undefined,
        total_cost: tNum.toFixed(4),
        purchase_date: purchaseDate || undefined,
        excluded_from_reports: excludedFromReports,
      };

      await api.updateCrypto(crypto.id, data);
      onClose();
      onSaved();
    } catch (err: any) {
      Alert.alert("Lỗi cập nhật", err?.message || "Không thể cập nhật tài sản crypto.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (!crypto) return;
    Alert.alert(
      "Xác nhận xoá",
      `Bạn có chắc chắn muốn xoá tài sản crypto "${crypto.display_name || crypto.symbol}"?`,
      [
        { text: "Huỷ", style: "cancel" },
        {
          text: "Xoá tài sản",
          style: "destructive",
          onPress: async () => {
            try {
              setDeleting(true);
              await api.deleteCrypto(crypto.id);
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

  if (!crypto) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Chỉnh sửa Tiền mã hoá</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Symbol */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Mã coin (Ký hiệu)</Text>
              <TextInput
                style={styles.input}
                value={symbol}
                onChangeText={(v) => setSymbol(v.toUpperCase())}
                placeholder="BTC, ETH..."
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
              />
            </View>

            {/* Display Name */}
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
                onChangeText={setQuantity}
                placeholder="0.5"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>

            {/* Purchase price */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Đơn giá mua (₫/coin)</Text>
              <TextInput
                style={styles.input}
                value={purchasePrice ? Number(purchasePrice).toLocaleString("vi-VN") : ""}
                onChangeText={(v) => setPurchasePrice(v.replace(/[^0-9]/g, ""))}
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
                onChangeText={(v) => setTotalCost(v.replace(/[^0-9]/g, ""))}
                placeholder="100.000.000"
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
                style={[styles.actionBtn, { backgroundColor: colors.crypto }]}
                onPress={handleSave}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={[styles.actionBtnText, { color: "#ffffff" }]}>Lưu thay đổi</Text>
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
