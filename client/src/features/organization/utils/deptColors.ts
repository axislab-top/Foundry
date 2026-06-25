export type DeptColorPalette = {
  color: string;
  colorBg: string;
  colorBorder: string;
  colorLight: string;
};

const DEFAULT_PALETTE: DeptColorPalette = {
  color: "#64748b",
  colorBg: "#f8fafc",
  colorBorder: "#cbd5e1",
  colorLight: "#f1f5f9",
};

const SLUG_PALETTES: Record<string, DeptColorPalette> = {
  marketing: { color: "#3b82f6", colorBg: "#eff6ff", colorBorder: "#93c5fd", colorLight: "#dbeafe" },
  operations: { color: "#10b981", colorBg: "#ecfdf5", colorBorder: "#6ee7b7", colorLight: "#d1fae5" },
  engineering: { color: "#8b5cf6", colorBg: "#f5f3ff", colorBorder: "#c4b5fd", colorLight: "#ede9fe" },
  tech: { color: "#8b5cf6", colorBg: "#f5f3ff", colorBorder: "#c4b5fd", colorLight: "#ede9fe" },
  finance: { color: "#f59e0b", colorBg: "#fffbeb", colorBorder: "#fcd34d", colorLight: "#fef3c7" },
  product: { color: "#ec4899", colorBg: "#fdf2f8", colorBorder: "#f9a8d4", colorLight: "#fce7f3" },
  people: { color: "#06b6d4", colorBg: "#ecfeff", colorBorder: "#67e8f9", colorLight: "#cffafe" },
  sales: { color: "#6366f1", colorBg: "#eef2ff", colorBorder: "#a5b4fc", colorLight: "#e0e7ff" },
  "customer-success": { color: "#14b8a6", colorBg: "#f0fdfa", colorBorder: "#5eead4", colorLight: "#ccfbf1" },
};

const SLUG_NAME_EN: Record<string, string> = {
  marketing: "Marketing",
  operations: "Operations",
  engineering: "Engineering",
  tech: "Engineering",
  finance: "Finance",
  product: "Product",
  people: "People",
  sales: "Sales",
  "customer-success": "Customer Success",
};

export function getDeptColors(slug: string): DeptColorPalette {
  return SLUG_PALETTES[slug] ?? DEFAULT_PALETTE;
}

export function getDeptNameEn(slug: string): string {
  if (SLUG_NAME_EN[slug]) return SLUG_NAME_EN[slug];
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
