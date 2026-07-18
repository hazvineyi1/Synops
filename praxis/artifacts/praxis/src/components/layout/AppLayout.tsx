import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useSession } from '@/context/SessionContext';
import { useBrandTheme } from '@/context/ThemeProvider';
import { DevRoleSwitcher } from '@/components/DevRoleSwitcher';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import {
  LayoutDashboard,
  BookOpen,
  Award,
  PenTool,
  Users,
  Settings,
  LogOut,
  FileText,
  Building,
  Bell,
  Menu,
  X,
  UserCog,
  ShieldCheck,
  Sparkles,
  LifeBuoy,
  Landmark,
  TrendingUp,
  CalendarDays,
  Layers,
  ClipboardList,
  GraduationCap,
  NotebookPen,
  Wallet,
  Palette,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/* ─────────────────────────────────────────────────────────────────────────
 * Sokratify theme: one dark-navy sidebar + warm off-white content across the
 * whole app. The page content keeps the app's light surfaces (cards/text); only
 * the shell chrome is dark, so every role — and the Platform Console — shares one
 * cohesive look.
 * ──────────────────────────────────────────────────────────────────────── */
const SIDEBAR_BG = 'hsl(222 47% 11%)';
const CONTENT_BG = 'hsl(43 30% 97%)';
const HAIRLINE = 'rgba(255,255,255,0.07)';

type NavItem = { label: string; href: string; icon: React.ElementType };
type NavGroup = { heading?: string; items: NavItem[] };

function ShellNavLink({
  item,
  active,
  large,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  large?: boolean;
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const color = active
    ? 'rgba(255,255,255,0.95)'
    : hover
      ? 'rgba(255,255,255,0.82)'
      : 'rgba(255,255,255,0.5)';
  const background = active ? 'rgba(255,255,255,0.10)' : hover ? 'rgba(255,255,255,0.05)' : 'transparent';
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-md font-medium transition-colors ${large ? 'px-4 py-3 text-base' : 'px-3 py-2.5 text-sm'}`}
      style={{ background, color }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <item.icon className={large ? 'h-5 w-5 shrink-0' : 'h-4 w-4 shrink-0'} />
      {item.label}
    </Link>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, loading, signOut } = useSession();
  const { data: brand, isLoading: brandLoading } = useBrandTheme();
  // While the tenant brand is still resolving, show nothing rather than flashing a default brand
  // name; once resolved use the tenant's name, falling back to a neutral product name.
  const brandName = brand?.displayName || (brandLoading ? '' : 'Praxis');
  const brandLogo = brand?.logoUrl || null;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();

  const handleSignOut = () => {
    void signOut();
  };

  const { data: notifCount } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => apiFetch<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 30000,
    enabled: !!user,
  });
  const unreadCount = notifCount?.count ?? 0;

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: CONTENT_BG }}>
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-8 w-32 bg-muted rounded" />
          <div className="h-4 w-48 bg-muted rounded" />
        </div>
      </div>
    );
  }

  const role = user.role;

  const getNavGroups = (): NavGroup[] => {
    if (role === 'learner') {
      // Case studies and Activities are reached by learners inside their modules (assigned
      // as part of the module experience), so they are intentionally NOT top-level nav for
      // learners. Staff still get them as authoring surfaces in their own nav blocks.
      return [{
        items: [
          { label: t('nav.today'), href: '/dashboard', icon: LayoutDashboard },
          { label: t('nav.myCourses'), href: '/courses', icon: BookOpen },
          { label: t('nav.myGrades', 'My grades'), href: '/grades', icon: TrendingUp },
          { label: t('nav.coach', 'Coach'), href: '/coach-hub', icon: GraduationCap },
          { label: t('nav.jotter', 'Jotter'), href: '/jotter', icon: NotebookPen },
          { label: t('nav.mySessions', 'My sessions'), href: '/my-attendance', icon: CalendarDays },
          { label: t('nav.credentials'), href: '/credentials', icon: Award },
          { label: t('nav.help', 'Help'), href: '/support', icon: LifeBuoy },
        ],
      }];
    }

    if (role === 'coach') {
      return [{
        items: [
          { label: t('nav.overview'), href: '/dashboard', icon: LayoutDashboard },
          { label: t('nav.learners'), href: '/coach', icon: Users },
          { label: t('nav.submissions'), href: '/coach/submissions', icon: FileText },
          { label: t('nav.gradebook', 'Gradebook'), href: '/gradebook', icon: ClipboardList },
          { label: t('nav.sessions', 'Sessions'), href: '/delivery', icon: CalendarDays },
          { label: t('nav.cases', 'Case studies'), href: '/cases', icon: Layers },
          { label: t('nav.activities', 'Activities'), href: '/activities', icon: Sparkles },
          { label: t('nav.support', 'Support'), href: '/support', icon: LifeBuoy },
        ],
      }];
    }

    if (role === 'org_admin') {
      return [{
        items: [
          { label: t('nav.overview'), href: '/dashboard', icon: LayoutDashboard },
          { label: t('nav.members'), href: '/org/members', icon: UserCog },
          { label: t('nav.coaching', 'Coaching'), href: '/coaching/sections', icon: Users },
          { label: t('nav.coachingHealth', 'Coaching health'), href: '/coaching/health', icon: TrendingUp },
          { label: t('nav.gradebook', 'Gradebook'), href: '/gradebook', icon: ClipboardList },
          { label: t('nav.sessions', 'Sessions'), href: '/delivery', icon: CalendarDays },
          { label: t('nav.cases', 'Case studies'), href: '/cases', icon: Layers },
          { label: t('nav.activities', 'Activities'), href: '/activities', icon: Sparkles },
          { label: t('nav.compliance', 'Compliance'), href: '/compliance', icon: ShieldCheck },
          { label: t('nav.accreditation', 'Accreditation'), href: '/accreditation', icon: Award },
          { label: t('nav.reports'), href: '/reports', icon: FileText },
          { label: t('nav.support', 'Support'), href: '/support', icon: LifeBuoy },
        ],
      }];
    }

    if (role === 'partner_admin') {
      // Grouped so the Partner Hub (the partner's own admin surface: finance, funders,
      // accounts, branding, audit) is clearly separated from the delivery surfaces it
      // shares with the org tier.
      return [
        { items: [{ label: t('nav.home', 'Home'), href: '/dashboard', icon: LayoutDashboard }] },
        {
          heading: t('nav.groups.partnerHub', 'Partner Hub'),
          items: [
            { label: t('nav.partnerOverview', 'Overview'), href: '/partner', icon: LayoutDashboard },
            { label: t('nav.financialHub', 'Financial Hub'), href: '/partner/finance', icon: Wallet },
            { label: t('nav.fundersHub', 'Funders Hub'), href: '/partner/funders', icon: Landmark },
            { label: t('nav.accountsRoles', 'Accounts & Roles'), href: '/partner/accounts', icon: Users },
            { label: t('nav.branding', 'Branding'), href: '/partner/theme', icon: Palette },
            { label: t('nav.audit', 'Audit & Impersonation'), href: '/partner/audit', icon: ShieldCheck },
          ],
        },
        {
          heading: t('nav.groups.delivery', 'Delivery'),
          items: [
            { label: t('nav.courseCatalog'), href: '/courses', icon: BookOpen },
            { label: t('nav.coaching', 'Coaching'), href: '/coaching/sections', icon: Users },
            { label: t('nav.coachingHealth', 'Coaching health'), href: '/coaching/health', icon: TrendingUp },
            { label: t('nav.gradebook', 'Gradebook'), href: '/gradebook', icon: ClipboardList },
            { label: t('nav.studio'), href: '/studio', icon: PenTool },
            { label: t('nav.cases', 'Case studies'), href: '/cases', icon: Layers },
            { label: t('nav.activities', 'Activities'), href: '/activities', icon: Sparkles },
          ],
        },
        { items: [{ label: t('nav.support', 'Support'), href: '/support', icon: LifeBuoy }] },
      ];
    }

    // Super admin: full access to every surface the other roles have, grouped so
    // the breadth stays scannable (decision: one grouped all-access sidebar).
    if (role === 'super_admin') {
      return [
        { items: [{ label: t('nav.overview'), href: '/dashboard', icon: LayoutDashboard }] },
        {
          heading: t('nav.groups.platform', 'Platform'),
          items: [
            { label: t('nav.platformConsole', 'Platform Console'), href: '/platform', icon: ShieldCheck },
            { label: t('nav.platformSettings', 'Branding'), href: '/partner/theme', icon: Settings },
          ],
        },
        {
          heading: t('nav.groups.partners', 'Partners & Funders'),
          items: [
            { label: t('nav.partners'), href: '/admin/partners', icon: Building },
            { label: t('nav.funders', 'Funders'), href: '/admin/funders', icon: Landmark },
          ],
        },
        {
          heading: t('nav.groups.curriculum', 'Curriculum'),
          items: [
            { label: t('nav.courseCatalog', 'Courses'), href: '/courses', icon: BookOpen },
            { label: t('nav.studio'), href: '/studio', icon: PenTool },
            { label: t('nav.cases', 'Case studies'), href: '/cases', icon: Layers },
            { label: t('nav.activities', 'Activities'), href: '/activities', icon: Sparkles },
          ],
        },
        {
          heading: t('nav.groups.delivery', 'Delivery & Coaching'),
          items: [
            { label: t('nav.sessions', 'Sessions'), href: '/delivery', icon: CalendarDays },
            { label: t('nav.learners', 'Coaching'), href: '/coach', icon: Users },
            { label: t('nav.coachingSections', 'Sections'), href: '/coaching/sections', icon: UserCog },
            { label: t('nav.coachingHealth', 'Coaching health'), href: '/coaching/health', icon: TrendingUp },
            { label: t('nav.submissions', 'Submissions'), href: '/coach/submissions', icon: FileText },
            { label: t('nav.gradebook', 'Gradebook'), href: '/gradebook', icon: ClipboardList },
            { label: t('nav.members', 'Org members'), href: '/org/members', icon: UserCog },
          ],
        },
        {
          heading: t('nav.groups.quality', 'Quality & Reports'),
          items: [
            { label: t('nav.compliance', 'Compliance'), href: '/compliance', icon: ShieldCheck },
          { label: t('nav.accreditation', 'Accreditation'), href: '/accreditation', icon: Award },
            { label: t('nav.reports'), href: '/reports', icon: FileText },
            { label: t('nav.support', 'Support'), href: '/support', icon: LifeBuoy },
          ],
        },
      ];
    }

    // Funder / sponsor: a single read-only impact view (decision §10.2).
    if (role === 'funder') {
      return [{
        items: [
          { label: t('nav.impact', 'Impact'), href: '/dashboard', icon: TrendingUp },
          { label: t('nav.support', 'Support'), href: '/support', icon: LifeBuoy },
        ],
      }];
    }

    // Instructional Designer: Hub authoring — Studio + standards (decision §3 / §9).
    if (role === 'instructional_designer') {
      return [{
        items: [
          { label: t('nav.overview'), href: '/dashboard', icon: LayoutDashboard },
          { label: t('nav.studio'), href: '/studio', icon: PenTool },
          { label: t('nav.cases', 'Case studies'), href: '/cases', icon: Layers },
          { label: t('nav.compliance', 'Compliance'), href: '/compliance', icon: ShieldCheck },
          { label: t('nav.accreditation', 'Accreditation'), href: '/accreditation', icon: Award },
          { label: t('nav.activities', 'Activities'), href: '/activities', icon: Sparkles },
          { label: t('nav.support', 'Support'), href: '/support', icon: LifeBuoy },
        ],
      }];
    }

    return [];
  };

  const navGroups = getNavGroups();
  const flatNav = navGroups.flatMap((g) => g.items);
  const isNavActive = (href: string) => location === href || location.startsWith(href + '/');
  const bottomItems = flatNav.slice(0, 4);

  const groupHeading = (text: string) => (
    <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.32)' }}>
      {text}
    </p>
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden" style={{ background: CONTENT_BG }}>

      {/* Impersonation banner — must be impossible to miss. */}
      {user.impersonating && (
        <div className="fixed inset-x-0 top-0 z-[60] bg-amber-500 text-amber-950 text-sm font-medium px-4 py-2 flex items-center justify-center gap-3 shadow-md">
          <span>
            Viewing as <strong>{user.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : user.email}</strong> ({user.role.replace('_', ' ')})
          </span>
          <button
            onClick={handleSignOut}
            className="rounded-full bg-amber-950/15 hover:bg-amber-950/25 px-3 py-0.5 text-xs font-semibold transition-colors"
          >
            Stop impersonating
          </button>
        </div>
      )}

      {/* ── Desktop sidebar ─────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 flex-col hidden md:flex" style={{ background: SIDEBAR_BG }}>
        <div className="h-16 flex items-center px-6" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
          <Link href="/dashboard" className="flex items-center gap-2 font-serif font-bold text-xl tracking-tight" style={{ color: '#fff' }}>
            {brandLogo ? (
              <img src={brandLogo} alt="" className="h-8 w-8 rounded-sm object-contain" />
            ) : (
              <span className="h-8 w-8 flex items-center justify-center rounded-sm" style={{ background: 'rgba(255,255,255,0.14)', color: '#fff' }}>{brandName.charAt(0).toUpperCase()}</span>
            )}
            {brandName}
          </Link>
        </div>

        <nav className="flex-1 py-5 px-3 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.25) transparent" }}>
          {navGroups.map((group, gi) => (
            <div key={gi} className="mb-1 space-y-0.5">
              {group.heading && groupHeading(group.heading)}
              {group.items.map((item) => (
                <ShellNavLink key={item.href + item.label} item={item} active={isNavActive(item.href)} />
              ))}
            </div>
          ))}
        </nav>

        <div className="p-4 space-y-1" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarImage src={user.avatarUrl || undefined} />
              <AvatarFallback style={{ background: 'rgba(255,255,255,0.14)', color: '#fff' }}>
                {user.firstName?.[0] || user.email[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium leading-none truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>
                {user.firstName} {user.lastName}
              </span>
              <span className="text-xs mt-1 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {user.role.replace('_', ' ')}
              </span>
            </div>
          </div>

          <ShellNavLink
            item={{ label: t('nav.notifications'), href: '/notifications', icon: Bell }}
            active={isNavActive('/notifications')}
          />
          {unreadCount > 0 && (
            <span className="ml-3 inline-block bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {unreadCount > 9 ? '9+' : unreadCount} new
            </span>
          )}

          <div className="px-1"><LanguageSwitcher variant="full" /></div>

          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm font-medium transition-colors"
            style={{ color: 'rgba(255,255,255,0.5)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.85)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {t('nav.signOut')}
          </button>
        </div>
      </aside>

      {/* ── Mobile full-screen menu drawer ─────────────────── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col" style={{ background: SIDEBAR_BG }}>
          <div className="h-14 flex items-center justify-between px-5 shrink-0" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
            <span className="font-serif font-bold text-base" style={{ color: '#fff' }}>{brandName}</span>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 rounded-md"
              style={{ color: 'rgba(255,255,255,0.6)' }}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-5 py-4 shrink-0 flex items-center gap-3" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src={user.avatarUrl || undefined} />
              <AvatarFallback style={{ background: 'rgba(255,255,255,0.14)', color: '#fff' }}>
                {user.firstName?.[0] || user.email[0]}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {user.role.replace('_', ' ')}
              </p>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-4 py-4">
            {navGroups.map((group, gi) => (
              <div key={gi} className="mb-1 space-y-0.5">
                {group.heading && groupHeading(group.heading)}
                {group.items.map((item) => (
                  <ShellNavLink
                    key={item.href + item.label}
                    item={item}
                    active={isNavActive(item.href)}
                    large
                    onClick={() => setMobileMenuOpen(false)}
                  />
                ))}
              </div>
            ))}

            <ShellNavLink
              item={{ label: t('nav.notifications'), href: '/notifications', icon: Bell }}
              active={isNavActive('/notifications')}
              large
              onClick={() => setMobileMenuOpen(false)}
            />
          </nav>

          <div className="px-4 pb-6 pt-2 shrink-0 space-y-1" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
            <div className="flex items-center gap-3 px-4 py-3">
              <LanguageSwitcher variant="icon" />
              <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>{t('language.label')}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-base font-medium"
              style={{ color: 'rgba(255,255,255,0.6)' }}
            >
              <LogOut className="h-5 w-5 shrink-0" />
              {t('nav.signOut')}
            </button>
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile top header */}
        <header className="h-14 flex items-center justify-between px-4 md:hidden shrink-0" style={{ background: SIDEBAR_BG }}>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 -ml-2 rounded-md"
            style={{ color: 'rgba(255,255,255,0.7)' }}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link href="/dashboard" className="font-serif font-bold text-base" style={{ color: '#fff' }}>
            {brandName}
          </Link>

          <div className="flex items-center gap-1">
            <LanguageSwitcher variant="icon" />
            <Link href="/notifications" className="relative p-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 h-4 w-4 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto p-4 pb-24 md:p-10 md:pb-10">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>

      {/* ── Mobile bottom tab bar ────────────────────────────── */}
      <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden" style={{ background: SIDEBAR_BG, borderTop: `1px solid ${HAIRLINE}` }}>
        <div className="flex items-stretch h-16">
          {bottomItems.map((item) => {
            const active = isNavActive(item.href);
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium"
                style={{ color: active ? '#fff' : 'rgba(255,255,255,0.5)' }}
              >
                <item.icon className={`h-5 w-5 ${active ? 'stroke-[2.5]' : 'stroke-[1.5]'}`} />
                <span className="leading-none">{item.label}</span>
              </Link>
            );
          })}

          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            <Menu className="h-5 w-5 stroke-[1.5]" />
            <span className="leading-none">{t('nav.more')}</span>
          </button>
        </div>
        <div className="h-[env(safe-area-inset-bottom,0px)]" />
      </nav>

      {import.meta.env.DEV && <DevRoleSwitcher />}
    </div>
  );
}
