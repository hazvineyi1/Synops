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
  /**
   * External embed URL (source="embed"). When set, we render a normal cross-origin iframe to
   * that URL instead of the sandboxed srcdoc, third-party embeds (Genially, Google Forms,
   * YouTube, H5P) need to run on their OWN origin. There is no results bridge for these.
   */
  embedUrl?: string | null;
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
    // submit(payload, score?), hand the result in.
    submit: function(payload, score){
      post({ type:'submit', payload: (payload==null?{}:payload), score: (score==null?null:Number(score)) });
    },
    // resize(px), optional; ask the host to fit the iframe to the content.
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
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:#0f172a; background:#ffffff; padding:12px 14px; line-height:1.45; }
  body > *:last-child { margin-bottom:0 !important; }
  button { font: inherit; cursor: pointer; }
</style>`;

// Compact overrides applied AFTER the activity's own baked-in <style>, so they win (later wins) and
// tighten EXISTING activities too — the templates' CSS is baked into stored HTML at generation time,
// so changing the template alone never updates activities that were already created. Uses the full
// iframe width (max-width:100%) so matching/columns get wider → fewer wrapped lines → less scrolling.
const OVERRIDE_STYLES = `
<style>
  .ax{max-width:100%!important}
  .ax-q{font-size:16px!important;margin:6px 0 8px!important}
  .ax-btn{font-size:14px!important;line-height:1.35!important;padding:7px 10px!important;margin:5px 0!important}
  .ax-card{padding:18px 16px!important;min-height:84px!important;font-size:17px!important}
  .ax-cols{gap:12px!important}
  .ax-bucket{min-height:56px!important}
  .ax-inst{margin:0 0 8px!important}
</style>`;

function buildDoc(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${BASE_STYLES}${BRIDGE}</head><body>${html}${OVERRIDE_STYLES}</body></html>`;
}

export function ActivityPlayer({ html, embedUrl, onSubmit, disabled, className }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(320);
  const doc = useMemo(() => buildDoc(html), [html]);

  useEffect(() => {
    if (embedUrl) return; // external embeds have no results bridge
    function handle(e: MessageEvent) {
      // Authenticate by source: only messages from OUR iframe are trusted.
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const data = e.data;
      if (!data) return;
      // Accept the injected bridge protocol (__synops) AND a legacy { type:'activity_result' } that
      // some authored activities post directly. Source is already authenticated above.
      if (data.type === "activity_result") {
        if (!disabled) onSubmit?.({ payload: data.payload ?? {}, score: typeof data.score === "number" ? data.score : null });
        return;
      }
      if (data.__synops !== true) return;

      if (data.type === "resize" && typeof data.height === "number" && data.height > 0) {
        // Fit the content tightly (small buffer). Clamp so a broken activity can't blow the layout.
        setHeight(Math.min(Math.max(data.height + 8, 160), 4000));
        return;
      }
      if (data.type === "submit" && !disabled) {
        onSubmit?.({ payload: data.payload ?? {}, score: typeof data.score === "number" ? data.score : null });
      }
    }
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [onSubmit, disabled, embedUrl]);

  // External embed: cross-origin iframe to the third-party origin (no results bridge).
  if (embedUrl) {
    return (
      <iframe
        title="Embedded activity"
        src={embedUrl}
        // The URL runs on ITS OWN origin (not Praxis), so allow-same-origin here is safe and
        // required for most embeds to function. It can never touch the Praxis parent.
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation allow-popups-to-escape-sandbox"
        allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="no-referrer"
        className={className ?? "w-full rounded-lg border border-border bg-white"}
        style={{ height: 600 }}
      />
    );
  }

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
