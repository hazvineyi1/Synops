import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tenantTypeEnum = pgEnum("tenant_type", [
  "platform",
  "partner",
  "organisation",
]);

export const brandThemesTable = pgTable("brand_themes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull(),
  tenantType: tenantTypeEnum("tenant_type").notNull(),
  displayName: text("display_name"),
  primaryColor: text("primary_color"),
  secondaryColor: text("secondary_color"),
  accentColor: text("accent_color"),
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  fontFamily: text("font_family"),
  credentialTitle: text("credential_title"),
  emailSenderName: text("email_sender_name"),
  customDomain: text("custom_domain"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBrandThemeSchema = createInsertSchema(brandThemesTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertBrandTheme = z.infer<typeof insertBrandThemeSchema>;
export type BrandTheme = typeof brandThemesTable.$inferSelect;
