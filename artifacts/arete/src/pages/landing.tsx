import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useT, LanguageSwitcher } from "../lib/i18n";

export default function Landing() {
  const { t } = useT();
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-sans">
      <header className="py-4 md:py-6 px-4 md:px-12 flex justify-between items-center border-b border-border/40 gap-3">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <img src="/logo.svg" alt="Arete" className="w-7 h-7 md:w-8 md:h-8 rounded flex-shrink-0" />
          <span className="font-serif font-semibold text-lg md:text-xl tracking-tight text-primary truncate">Arete</span>
          <span className="hidden sm:inline font-sans text-xs text-muted-foreground/70 flex-shrink-0" aria-label="Arete is pronounced AR-uh-tay">/AR-uh-tay/</span>
        </div>
        <div className="flex gap-2 md:gap-4 items-center flex-shrink-0">
          <LanguageSwitcher />
          <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            {t("landing.signin")}
          </Link>
          <Button asChild size="sm">
            <Link href="/sign-up">
              <span className="hidden sm:inline">{t("landing.startCoaching")}</span>
              <span className="sm:hidden">{t("landing.start")}</span>
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 md:px-6 py-12 md:py-24 text-center">
        <h1 className="font-serif text-4xl sm:text-5xl md:text-7xl max-w-4xl leading-[1.1] tracking-tight text-primary mb-4 md:mb-6">
          {t("landing.heroTitle")}
        </h1>
        <p className="text-base md:text-xl text-muted-foreground max-w-2xl mb-8 md:mb-12 leading-relaxed">
          {t("landing.heroSubtitle")}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 max-w-5xl w-full mb-10 md:mb-16 text-left">
          <PersonalityCard
            title={t("landing.p.drill.title")}
            description={t("landing.p.drill.desc")}
            color="bg-destructive/10 text-destructive border-destructive/20"
          />
          <PersonalityCard
            title={t("landing.p.socratic.title")}
            description={t("landing.p.socratic.desc")}
            color="bg-chart-4/10 text-chart-4 border-chart-4/20"
          />
          <PersonalityCard
            title={t("landing.p.warm.title")}
            description={t("landing.p.warm.desc")}
            color="bg-chart-3/10 text-chart-3 border-chart-3/20"
          />
          <PersonalityCard
            title={t("landing.p.analyst.title")}
            description={t("landing.p.analyst.desc")}
            color="bg-primary/10 text-primary border-primary/20"
          />
        </div>

        <Button size="lg" className="text-base md:text-lg px-8 md:px-12 h-12 md:h-14 rounded-full w-full sm:w-auto" asChild>
          <Link href="/sign-up">{t("landing.cta")}</Link>
        </Button>
      </main>

      <footer className="border-t border-border/40 px-4 md:px-12 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>© {new Date().getFullYear()} Arete <span className="text-muted-foreground/60">&middot; say &ldquo;AR-uh-tay&rdquo;</span></span>
        <nav className="flex gap-5">
          <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
        </nav>
      </footer>
    </div>
  );
}

function PersonalityCard({ title, description, color }: { title: string, description: string, color: string }) {
  return (
    <div className={`p-6 rounded-xl border ${color}`}>
      <h3 className="font-serif font-medium text-lg mb-2">{title}</h3>
      <p className="text-sm opacity-90 leading-relaxed">{description}</p>
    </div>
  );
}
