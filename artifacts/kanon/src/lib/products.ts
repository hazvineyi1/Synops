import { Compass as CompassIcon, type LucideIcon } from "lucide-react";

export type ProductVertical = "Education" | "Healthcare" | "Project Management";

export interface Product {
  /** URL slug and DB product_key. */
  key: string;
  /** Short brand name, e.g. "Kanon". */
  name: string;
  /** Descriptive title, e.g. "Curriculum Builder". */
  title: string;
  vertical: ProductVertical;
  /** One-sentence description for the public portals directory. */
  blurb: string;
  /** Marketing line shown on the branded login side panel. */
  panelLine: string;
  /** Brand accent color (hex). Chosen dark enough for white text (WCAG AA). */
  accent: string;
  icon: LucideIcon;
  /** Whether self-service registration is offered for this product. */
  hasRegister: boolean;
}

export const PRODUCTS: Product[] = [
  {
    key: "compass",
    name: "Kanon",
    title: "Curriculum Builder",
    vertical: "Education",
    blurb:
      "Standards-aligned course and curriculum generation with a built-in accessibility QA checker.",
    panelLine:
      "Design standards-aligned curriculum with quality and accessibility checks built into every step.",
    accent: "#1d4ed8",
    icon: CompassIcon,
    hasRegister: true,
  },
];

export const PRODUCT_MAP: Record<string, Product> = Object.fromEntries(
  PRODUCTS.map((p) => [p.key, p]),
);

export function getProduct(key?: string | null): Product | undefined {
  if (!key) return undefined;
  return PRODUCT_MAP[key];
}
