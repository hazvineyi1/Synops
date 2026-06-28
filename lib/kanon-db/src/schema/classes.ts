import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * A class/section sits under a course and is the most granular allocation target.
 * Tenancy is inherited through course -> project -> client.organization_id.
 */
export const classesTable = pgTable("classes", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  name: text("name").notNull(),
  section: text("section"),
  term: text("term"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClassSchema = createInsertSchema(classesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertClass = z.infer<typeof insertClassSchema>;
export type ClassRow = typeof classesTable.$inferSelect;

/**
 * Class roster membership: links existing org staff (school_admin or builder)
 * to a class. Uniqueness on (classId, userId) prevents duplicate entries.
 * Tenancy is inherited from the class.
 */
export const classMembershipsTable = pgTable(
  "class_memberships",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id").notNull(),
    userId: integer("user_id").notNull(),
    addedByUserId: integer("added_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("class_memberships_class_user_unique").on(t.classId, t.userId),
  ],
);

export const insertClassMembershipSchema = createInsertSchema(classMembershipsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertClassMembership = z.infer<typeof insertClassMembershipSchema>;
export type ClassMembershipRow = typeof classMembershipsTable.$inferSelect;
