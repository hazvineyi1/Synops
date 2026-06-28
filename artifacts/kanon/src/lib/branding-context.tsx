import { createContext, useContext, useEffect, type ReactNode } from "react";
import {
  useGetBranding,
  getGetBrandingQueryKey,
  type BrandingOrganization,
} from "@workspace/kanon-api-client";

interface BrandingContextValue {
  isBranded: boolean;
  organization: BrandingOrganization | null;
}

const BrandingContext = createContext<BrandingContextValue>({
  isBranded: false,
  organization: null,
});

/**
 * Resolves white-label branding for the current host. The server performs the
 * lookup against the request host only and returns a neutral response when the
 * host does not match a configured organization domain. The host never
 * authorizes anything; this only affects presentation. When a host is branded
 * the organization accent is exposed as the `--brand-accent` CSS variable.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const { data } = useGetBranding({
    query: {
      queryKey: getGetBrandingQueryKey(),
      // Short staleTime so a downgrade-driven branding revocation reaches an
      // already-open session within ~1 minute (branding is cosmetic, never auth).
      staleTime: 60_000,
      retry: false,
    },
  });

  const organization = data?.branded ? data.organization : null;
  const accent = organization?.accentColor ?? null;

  useEffect(() => {
    const root = document.documentElement;
    if (accent) {
      root.style.setProperty("--brand-accent", accent);
    } else {
      root.style.removeProperty("--brand-accent");
    }
    return () => {
      root.style.removeProperty("--brand-accent");
    };
  }, [accent]);

  return (
    <BrandingContext.Provider value={{ isBranded: Boolean(data?.branded), organization }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}
