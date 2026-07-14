import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const mediaFilesTable = pgTable("media_files", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  courseId: text("course_id"),
  uploaderId: text("uploader_id").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes"),
  folder: text("folder"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MediaFile = typeof mediaFilesTable.$inferSelect;
