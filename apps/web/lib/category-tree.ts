import type { Category, EventType } from "./api";

export function normalizeCategorySearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();
}

export function filterCategoryTree(categories: Category[], query: string, label: (name: string) => string = x => x): Category[] {
  const q = normalizeCategorySearch(query);
  if (!q) return categories;
  const keep = new Set<number>();
  for (const c of categories) {
    if (normalizeCategorySearch(`${c.name} ${label(c.name)}`).includes(q)) {
      let current: Category | undefined = c;
      while (current) { keep.add(current.id); current = current.parent_id == null ? undefined : categories.find(x => x.id === current!.parent_id); }
    }
  }
  return categories.filter(c => keep.has(c.id));
}

export type CategoryTreeNode = Category & { children: CategoryTreeNode[]; orphan?: boolean };

export function buildCategoryTree(categories: Category[]): CategoryTreeNode[] {
  const byId = new Map(categories.map(c => [c.id, { ...c, children: [] as CategoryTreeNode[] } as CategoryTreeNode]));
  const roots: CategoryTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id == null) roots.push(node);
    else {
      const parent = byId.get(node.parent_id);
      if (parent) parent.children.push(node);
      else { node.orphan = true; roots.push(node); }
    }
  }
  const sort = (items: CategoryTreeNode[]) => { items.sort((a, b) => a.id - b.id); items.forEach(x => sort(x.children)); };
  sort(roots);
  return roots;
}

export function getDescendantIds(id: number, categories: Category[]): Set<number> {
  const result = new Set<number>();
  const children = new Map<number, number[]>();
  categories.forEach(c => { if (c.parent_id != null) children.set(c.parent_id, [...(children.get(c.parent_id) ?? []), c.id]); });
  const visit = (current: number) => { for (const child of children.get(current) ?? []) { if (!result.has(child)) { result.add(child); visit(child); } } };
  visit(id); return result;
}

export function getCategoryDepth(id: number, categories: Category[]): number {
  const byId = new Map(categories.map(c => [c.id, c])); let current = byId.get(id); let depth = 1; const seen = new Set<number>();
  while (current?.parent_id != null && !seen.has(current.id)) { seen.add(current.id); depth++; current = byId.get(current.parent_id); }
  return depth;
}

export function canMoveCategory(id: number, parentId: number | null, categories: Category[]): boolean {
  if (parentId === id) return false;
  if (parentId != null && getDescendantIds(id, categories).has(parentId)) return false;
  const subtree = new Set([id, ...getDescendantIds(id, categories)]);
  const parentDepth = parentId == null ? 0 : getCategoryDepth(parentId, categories);
  return [...subtree].every(nodeId => parentDepth + (getCategoryDepth(nodeId, categories) - getCategoryDepth(id, categories)) + 1 <= 3);
}

export function getParentOptions(categories: Category[], editingId?: number, label: (name: string) => string = x => x): { id: number; label: string }[] {
  const byId = new Map(categories.map(c => [c.id, c]));
  return categories.filter(c => c.id !== editingId && (!editingId || !getDescendantIds(editingId, categories).has(c.id)) && getCategoryDepth(c.id, categories) < 3)
    .map(c => { const names: string[] = []; let current: Category | undefined = c; const seen = new Set<number>(); while (current && !seen.has(current.id)) { seen.add(current.id); names.unshift(label(current.name)); current = current.parent_id == null ? undefined : byId.get(current.parent_id); } return { id: c.id, label: names.join(" › ") }; });
}

export function toggleCategoryExpansion(expanded: Set<number>, id: number): Set<number> {
  const next = new Set(expanded);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function categoryRoot(category: Category, categories: Category[]): Category | undefined {
  let current: Category | undefined = category;
  const seen = new Set<number>();
  while (current?.parent_id != null && !seen.has(current.id)) {
    seen.add(current.id);
    current = categories.find(item => item.id === current?.parent_id);
  }
  return current;
}

export function categoryDepth(category: Category, categories: Category[]): number {
  let depth = 0;
  let current: Category | undefined = category;
  const seen = new Set<number>();
  while (current?.parent_id != null && depth < 2 && !seen.has(current.id)) {
    seen.add(current.id);
    depth += 1;
    current = categories.find(item => item.id === current?.parent_id);
  }
  return depth;
}

export function categoriesForEventType(type: EventType, categories: Category[]): Category[] {
  const roots = type === "EXPENSE" ? ["Expenses"] : type === "INCOME" || type === "INTEREST" ? ["Income"] : type === "ADJUSTMENT" ? ["Expenses", "Income"] : [];
  if (!roots.length) return [];
  return categories.filter(category => {
    const root = categoryRoot(category, categories);
    return root != null && roots.includes(root.name);
  });
}

export function categoryIsValidForEventType(type: EventType, categoryId: string, categories: Category[]): boolean {
  return categoryId !== "" && categoriesForEventType(type, categories).some(category => String(category.id) === categoryId);
}

export function categoryIcon(name: string): string {
  const icons: Record<string, string> = { Expenses: "↘", Income: "↗", "Food & Drinks": "◉", Groceries: "▦", Salary: "₫", Interest: "%", Transportation: "→", Shopping: "□" };
  return icons[name] ?? "•";
}
