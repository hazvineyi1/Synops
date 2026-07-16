import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * A reusable tutor face saved to a library. Instructional designers upload a photorealistic
 * (or any) portrait once, name it, and reuse it across cases; figures are deletable.
 * organisationId null = shared platform library; otherwise scoped to the author's tenant.
 */
export const tutorFiguresTable = pgTable("tutor_figures", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organisationId: text("organisation_id"),
  createdBy: text("created_by").notNull(),
  name: text("name").notNull(),
  /** A resized data URL (data:image/...) or an https image URL. */
  image: text("image").notNull(),
  gender: text("gender", { enum: ["female", "male"] }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TutorFigure = typeof tutorFiguresTable.$inferSelect;
