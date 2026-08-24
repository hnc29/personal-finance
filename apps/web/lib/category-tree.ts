import type { Category, EventType } from "./api";

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
