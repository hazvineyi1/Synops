// Allowed product keys, mirrored from the OpenAPI `ProductKey` enum. The server
// must never trust an arbitrary product slug from the client.
export const PRODUCT_KEYS = ["compass"] as const;

export type ProductKey = (typeof PRODUCT_KEYS)[number];

export function isProductKey(value: unknown): value is ProductKey {
  return typeof value === "string" && (PRODUCT_KEYS as readonly string[]).includes(value);
}

// Products that offer public self-service registration. Compass (Curriculum
// Builder) is sold self-serve: a visitor can start a free trial, which creates
// a new school organization plus a school_admin user bound to it. The server
// still forces the product key, role, and tenant server-side; it never trusts a
// client-supplied product key, role, or organization id.
export const SELF_SERVICE_PRODUCT_KEYS = ["compass"] as const;

export function isSelfServiceProductKey(value: ProductKey): boolean {
  return (SELF_SERVICE_PRODUCT_KEYS as readonly string[]).includes(value);
}
