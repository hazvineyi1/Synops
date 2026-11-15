/**
 * Hub mode, read once at start-up. The server injects <meta name="praxis-hub" content="mrb"> into
 * index.html when the deployment runs with HUB_MODE=mrb (the MRB Practice Hub at its own address).
 * In local dev, VITE_HUB_MODE=mrb gives the same result without the API server serving the shell.
 * Empty string = ordinary multi-tenant Praxis.
 */
function readHub(): string {
  if (typeof document !== 'undefined') {
    const v = document.querySelector('meta[name="praxis-hub"]')?.getAttribute('content')?.trim().toLowerCase();
    if (v) return v;
  }
  return String(import.meta.env.VITE_HUB_MODE ?? '').trim().toLowerCase();
}

export const HUB: string = readHub();
export const isMrbHub = HUB === 'mrb';
