import React, { useState, useMemo } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Category, EventType } from "../types";

interface CategoryPickerModalProps {
  visible: boolean;
  eventType: EventType;
  categories: Category[];
  selectedCategoryId: number | null;
  onSelect: (categoryId: number) => void;
  onClose: () => void;
}

function getCategoryRoot(cat: Category, allCats: Category[]): Category {
  const byId = new Map(allCats.map((c) => [c.id, c]));
  let current: Category = cat;
  const seen = new Set<number>();
  while (current.parent_id != null && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = byId.get(current.parent_id);
    if (!parent) break;
    current = parent;
  }
  return current;
}

export const CategoryPickerModal: React.FC<CategoryPickerModalProps> = ({
  visible,
  eventType,
  categories,
  selectedCategoryId,
  onSelect,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const activeCategories = useMemo(
    () => categories.filter((c) => c.is_active),
    [categories]
  );

  // Filter categories by eventType (EXPENSE vs INCOME)
  const scopedCategories = useMemo(() => {
    const isExpense = eventType === "EXPENSE";
    const isIncome = eventType === "INCOME";

    return activeCategories.filter((c) => {
      const root = getCategoryRoot(c, activeCategories);
      const rootName = root.name.toLowerCase();
      if (isExpense) {
        return (
          rootName.includes("expense") ||
          rootName.includes("chi") ||
          rootName.includes("tiêu") ||
          (!rootName.includes("income") && !rootName.includes("thu") && !rootName.includes("lương"))
        );
      }
      if (isIncome) {
        return (
          rootName.includes("income") ||
          rootName.includes("thu") ||
          rootName.includes("lương") ||
          rootName.includes("thưởng") ||
          rootName.includes("lãi")
        );
      }
      return true;
    });
  }, [activeCategories, eventType]);

  // Find root groups (either parent_id == null or direct children of generic "Expenses"/"Income")
  const { topLevelGroups, childrenMap } = useMemo(() => {
    const byParent = new Map<number, Category[]>();
    const roots: Category[] = [];

    // Identify if there is a single generic root like "Expenses" or "Income"
    const genericRoots = scopedCategories.filter(
      (c) =>
        c.parent_id === null &&
        (c.name.toLowerCase() === "expenses" ||
          c.name.toLowerCase() === "income" ||
          c.name.toLowerCase() === "chi tiêu" ||
          c.name.toLowerCase() === "thu nhập")
    );

    const genericRootIds = new Set(genericRoots.map((r) => r.id));

    for (const cat of scopedCategories) {
      if (cat.parent_id !== null) {
        const existing = byParent.get(cat.parent_id) || [];
        existing.push(cat);
        byParent.set(cat.parent_id, existing);
      }
    }

    if (genericRoots.length > 0) {
      for (const gr of genericRoots) {
        const directChildren = byParent.get(gr.id) || [];
        roots.push(...directChildren);
      }
    } else {
      roots.push(...scopedCategories.filter((c) => c.parent_id === null));
    }

    return { topLevelGroups: roots, childrenMap: byParent };
  }, [scopedCategories]);

  // Initialize all top level groups as expanded on first load
  React.useEffect(() => {
    if (visible && expandedIds.size === 0 && topLevelGroups.length > 0) {
      setExpandedIds(new Set(topLevelGroups.map((g) => g.id)));
    }
  }, [visible, topLevelGroups]);

  const toggleExpand = (groupId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (expandedIds.size > 0) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(topLevelGroups.map((g) => g.id)));
    }
  };

  // Filter based on search query
  const query = searchQuery.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!query) return topLevelGroups;

    return topLevelGroups.filter((group) => {
      const groupMatch = group.name.toLowerCase().includes(query);
      const children = childrenMap.get(group.id) || [];
      const hasChildMatch = children.some((c) => {
        const directMatch = c.name.toLowerCase().includes(query);
        const subChildren = childrenMap.get(c.id) || [];
        const subMatch = subChildren.some((sc) => sc.name.toLowerCase().includes(query));
        return directMatch || subMatch;
      });
      return groupMatch || hasChildMatch;
    });
  }, [topLevelGroups, childrenMap, query]);

  const renderCategoryNode = (cat: Category, level: number = 0) => {
    const children = childrenMap.get(cat.id) || [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(cat.id) || query.length > 0;
    const isSelected = selectedCategoryId === cat.id;

    // Filter children if search query is present
    const visibleChildren = query
      ? children.filter((c) => {
          const directMatch = c.name.toLowerCase().includes(query);
          const subChildren = childrenMap.get(c.id) || [];
          const subMatch = subChildren.some((sc) => sc.name.toLowerCase().includes(query));
          return directMatch || subMatch || cat.name.toLowerCase().includes(query);
        })
      : children;

    return (
      <View key={cat.id} style={styles.nodeContainer}>
        {/* Category Row */}
        <TouchableOpacity
          style={[
            styles.categoryRow,
            level > 0 && { paddingLeft: 12 + level * 20 },
            isSelected && styles.categoryRowSelected,
          ]}
          onPress={() => {
            onSelect(cat.id);
            onClose();
          }}
          activeOpacity={0.7}
        >
          {/* Chevron for expand/collapse */}
          {hasChildren ? (
            <TouchableOpacity
              style={styles.expandChevronBtn}
              onPress={() => toggleExpand(cat.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={isExpanded ? "chevron-down" : "chevron-forward"}
                size={18}
                color="#64748b"
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.expandPlaceholder} />
          )}

          {/* Icon Badge */}
          <View
            style={[
              styles.iconCircle,
              level === 0 ? styles.iconCircleRoot : styles.iconCircleChild,
              isSelected && { backgroundColor: "rgba(22, 163, 74, 0.15)" },
            ]}
          >
            <Ionicons
              name={(cat.icon as any) || (level === 0 ? "folder-outline" : "pricetag-outline")}
              size={level === 0 ? 18 : 15}
              color={isSelected ? "#16a34a" : level === 0 ? "#16a34a" : "#64748b"}
            />
          </View>

          {/* Name & Count */}
          <View style={styles.nameContainer}>
            <Text
              style={[
                styles.categoryName,
                level === 0 && styles.categoryNameRoot,
                isSelected && styles.categoryNameSelected,
              ]}
              numberOfLines={1}
            >
              {cat.name}
            </Text>
            {hasChildren && level === 0 && (
              <Text style={styles.childCountBadge}>({children.length})</Text>
            )}
          </View>

          {/* Selected Checkmark */}
          {isSelected && (
            <Ionicons name="checkmark-circle" size={20} color="#16a34a" style={{ marginLeft: 8 }} />
          )}
        </TouchableOpacity>

        {/* Children Rows */}
        {hasChildren && isExpanded && (
          <View style={styles.childrenContainer}>
            {visibleChildren.map((child) => renderCategoryNode(child, level + 1))}
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {eventType === "EXPENSE" ? "Chọn nhóm chi tiêu" : "Chọn nhóm thu nhập"}
            </Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Search Bar & Expand/Collapse All Button */}
          <View style={styles.searchSection}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={18} color="#94a3b8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder={eventType === "EXPENSE" ? "Tìm kiếm nhóm chi tiêu..." : "Tìm kiếm nhóm thu nhập..."}
                placeholderTextColor="#94a3b8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="while-editing"
                autoCapitalize="none"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Ionicons name="close-circle" size={18} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity style={styles.toggleAllBtn} onPress={toggleAll}>
              <Ionicons
                name={expandedIds.size > 0 ? "contract-outline" : "expand-outline"}
                size={16}
                color="#16a34a"
              />
              <Text style={styles.toggleAllText}>
                {expandedIds.size > 0 ? "Thu gọn" : "Mở tất cả"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Categories Tree List */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
          >
            {filteredGroups.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="search-outline" size={36} color="#cbd5e1" />
                <Text style={styles.emptyText}>Không tìm thấy danh mục phù hợp</Text>
              </View>
            ) : (
              filteredGroups.map((group) => renderCategoryNode(group, 0))
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: "85%",
    flexDirection: "column",
    paddingTop: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
  },
  closeBtn: {
    padding: 4,
  },
  searchSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#0f172a",
    padding: 0,
  },
  toggleAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 4,
  },
  toggleAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#16a34a",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  nodeContainer: {
    marginBottom: 2,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  categoryRowSelected: {
    backgroundColor: "#f0fdf4",
  },
  expandChevronBtn: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  expandPlaceholder: {
    width: 24,
    marginRight: 4,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  iconCircleRoot: {
    backgroundColor: "rgba(22, 163, 74, 0.12)",
  },
  iconCircleChild: {
    backgroundColor: "#f1f5f9",
  },
  nameContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  categoryName: {
    fontSize: 15,
    color: "#334155",
    fontWeight: "500",
  },
  categoryNameRoot: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  categoryNameSelected: {
    color: "#16a34a",
    fontWeight: "700",
  },
  childCountBadge: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "600",
  },
  childrenContainer: {
    position: "relative",
  },
  emptyBox: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    marginTop: 10,
    fontSize: 14,
    color: "#94a3b8",
  },
});
