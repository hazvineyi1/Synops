import { useLocation } from "wouter";
import { useStudyAuth } from "@/hooks/use-study-auth";
import {
  LayoutDashboard, BookOpen, TrendingUp,
  LogOut, User, ChevronDown, RotateCcw,
  MessageCircle, Gift, Target, FileText, ShieldCheck,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

// Primary destinations, always visible in the top bar so every core area of the
// Coach is one tap away. Secondary items (tutor chat, account, ambassador, restart)
// live in the profile dropdown.
type NavTab = { href: string; label: string; icon: typeof LayoutDashboard; match?: string[] };
const TABS: NavTab[] = [
  { href: "/coach", label: "Today", icon: LayoutDashboard },
  { href: "/materials", label: "Materials", icon: BookOpen, match: ["/materials"] },
  { href: "/practice", label: "Practice", icon: Target, match: ["/practice"] },
  { href: "/exams", label: "Exams", icon: FileText, match: ["/exams"] },
  { href: "/tutor", label: "Tutor", icon: MessageCircle, match: ["/tutor"] },
  { href: "/progress", label: "Progress", icon: TrendingUp },
];

export default function StudyNav() {
  const [loc, setLoc] = useLocation();
  const { user, logout } = useStudyAuth();

  const isActive = (tab: typeof TABS[number]) => {
    if (tab.match) return tab.match.some((m) => loc === m || loc.startsWith(m + "/"));
    return loc === tab.href;
  };

  const initials = (user?.name || user?.email || "?").slice(0, 1).toUpperCase();

  return (
    <nav className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 h-12 flex items-center gap-1">
        <button
          onClick={() => setLoc("/coach")}
          className="font-semibold text-sm mr-2 sm:mr-4 shrink-0 hover:opacity-80"
        >
          Synops Coach
        </button>
        <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto scrollbar-none flex-1">
          {TABS.map((t) => {
            const active = isActive(t);
            const Icon = t.icon;
            return (
              <button
                key={t.href}
                onClick={() => setLoc(t.href)}
                className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 h-8 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1.5 h-8 px-2 rounded-md text-xs font-medium hover:bg-muted/60">
              <span className="h-6 w-6 rounded-full bg-primary/15 text-primary inline-flex items-center justify-center text-[11px] font-semibold">
                {initials}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs">
                <div className="font-medium truncate">{user?.name || "Learner"}</div>
                <div className="text-muted-foreground truncate font-normal">{user?.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setLoc("/tutor")}>
                <MessageCircle className="h-3.5 w-3.5 mr-2" /> Synops Coach
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLoc("/start-over")}>
                <RotateCcw className="h-3.5 w-3.5 mr-2" /> Test &amp; start again
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setLoc("/ambassador")}>
                <Gift className="h-3.5 w-3.5 mr-2" /> Ambassador program
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLoc("/profile")}>
                <User className="h-3.5 w-3.5 mr-2" /> Account settings
              </DropdownMenuItem>
              {/* Admins had no entry point in the learner app: you had to know to type
                  /study/admin. An admin who lands on the student dashboard and sees no
                  admin link reasonably concludes they are not an admin. */}
              {user?.isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setLoc("/admin")}>
                    <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Admin console
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()}>
                <LogOut className="h-3.5 w-3.5 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}
