import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Renders an author-supplied interactive HTML activity inside a hardened sandbox and
 * relays its result back to the parent.
 *
 * SECURITY MODEL (do not weaken):
 *  - The HTML is UNTRUSTED author content. It runs with sandbox="allow-scripts" and
 *    WITHOUT allow-same-origin, so the iframe is a unique opaque origin: it cannot read
 *    the parent's cookies, localStorage, or DOM, and cannot make same-origin/credentialed
 *    requests as the user. Never add allow-same-origin here.
 *  - The activity reports its result by calling window.SynopsActivity.submit(...), which
 *    postMessages to the parent. The PARENT (this component's host) is the only party
 *    holding the session cookie, and it is what calls the authenticated submit endpoint.
 *    The activity can therefore hand work in, but can never act as the user.
 *  - We accept a message only if it came from THIS iframe's contentWindow and carries our
 *    marker. Origin is "null" for a sandboxed srcdoc, so we authenticate by source, not
 *    origin.
 */

export interface ActivityPlayerHandleResult {
  payload: unknown;
  score: number | null;
}

interface Props {
  html: string;
  /** Called when the activity hands in a result. */
  onSubmit?: (result: ActivityPlayerHandleResult) => void;
  /** Preview mode: still renders + relays, but the host may ignore submissions. */
  disabled?: boolean;
  className?: string;
}

// The bridge injected into the iframe <head>, defined before any author script runs.
const BRIDGE = `
<script>
(function(){
  function post(msg){ try { parent.postMessage(Object.assign({__synops:true}, msg), '*'); } catch(e){} }
  window.SynopsActivity = {
    // submit(payload, score?) — hand the result in.
    submit: function(payload, score){
      post({ type:'submit', payload: (payload==null?{}:payload), score: (score==null?null:Number(score)) });
    },
    // resize(px) — optional; ask the host to fit the iframe to the content.
    resize: function(px){ post({ type:'resize', height: Number(px)||0 }); }
  };
  window.addEventListener('load', function(){
    try { window.SynopsActivity.resize(document.documentElement.scrollHeight); } catch(e){}
  });
  // Re-report height on any DOM change so growing activities aren't clipped.
  try {
    var ro = new ResizeObserver(function(){ window.SynopsActivity.resize(document.documentElement.scrollHeight); });
    window.addEventListener('load', function(){ ro.observe(document.documentElement); });
  } catch(e){}
})();
<\/script>`;

const BASE_STYLES = `
<style>
  :root { color-scheme: light; }
  html, body { margin:0; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:#0f172a; background:#ffffff; padding:20px; line-height:1.5; }
  button { font: inherit; cursor: pointer; }
</style>`;

function buildDoc(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${BASE_STYLES}${BRIDGE}</head><body>${html}</body></html>`;
}

export function ActivityPlayer({ html, onSubmit, disabled, className }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(480);
  const doc = useMemo(() => buildDoc(html), [html]);

  useEffect(() => {
    function handle(e: MessageEvent) {
      // Authenticate by source: only messages from OUR iframe are trusted.
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const data = e.data;
      if (!data || data.__synops !== true) return;

      if (data.type === "resize" && typeof data.height === "number" && data.height > 0) {
        // Clamp so a malicious/broken activity can't blow the layout to millions of px.
        setHeight(Math.min(Math.max(data.height + 24, 240), 4000));
        return;
      }
      if (data.type === "submit" && !disabled) {
        onSubmit?.({ payload: data.payload ?? {}, score: typeof data.score === "number" ? data.score : null });
      }
    }
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [onSubmit, disabled]);

  return (
    <iframe
      ref={iframeRef}
      title="Interactive activity"
      srcDoc={doc}
      // allow-scripts ONLY. No allow-same-origin -> opaque origin, no access to parent.
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className={className ?? "w-full rounded-lg border border-border bg-white"}
      style={{ height }}
    />
  );
}
