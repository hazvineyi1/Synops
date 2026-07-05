import { useEffect } from "react";

const SITE_NAME = "Synops Consulting Group";

/**
 * Sets the document title and meta description for a route. Restores nothing on
 * unmount. Each page sets its own values on mount.
 */
export function usePageMeta(title: string, description?: string): void {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE_NAME}` : SITE_NAME;

    if (description) {
      let tag = document.querySelector('meta[name="description"]');
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", "description");
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", description);
    }
  }, [title, description]);
}
