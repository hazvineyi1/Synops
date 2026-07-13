import { toast } from "@/hooks/use-toast";

/**
 * Error notifications.
 *
 * NEVER use window.alert() in this app. A native alert() blocks the browser's
 * renderer thread: the entire tab freezes until the dialog is dismissed, and the
 * page stops responding to anything. That is not a hypothetical -- when the tutor
 * failed to start a session it called alert(), the tab locked up, and the bug was
 * reported (and investigated) for a long time as "the Socratic coach hangs". It was
 * never hanging; it was showing a modal nobody could see.
 *
 * toast() renders in-page, never blocks, and stacks. Use these helpers instead.
 */

export function notifyError(message?: string, fallback = "Something went wrong. Please try again.") {
  toast({
    title: "Something went wrong",
    description: message || fallback,
    variant: "destructive",
  });
}

export function notifySuccess(message: string, title = "Done") {
  toast({ title, description: message });
}
