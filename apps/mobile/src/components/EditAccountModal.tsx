import React, { useState, useEffect, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { Account, AccountInput, AccountType, AccountUpdate } from "../types";
import { api } from "../api/client";
import { AccountLogo } from "./AccountLogo";
import { ALL_BRAND_LIST, BankBrand } from "../utils/bankLogos";

interface EditAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  account?: Account | null; // If null, create mode; otherwise edit mode
}

const EWALLET_KEYS = new Set([
  "MOMO",
  "ZALOPAY",
  "VIETTELMONEY",
  "SHOPEEPAY",
  "VNPAY",
  "PAYOO",
  "GRABPAY",
  "TRUEMONEY",
  "TIKI",
  "NEXTPAY",
  "PAYPAL",
  "APPLEPAY",
  "GOOGLEPAY",
]);

const FOREIGN_BANK_KEYS = new Set([
  "SHINHAN",
  "HSBC",
  "STANDARDCHARTERED",
  "CITIBANK",
  "UOB",
  "PUBLICBANK",
  "VRB",
  "WOORIBANK",
  "CIMB",
  "HONGLEONG",
]);

export const EditAccountModal: React.FC<EditAccountModalProps> = ({
  visible,
  onClose,
  onSuccess,
  account,
}) => {
  const insets = useSafeAreaInsets();
  const isEditing = !!account;

  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("BANK");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");
  const [creditLimit, setCreditLimit] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Icon Gallery Modal state
  const [showIconGallery, setShowIconGallery] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const [galleryTab, setGalleryTab] = useState<"ALL" | "BANK_VN" | "BANK_FOREIGN" | "EWALLET">("ALL");

  useEffect(() => {
    if (account) {
      setName(account.name);
      setAccountType(account.account_type);
      setIsActive(account.is_active);
      setSortOrder(account.sort_order.toString());
      setCreditLimit(account.credit_limit ?? "");
    } else {
      setName("");
      setAccountType("BANK");
      setIsActive(true);
      setSortOrder("0");
      setCreditLimit("");
    }
  }, [account, visible]);

  const handleSelectBrandFromGallery = (item: BankBrand & { key: string }) => {
    // If name is empty or was previous bank preset, replace with new brand name
    if (!name.trim() || ALL_BRAND_LIST.some((b) => b.name === name.trim())) {
      setName(item.name);
    } else {
      // If user typed a custom account name, we can keep it or append/prepend
      setName(item.name);
    }

    // Auto-detect account type
    if (EWALLET_KEYS.has(item.key)) {
      setAccountType("EWALLET");
    } else if (accountType !== "CREDIT_CARD") {
      setAccountType("BANK");
    }

    setShowIconGallery(false);
  };

  const filteredBrands = useMemo(() => {
    const q = iconSearch.trim().toLowerCase();
    return ALL_BRAND_LIST.filter((b) => {
      // Tab filter
      if (galleryTab === "EWALLET" && !EWALLET_KEYS.has(b.key)) return false;
      if (galleryTab === "BANK_FOREIGN" && !FOREIGN_BANK_KEYS.has(b.key)) return false;
      if (galleryTab === "BANK_VN" && (EWALLET_KEYS.has(b.key) || FOREIGN_BANK_KEYS.has(b.key))) return false;

      // Search filter
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.shortLabel.toLowerCase().includes(q) ||
        b.key.toLowerCase().includes(q)
      );
    });
  }, [iconSearch, galleryTab]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert("Lỗi", "Vui lòng nhập tên tài khoản");
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing && account) {
        const updateData: AccountUpdate = {
          name: name.trim(),
          account_type: accountType,
          is_active: isActive,
          sort_order: parseInt(sortOrder, 10) || 0,
          credit_limit: accountType === "CREDIT_CARD" && creditLimit.trim() ? creditLimit.trim() : null,
        };
        await api.updateAccount(account.id, updateData);
        Alert.alert("Thành công", "Đã cập nhật tài khoản");
      } else {
        const createData: AccountInput = {
          name: name.trim(),
          account_type: accountType,
          currency: "VND",
          is_active: isActive,
          sort_order: parseInt(sortOrder, 10) || 0,
          credit_limit: accountType === "CREDIT_CARD" && creditLimit.trim() ? creditLimit.trim() : null,
        };
        await api.createAccount(createData);
        Alert.alert("Thành công", "Đã tạo tài khoản mới");
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert("Lỗi", err?.message || "Không thể lưu thông tin tài khoản");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <View
          style={[
            styles.container,
            { paddingBottom: Math.max(insets.bottom, 16) + 12 },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <AccountLogo name={name || "Ngân hàng"} accountType={accountType} size={34} />
              <Text style={styles.title}>
                {isEditing ? "Chỉnh sửa tài khoản" : "Thêm tài khoản mới"}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Account Type Selector */}
            <Text style={styles.sectionLabel}>Loại tài khoản</Text>
            <View style={styles.typeSelector}>
              {(
                [
                  { type: "BANK", label: "Ngân hàng" },
                  { type: "CASH", label: "Tiền mặt" },
                  { type: "CREDIT_CARD", label: "Thẻ tín dụng" },
                  { type: "EWALLET", label: "Ví điện tử" },
                ] as const
              ).map((t) => {
                const active = accountType === t.type;
                return (
                  <TouchableOpacity
                    key={t.type}
                    style={[styles.typeButton, active && styles.typeButtonActive]}
                    onPress={() => setAccountType(t.type)}
                  >
                    <Text style={[styles.typeText, active && styles.typeTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Icon Picker Gallery Trigger Button */}
            {accountType !== "CASH" && (
              <View style={styles.iconPickerBox}>
                <View style={styles.iconPickerLeft}>
                  <AccountLogo name={name || "Ngân hàng"} accountType={accountType} size={36} />
                  <View style={{ marginLeft: 12 }}>
                    <Text style={styles.iconPickerLabel}>Biểu tượng hiển thị</Text>
                    <Text style={styles.iconPickerSub}>Tự động nhận diện theo tên hoặc tự chọn</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.openGalleryBtn}
                  onPress={() => {
                    setIconSearch("");
                    setShowIconGallery(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="grid-outline" size={16} color={colors.primary} />
                  <Text style={styles.openGalleryBtnText}>Kho icon (50+)</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Account Name */}
            <Text style={styles.sectionLabel}>Tên tài khoản / Ví *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="VD: Vietcombank, Techcombank, MoMo, Ví Tiền mặt..."
              placeholderTextColor={colors.textMuted}
            />

            {/* Credit Limit (Only for Credit Card) */}
            {accountType === "CREDIT_CARD" && (
              <>
                <Text style={styles.sectionLabel}>Hạn mức tín dụng (tuỳ chọn)</Text>
                <TextInput
                  style={styles.input}
                  value={creditLimit}
                  onChangeText={(t) => setCreditLimit(t.replace(/[^0-9]/g, ""))}
                  placeholder="VD: 50000000"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                />
              </>
            )}

            {/* Sort Order */}
            <Text style={styles.sectionLabel}>Thứ tự hiển thị</Text>
            <TextInput
              style={styles.input}
              value={sortOrder}
              onChangeText={setSortOrder}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />

            {/* Is Active Switch */}
            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchLabel}>Đang sử dụng</Text>
                <Text style={styles.switchSub}>Tắt nếu không muốn ví này xuất hiện khi ghi giao dịch</Text>
              </View>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
                thumbColor="#ffffff"
              />
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, submitting && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {isEditing ? "Lưu thay đổi" : "Tạo tài khoản"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* 50+ Brand Icon Gallery Modal */}
      <Modal visible={showIconGallery} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.galleryOverlay}
        >
          <View style={[styles.galleryContainer, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
            {/* Gallery Header */}
            <View style={styles.galleryHeader}>
              <Text style={styles.galleryTitle}>Kho Biểu Tượng Ngân Hàng & Ví</Text>
              <TouchableOpacity onPress={() => setShowIconGallery(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Search Bar */}
            <View style={styles.gallerySearchBox}>
              <Ionicons name="search-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.gallerySearchInput}
                placeholder="Tìm ngân hàng hoặc ví (VCB, MoMo, Techcom...)"
                placeholderTextColor={colors.textMuted}
                value={iconSearch}
                onChangeText={setIconSearch}
                clearButtonMode="while-editing"
                autoCapitalize="none"
              />
              {iconSearch.length > 0 && (
                <TouchableOpacity onPress={() => setIconSearch("")}>
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Category Filter Tabs */}
            <View style={styles.galleryTabsRow}>
              {[
                { key: "ALL", label: "Tất cả" },
                { key: "BANK_VN", label: "Ngân hàng VN" },
                { key: "EWALLET", label: "Ví điện tử" },
                { key: "BANK_FOREIGN", label: "Quốc tế" },
              ].map((t) => {
                const isSelected = galleryTab === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.galleryTabPill, isSelected && styles.galleryTabPillActive]}
                    onPress={() => setGalleryTab(t.key as any)}
                  >
                    <Text style={[styles.galleryTabPillText, isSelected && styles.galleryTabPillTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Grid of Icons */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.galleryGrid}>
              {filteredBrands.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="search-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.emptyText}>Không tìm thấy biểu tượng phù hợp</Text>
                </View>
              ) : (
                filteredBrands.map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.brandCard}
                    onPress={() => handleSelectBrandFromGallery(item)}
                    activeOpacity={0.7}
                  >
                    <AccountLogo
                      name={item.name}
                      accountType={EWALLET_KEYS.has(item.key) ? "EWALLET" : "BANK"}
                      size={44}
                    />
                    <Text style={styles.brandCardName} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
    padding: 20,
    borderTopWidth: 1,
    borderColor: colors.borderLight,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  scroll: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 8,
    marginTop: 10,
  },
  typeSelector: {
    flexDirection: "row",
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  typeButtonActive: {
    backgroundColor: colors.primary,
  },
  typeText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  typeTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  iconPickerBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconPickerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconPickerLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  iconPickerSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  openGalleryBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  openGalleryBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  switchSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  // Gallery Modal Styles
  galleryOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  galleryContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: "88%",
    padding: 16,
  },
  galleryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  galleryTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
  },
  gallerySearchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gallerySearchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    padding: 0,
  },
  galleryTabsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  galleryTabPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  galleryTabPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  galleryTabPillText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  galleryTabPillTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  galleryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingBottom: 24,
  },
  brandCard: {
    width: "31%",
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  brandCardName: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
    marginTop: 8,
    textAlign: "center",
  },
  emptyBox: {
    width: "100%",
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    marginTop: 8,
    fontSize: 13,
    color: colors.textMuted,
  },
});
