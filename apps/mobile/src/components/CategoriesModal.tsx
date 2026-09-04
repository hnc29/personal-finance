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
import { Category, CategoryInput } from "../types";
import { api } from "../api/client";

interface CategoriesModalProps {
  visible: boolean;
  categories: Category[];
  onClose: () => void;
  onRefresh: () => void;
}

const ICON_SUGGESTIONS = [
  "restaurant",
  "cart",
  "car",
  "home",
  "medical",
  "school",
  "airplane",
  "game-controller",
  "film",
  "fitness",
  "gift",
  "wallet",
  "cash",
  "briefcase",
  "trending-up",
  "shield-checkmark",
];

export const CategoriesModal: React.FC<CategoriesModalProps> = ({
  visible,
  categories,
  onClose,
  onRefresh,
}) => {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"LIST" | "ADD" | "EDIT">("LIST");
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<number | null>(null);
  const [icon, setIcon] = useState("cart");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);

  // Group categories into roots and children
  const rootCategories = categories.filter((c) => c.parent_id === null);
  const getChildren = (pId: number) => categories.filter((c) => c.parent_id === pId);

  const handleOpenAdd = (pId: number | null = null) => {
    setMode("ADD");
    setName("");
    setParentId(pId);
    setIcon("cart");
    setIsActive(true);
  };

  const handleOpenEdit = (cat: Category) => {
    setSelectedCat(cat);
    setMode("EDIT");
    setName(cat.name);
    setParentId(cat.parent_id);
    setIcon(cat.icon || "folder");
    setIsActive(cat.is_active);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Lỗi", "Vui lòng nhập tên danh mục");
      return;
    }

    try {
      setLoading(true);
      if (mode === "ADD") {
        const input: CategoryInput = {
          name: name.trim(),
          parent_id: parentId,
          icon,
          is_active: isActive,
        };
        await api.createCategory(input);
      } else if (mode === "EDIT" && selectedCat) {
        await api.updateCategory(selectedCat.id, {
          name: name.trim(),
          parent_id: parentId,
          icon,
          is_active: isActive,
        });
      }

      onRefresh();
      setMode("LIST");
    } catch (err: any) {
      Alert.alert("Lỗi lưu danh mục", err?.message || "Không thể lưu danh mục.");
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
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {mode === "LIST" ? "Quản lý danh mục" : mode === "ADD" ? "Thêm danh mục mới" : "Chỉnh sửa danh mục"}
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                if (mode !== "LIST") {
                  setMode("LIST");
                } else {
                  onClose();
                }
              }}
            >
              <Ionicons name={mode === "LIST" ? "close" : "arrow-back"} size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {mode === "LIST" ? (
              <>
                <TouchableOpacity
                  style={styles.addMainButton}
                  onPress={() => handleOpenAdd(null)}
                >
                  <Ionicons name="add-circle" size={20} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.addMainButtonText}>Thêm danh mục gốc mới</Text>
                </TouchableOpacity>

                {rootCategories.map((root) => {
                  const children = getChildren(root.id);
                  return (
                    <View key={root.id} style={styles.catGroup}>
                      <View style={styles.rootRow}>
                        <View style={styles.rootLeft}>
                          <Ionicons name={(root.icon || "folder") as any} size={18} color={colors.primary} style={{ marginRight: 8 }} />
                          <Text style={styles.rootName}>{root.name}</Text>
                          {!root.is_active && <Text style={styles.inactiveTag}>(Ngừng dùng)</Text>}
                        </View>
                        <View style={styles.rootActions}>
                          <TouchableOpacity
                            style={styles.smallActionBtn}
                            onPress={() => handleOpenAdd(root.id)}
                          >
                            <Ionicons name="add" size={16} color={colors.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.smallActionBtn}
                            onPress={() => handleOpenEdit(root)}
                          >
                            <Ionicons name="create-outline" size={16} color={colors.textSecondary} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {children.map((child) => (
                        <View key={child.id} style={styles.childRow}>
                          <View style={styles.childLeft}>
                            <View style={styles.treeLine} />
                            <Ionicons name={(child.icon || "bookmark-outline") as any} size={15} color={colors.textSecondary} style={{ marginRight: 8 }} />
                            <Text style={styles.childName}>{child.name}</Text>
                            {!child.is_active && <Text style={styles.inactiveTag}>(Ngừng dùng)</Text>}
                          </View>
                          <TouchableOpacity
                            style={styles.smallActionBtn}
                            onPress={() => handleOpenEdit(child)}
                          >
                            <Ionicons name="create-outline" size={15} color={colors.textSecondary} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  );
                })}
              </>
            ) : (
              <>
                {/* Form Add/Edit */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Tên danh mục</Text>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Ăn uống, Mua sắm, Lương..."
                    placeholderTextColor={colors.textMuted}
                    autoFocus
                  />
                </View>

                {/* Parent category picker */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Danh mục cha</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
                    <TouchableOpacity
                      style={[styles.pill, parentId === null && styles.pillActive]}
                      onPress={() => setParentId(null)}
                    >
                      <Text style={[styles.pillText, parentId === null && styles.pillTextActive]}>
                        Cấp cao nhất (Gốc)
                      </Text>
                    </TouchableOpacity>
                    {categories.filter((c) => selectedCat ? c.id !== selectedCat.id : true).map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.pill, parentId === c.id && styles.pillActive]}
                        onPress={() => setParentId(c.id)}
                      >
                        <Text style={[styles.pillText, parentId === c.id && styles.pillTextActive]}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Icon picker */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Biểu tượng (Icon)</Text>
                  <View style={styles.iconGrid}>
                    {ICON_SUGGESTIONS.map((ic) => (
                      <TouchableOpacity
                        key={ic}
                        style={[styles.iconBox, icon === ic && styles.iconBoxActive]}
                        onPress={() => setIcon(ic)}
                      >
                        <Ionicons name={ic as any} size={20} color={icon === ic ? "#ffffff" : colors.textSecondary} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Active switch */}
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setIsActive(!isActive)}
                >
                  <Ionicons
                    name={isActive ? "checkbox" : "square-outline"}
                    size={20}
                    color={isActive ? colors.primary : colors.textSecondary}
                  />
                  <Text style={styles.checkboxLabel}>Đang hoạt động</Text>
                </TouchableOpacity>

                {/* Submit */}
                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={handleSave}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.submitButtonText}>
                      {mode === "ADD" ? "Tạo danh mục" : "Lưu thay đổi"}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}

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
  addMainButton: {
    flexDirection: "row",
    backgroundColor: colors.primary,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  addMainButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
  catGroup: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  rootRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  rootLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  rootName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  rootActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  smallActionBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  childRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  childLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  treeLine: {
    width: 12,
    height: 1,
    backgroundColor: colors.border,
    marginRight: 8,
  },
  childName: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text,
  },
  inactiveTag: {
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: 6,
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
    backgroundColor: colors.primary,
    borderColor: colors.primary,
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
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBoxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
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
  submitButton: {
    backgroundColor: colors.primary,
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
