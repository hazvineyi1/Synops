import { pgTable, text, serial, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  title: text("title").notNull(),
  stage: integer("stage").notNull().default(0),
  status: text("status").notNull().default("active"),
  tier: text("tier"),
  modality: text("modality"),
  lms: text("lms"),
  designMethod: text("design_method"),
  description: text("description"),
  // Whether this is a brand-new course build or a redesign of an existing course.
  courseType: text("course_type").notNull().default("new_build"),
  // Standard course identifier (e.g. SBS210, BUS301) for search/reporting.
  courseCode: text("course_code"),
  // For revamps: link to the existing shell + what is changing and why.
  revampNotes: text("revamp_notes"),
  targetDeliveryDate: date("target_delivery_date", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
