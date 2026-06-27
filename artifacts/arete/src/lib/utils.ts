import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Strip markdown formatting and em/en dashes from coach-generated text so it
// renders as plain prose. Applies to both newly generated text and any older
// text already stored with markdown.
export function sanitizeCoachText(text: string | null | undefined): string {
  if (!text) return ""
  return text
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*\*\s+/gm, "- ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\*/g, "")
}
