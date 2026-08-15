import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useSession } from '@/context/SessionContext';
import { useBrandTheme } from '@/context/ThemeProvider';
import { DevRoleSwitcher } from '@/components/DevRoleSwitcher';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import SupportChat from '@/components/SupportChat';
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
  LifeBuoy,
  Landmark,
  TrendingUp,
  CalendarDays,
  Layers,
  ClipboardList,
  GraduationCap,
  NotebookPen,
  Briefcase,
  Wallet,
  Palette,
  Megaphone,
  ArrowLeft,
  Activity,
  Languages,
  FileWarning,
  Search,
  RotateCcw,
  ChevronDown,
  Home,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getPartnerHub, findHubByOrgId, orgDetail, getActivePartnerId, setActivePartner } from '@/lib/partnerHubData';
import { personaByEmail } from '@/lib/k12Personas';
import { cn } from '@/lib/utils';

/* ─────────────────────────────────────────────────────────────────────────
 * Sokratify theme: one dark-navy sidebar + warm off-white content across the
 * whole app. The page content keeps the app's light surfaces (cards/text); only
 * the shell chrome is dark, so every role - and the Platform Console - shares one
 * cohesive look.
 * ──────────────────────────────────────────────────────────────────────── */
const SIDEBAR_BG = 'hsl(222 47% 11%)';
// Super admin at the platform level gets a distinct deep-violet shell, so it is always obvious you
// are viewing as the platform owner. The moment a super admin steps into a partner (or a partner
// admin signs in), the shell reverts to the navy partner colour - a clear "you are now inside a
// partner, not the platform" cue.
const SUPER_BG = 'hsl(263 45% 15%)';
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
  const { user, loading, signOut, stopImpersonating } = useSession();
  const { data: brand, isLoading: brandLoading } = useBrandTheme();
  // While the tenant brand is still resolving, show nothing rather than flashing a default brand
  // name; once resolved use the tenant's name, falling back to a neutral product name.
  const tenantBrandName = brand?.displayName || (brandLoading ? '' : 'Praxis');
  const tenantBrandLogo = brand?.logoUrl || null;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Desktop sidebar collapse (persisted). Collapsed = sidebar hidden + a floating button to reopen,
  // so the content can use the full width.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('praxis_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const toggleSidebar = (next: boolean) => { setSidebarCollapsed(next); try { localStorage.setItem('praxis_sidebar_collapsed', next ? '1' : '0'); } catch { /* ok */ } };
  const [commandQuery, setCommandQuery] = useState('');
  const [location, navigate] = useLocation();

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
  // Young K-12 learners (K-5) get a jargon-free shell: hide the adult footer links (Notifications,
  // Security, Privacy & my data) that a child would not understand.
  const k12FooterPersona = personaByEmail(user?.email);
  const youngKid = !!k12FooterPersona && (k12FooterPersona.band === 'early' || k12FooterPersona.band === 'elementary');
  // Spanish-first K-12 learner (Sofía): even the role chip reads in her language.
  const roleLabel = k12FooterPersona?.defaultLang === 'es' && role === 'learner'
    ? 'estudiante'
    : role.replace('_', ' ');

  // Shell colour + context ribbon. A super admin at the platform level is violet; inside a partner
  // (or a partner admin) it is navy, so the colour itself tells you which context you are in.
  const inPartnerContext = location.startsWith('/partner');
  const isSuperPlatform = role === 'super_admin' && !inPartnerContext;
  const sidebarBg = isSuperPlatform ? SUPER_BG : SIDEBAR_BG;
  // A super admin has no partnerId of their own; the partner they are "acting as" is the persisted
  // active-partner selection, so the ribbon names the right partner.
  const actingPartnerId = user.partnerId ?? getActivePartnerId() ?? '';
  const activePartnerName = role === 'super_admin' && inPartnerContext ? getPartnerHub(actingPartnerId).partnerName : null;

  // Platform-owner branding: a super admin at the platform level is Synops (the platform owner),
  // not the tenant/partner whose white-label brand happens to resolve (which would misleadingly
  // show e.g. a partner's logo like "Enza Global"). Inside a partner, keep that partner's brand so
  // it stays clear which tenant you are in.
  const brandName = isSuperPlatform ? 'Synops' : tenantBrandName;
  // Demo visitors who arrived from the marketing site get a one-tap route back to Synops home.
  const fromMarketing = typeof window !== 'undefined' && window.localStorage.getItem('synops_from_marketing') === '1';
  const brandLogo = isSuperPlatform ? null : tenantBrandLogo;

  const getNavGroups = (): NavGroup[] => {
    // Learner preview ("View as"): while previewing a learner's experience we must NOT show the
    // full Partner Admin nav (Financial Hub, Funders, Audit, etc.), that misrepresents "this is
    // what they see" and is a trust concern. Collapse to a single clear exit back to the org.
    if (location.startsWith('/partner/impersonate')) {
      const back = (() => {
        const m = location.match(/^\/partner\/impersonate\/([^/]+)/);
        return m ? `/partner/org/${m[1]}/people` : '/partner/organisations';
      })();
      return [{ items: [{ label: t('nav.exitLearnerPreview', 'Exit learner preview'), href: back, icon: ArrowLeft }] }];
    }

    // Org context: whenever anyone with tenant oversight (partner admin OR super admin) is inside
    // an organisation (/partner/org/:id), the whole sidebar becomes that org's own hub. This is
    // role-independent so the founder testing as super admin gets the same in-org navigation.
    const orgMatch = location.match(/^\/partner\/org\/([^/]+)/);
    if (orgMatch && (role === 'partner_admin' || role === 'super_admin')) {
      const orgId = orgMatch[1];
      const b = `/partner/org/${orgId}`;
      const orgHub = findHubByOrgId(orgId) ?? getPartnerHub(user.partnerId ?? getActivePartnerId() ?? '');
      const org = orgDetail(orgHub, orgId).org;
      const orgName = org?.name ?? t('nav.organisation', 'Organisation');
      return [
        { items: [{ label: t('nav.allOrganisations', 'All organisations'), href: '/partner/organisations', icon: ArrowLeft }] },
        {
          heading: orgName,
          items: [
            { label: t('nav.orgOverview', 'Overview'), href: b, icon: LayoutDashboard },
            { label: t('nav.orgPeople', 'People'), href: `${b}/people`, icon: Users },
            { label: t('nav.orgClasses', 'Classes'), href: `${b}/classes`, icon: Layers },
            { label: t('nav.orgCourses', 'Courses'), href: `${b}/courses`, icon: BookOpen },
            { label: t('nav.orgCoaching', 'Coaching'), href: `${b}/coaching`, icon: GraduationCap },
            { label: t('nav.orgGradebook', 'Gradebook'), href: `${b}/gradebook`, icon: ClipboardList },
            { label: t('nav.orgFunding', 'Funding'), href: `${b}/funding`, icon: Landmark },
            { label: t('nav.orgDocuments', 'Documents'), href: `${b}/documents`, icon: FileText },
            { label: t('nav.orgBilling', 'Billing'), href: `${b}/billing`, icon: Wallet },
            { label: t('nav.orgSettings', 'Settings'), href: `${b}/settings`, icon: Settings },
          ],
        },
      ];
    }

    // Partner hub nav (Overview + Organisations + the Partner Admin Platform group). Shared by
    // the partner_admin AND by a super_admin browsing the partner hub, so from any partner page
    // there is always an Overview and every hub destination in the sidebar.
    const partnerHubGroups = (): NavGroup[] => [
      {
        items: [
          { label: t('nav.partnerOverview', 'Overview'), href: '/partner', icon: LayoutDashboard },
          { label: t('nav.organisations', 'Organisations'), href: '/partner/organisations', icon: Building },
        ],
      },
      {
        heading: t('nav.groups.partnerPlatform', 'Partner Admin Platform'),
        items: [
          { label: t('nav.financialHub', 'Financial Hub'), href: '/partner/finance', icon: Wallet },
          { label: t('nav.fundersHub', 'Funders Hub'), href: '/partner/funders', icon: Landmark },
          { label: t('nav.documents', 'Documents'), href: '/partner/documents', icon: FileText },
          { label: t('nav.accountsRoles', 'Accounts & Roles'), href: '/partner/accounts', icon: Users },
          { label: t('nav.communications', 'Communications'), href: '/partner/comms', icon: Megaphone },
          { label: t('nav.branding', 'Branding'), href: '/partner/theme', icon: Palette },
          { label: t('nav.audit', 'Audit & Impersonation'), href: '/partner/audit', icon: ShieldCheck },
          { label: t('nav.partnerSettings', 'Settings'), href: '/partner/settings', icon: Settings },
        ],
      },
      { items: [{ label: t('nav.support', 'Support'), href: '/support', icon: LifeBuoy }] },
    ];

    // Super admin INSIDE a specific partner's hub: the focused partner nav, plus an escape back to
    // the all-partners overview. (Org context is handled above; the partner list lives at the
    // platform overview, so there is no separate Partners page here.)
    if (role === 'super_admin' && (location === '/partner' || location.startsWith('/partner/'))) {
      return [
        { items: [{ label: t('nav.allPartners', 'All partners'), href: '/platform-overview', icon: ArrowLeft }] },
        ...partnerHubGroups(),
      ];
    }

    if (role === 'learner') {
      // Young K-12 learners (K-5) get a slimmed, jargon-free nav with kid words, no "My grades",
      // "Jotter" or "My sessions". Everything is reachable, just named for a child.
      const kidPersona = personaByEmail(user?.email);
      if (kidPersona && (kidPersona.band === 'early' || kidPersona.band === 'elementary')) {
        return [{
          items: [
            { label: t('nav.k12Lessons', 'My lessons'), href: '/dashboard', icon: LayoutDashboard },
            { label: t('nav.k12Classes', 'My classes'), href: '/courses', icon: BookOpen },
            { label: t('nav.k12Badges', 'My badges'), href: '/credentials', icon: Award },
            { label: t('nav.k12Help', 'Get help'), href: '/support', icon: LifeBuoy },
          ],
        }];
      }
      // Case studies and Activities are reached by learners inside their modules (assigned
      // as part of the module experience), so they are intentionally NOT top-level nav for
      // learners. Staff still get them as authoring surfaces in their own nav blocks.
      return [{
        items: [
          { label: t('nav.today'), href: '/dashboard', icon: LayoutDashboard },
          { label: t('nav.myCourses'), href: '/courses', icon: BookOpen },
          { label: t('nav.myGrades', 'My grades'), href: '/grades', icon: TrendingUp },
          // K-12 has no AI tutor / case studies; older K-12 learners skip the Coach hub too.
          ...(personaByEmail(user?.email) ? [] : [{ label: t('nav.coach', 'Coach'), href: '/coach-hub', icon: GraduationCap }]),
          { label: t('nav.jotter', 'Jotter'), href: '/jotter', icon: NotebookPen },
          { label: t('nav.mySessions', 'My sessions'), href: '/my-attendance', icon: CalendarDays },
          { label: t('nav.credentials'), href: '/credentials', icon: Award },
          { label: t('nav.portfolio', 'Portfolio'), href: '/portfolio', icon: Briefcase },
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
          { label: t('nav.activities', 'Activities'), href: '/activities', icon: Activity },
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
          { label: t('nav.activities', 'Activities'), href: '/activities', icon: Activity },
          { label: t('nav.compliance', 'Compliance'), href: '/compliance', icon: ShieldCheck },
          { label: t('nav.accreditation', 'Accreditation'), href: '/accreditation', icon: Award },
          { label: t('nav.reports'), href: '/reports', icon: FileText },
          { label: t('nav.support', 'Support'), href: '/support', icon: LifeBuoy },
        ],
      }];
    }

    if (role === 'partner_admin') {
      // Org context is handled above. Everywhere else the partner_admin gets the partner hub nav
      // (Overview, Organisations, and the Partner Admin Platform group).
      return partnerHubGroups();
    }

    // Super admin: the Partner Hub for a super admin is the all-partners Overview (platform overview);
    // the per-partner destinations (Organisations, Financial Hub, Funders, etc.) only appear once a
    // specific partner is opened (the focused partner-hub sidebar above takes over then). Plus the
    // platform-owner tools and the curriculum / delivery / quality surfaces.
    if (role === 'super_admin') {
      // Platform-level nav, grouped under headings that make sense. Partner-specific destinations
      // (Organisations, Financial Hub, Funders, etc.) are NOT here - they live inside a partner,
      // reached by opening one from the Partner Hub overview. The Learning Hub is the platform's
      // content/authoring home (courses, templates, studio) from which courses are assigned to
      // partners. "Org members" was removed (it belongs inside an organisation, not the platform).
      return [
        {
          heading: t('nav.groups.partnerHub', 'Partner Hub'),
          items: [
            { label: t('nav.overview', 'Overview'), href: '/platform-overview', icon: LayoutDashboard },
            { label: t('nav.partnerManagement', 'Partner management'), href: '/admin/partners', icon: Building },
          ],
        },
        {
          // Simplified to the course-first builder: one place to create and finish courses. The old
          // separate surfaces (Content Catalog, Learning Hub upload, Studio, Case studies, Activities)
          // now live inside a course/module, so they are no longer top-level nav.
          heading: t('nav.groups.courses', 'Courses'),
          items: [
            { label: t('nav.courseCatalog', 'Courses'), href: '/courses', icon: GraduationCap },
            { label: t('nav.incompleteCourses', 'Incomplete courses'), href: '/incomplete-courses', icon: FileWarning },
          ],
        },
        {
          heading: t('nav.groups.delivery', 'Delivery & Coaching'),
          items: [
            { label: t('nav.classInsights', 'Class insights'), href: '/class-insights', icon: Activity },
            { label: t('nav.sessions', 'Sessions'), href: '/delivery', icon: CalendarDays },
            { label: t('nav.learners', 'Coaching'), href: '/coach', icon: Users },
            { label: t('nav.coachingSections', 'Sections'), href: '/coaching/sections', icon: UserCog },
            { label: t('nav.coachingHealth', 'Coaching health'), href: '/coaching/health', icon: TrendingUp },
            { label: t('nav.submissions', 'Submissions'), href: '/coach/submissions', icon: FileText },
            { label: t('nav.gradebook', 'Gradebook'), href: '/gradebook', icon: ClipboardList },
          ],
        },
        {
          heading: t('nav.groups.platform', 'Platform'),
          items: [
            { label: t('nav.platformConsole', 'Platform Console'), href: '/platform', icon: ShieldCheck },
            { label: t('nav.financialHub', 'Financial Hub'), href: '/platform-finance', icon: Wallet },
            { label: t('nav.documentLibrary', 'Document Library'), href: '/admin/document-templates', icon: FileText },
            { label: t('nav.compliance', 'Compliance'), href: '/compliance', icon: ShieldCheck },
            { label: t('nav.accreditation', 'Accreditation'), href: '/accreditation', icon: Award },
            { label: t('nav.reports'), href: '/reports', icon: FileText },
            { label: t('nav.support', 'Support'), href: '/support', icon: LifeBuoy },
          ],
        },
        {
          // Platform operations tools. These used to be dumped into the personal account footer,
          // which crushed the real nav into a tiny scroll box; they belong in their own labelled
          // group in the main nav.
          heading: t('nav.groups.operations', 'Operations'),
          items: [
            { label: t('nav.health', 'System health'), href: '/admin/health', icon: Activity },
            { label: t('nav.cleanup', 'Environment cleanup'), href: '/admin/cleanup', icon: RotateCcw },
            { label: t('nav.translations', 'Translation review'), href: '/admin/translations', icon: Languages },
            { label: t('nav.dataRequests', 'Data requests'), href: '/admin/data-requests', icon: ShieldCheck },
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

    // Instructional Designer: Hub authoring - Studio + standards (decision §3 / §9).
    if (role === 'instructional_designer') {
      return [{
        items: [
          { label: t('nav.overview'), href: '/dashboard', icon: LayoutDashboard },
          { label: t('nav.studio'), href: '/studio', icon: PenTool },
          { label: t('nav.incompleteCourses', 'Incomplete courses'), href: '/incomplete-courses', icon: FileWarning },
          { label: t('nav.cases', 'Case studies'), href: '/cases', icon: Layers },
          { label: t('nav.compliance', 'Compliance'), href: '/compliance', icon: ShieldCheck },
          { label: t('nav.accreditation', 'Accreditation'), href: '/accreditation', icon: Award },
          { label: t('nav.activities', 'Activities'), href: '/activities', icon: Activity },
          { label: t('nav.support', 'Support'), href: '/support', icon: LifeBuoy },
        ],
      }];
    }

    return [];
  };

  const navGroups = getNavGroups();
  const flatNav = navGroups.flatMap((g) => g.items);
  // Highlight ONLY the most-specific matching item. The old prefix rule lit up every
  // ancestor: on /partner/finance both "Overview" (/partner) and "Financial Hub"
  // (/partner/finance) glowed. An item is active only if no longer nav href also matches
  // the current location.
  const isNavActive = (href: string) => {
    if (location === href) return true;
    if (!location.startsWith(href + '/')) return false;
    return !flatNav.some((i) => i.href.length > href.length && (location === i.href || location.startsWith(i.href + '/')));
  };
  const bottomItems = flatNav.slice(0, 4);
  // Breadcrumb label for the super-admin command bar: the most-specific active nav item.
  const activeNavLabel = flatNav.find((i) => isNavActive(i.href))?.label ?? '';

  // Collapsible nav sections. Every section TITLE stays visible so the whole menu is scannable at a
  // glance (no more hunting via a tiny scrollbar); the section you're currently in is always open, and
  // any other sections you open are remembered across visits.
  const activeHeading = navGroups.find((g) => g.heading && g.items.some((i) => isNavActive(i.href)))?.heading ?? null;
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('navOpenSections') || '{}'); } catch { return {}; }
  });
  const [accountOpen, setAccountOpen] = useState(false);
  const sectionOpen = (heading: string) => heading === activeHeading || openSections[heading] === true;
  const toggleSection = (heading: string) => setOpenSections((prev) => {
    const next = { ...prev, [heading]: !(prev[heading] === true) };
    try { localStorage.setItem('navOpenSections', JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  const collapsibleHeading = (text: string) => {
    const open = sectionOpen(text);
    const isActive = text === activeHeading;
    return (
      <button type="button" onClick={() => toggleSection(text)} aria-expanded={open}
        className="w-full flex items-center gap-1.5 px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider hover:text-white/60 transition-colors"
        style={{ color: 'rgba(255,255,255,0.32)' }}>
        <ChevronDown className="h-3 w-3 shrink-0 transition-transform duration-150" style={{ transform: open ? 'none' : 'rotate(-90deg)' }} />
        <span className="truncate">{text}</span>
        {isActive && !open && <span className="ml-auto h-1.5 w-1.5 rounded-full" style={{ background: '#c4b5fd' }} />}
      </button>
    );
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden" style={{ background: CONTENT_BG }}>

      {/* Impersonation banner - must be impossible to miss. */}
      {user.impersonating && (
        <div className="fixed inset-x-0 top-0 z-[60] bg-amber-500 text-amber-950 text-sm font-medium px-4 py-2 flex items-center justify-center gap-3 shadow-md">
          <span>
            Viewing as <strong>{user.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : user.email}</strong> ({user.role.replace('_', ' ')})
          </span>
          <button
            onClick={() => { void stopImpersonating(); }}
            className="rounded-full bg-amber-950/15 hover:bg-amber-950/25 px-3 py-0.5 text-xs font-semibold transition-colors"
          >
            Stop impersonating
          </button>
        </div>
      )}

      {/* Floating reopen button, shown on desktop only when the sidebar is collapsed. */}
      {sidebarCollapsed && (
        <button onClick={() => toggleSidebar(false)}
          className="fixed top-3 left-3 z-50 hidden md:inline-flex items-center justify-center h-9 w-9 rounded-lg shadow-md text-white"
          style={{ background: sidebarBg }} aria-label="Open menu" title="Open menu">
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* ── Desktop sidebar ─────────────────────────────────── */}
      <aside className={cn("w-64 flex-shrink-0 flex-col hidden", sidebarCollapsed ? "" : "md:flex")} style={{ background: sidebarBg }}>
        <div className="h-16 flex items-center px-6" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
          <Link href="/dashboard" className="flex items-center gap-2 font-serif font-bold text-xl tracking-tight" style={{ color: '#fff' }}>
            {brandLogo ? (
              <img src={brandLogo} alt="" className="h-8 w-8 rounded-sm object-contain" />
            ) : (
              <span className="h-8 w-8 flex items-center justify-center rounded-sm" style={{ background: 'rgba(255,255,255,0.14)', color: '#fff' }}>{brandName.charAt(0).toUpperCase()}</span>
            )}
            {brandName}
          </Link>
          <button onClick={() => toggleSidebar(true)}
            className="ml-auto hidden md:inline-flex items-center justify-center h-8 w-8 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Collapse menu" title="Collapse menu">
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>

        {fromMarketing && (
          <div className="mx-3 mt-3">
            <a href="https://synops-consulting.com/" title="Back to Synops home" className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-2.5 py-1 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"><Home className="h-3.5 w-3.5" />Synops home</a>
          </div>
        )}

        {role === 'super_admin' && (
          <div className="px-4 py-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide"
            style={{ color: '#ffffff', background: 'rgba(255,255,255,0.08)', borderBottom: `1px solid ${HAIRLINE}` }}>
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: isSuperPlatform ? '#c4b5fd' : '#fbbf24' }} />
            <span className="truncate">{isSuperPlatform ? t('nav.superAdminPlatform', 'Super Admin · Platform') : `${t('nav.insidePartner', 'Inside partner')} · ${activePartnerName ?? ''}`}</span>
            {/* Clear exit back to the super-admin platform: drops the active-partner selection and
                returns to the all-partners overview (violet platform shell). */}
            {!isSuperPlatform && (
              <button
                onClick={() => { setActivePartner(null); navigate('/platform-overview'); }}
                className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-white transition-colors hover:bg-white/25"
                title="Exit to the super-admin platform"
              >
                <ArrowLeft className="h-3 w-3" /> Exit to platform
              </button>
            )}
          </div>
        )}

        <nav className="flex-1 py-4 px-3 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.25) transparent" }}>
          {navGroups.map((group, gi) => {
            const open = group.heading ? sectionOpen(group.heading) : true;
            return (
              <div key={gi} className="mb-0.5 space-y-0.5">
                {group.heading && collapsibleHeading(group.heading)}
                {open && group.items.map((item) => (
                  <ShellNavLink key={item.href + item.label} item={item} active={isNavActive(item.href)} />
                ))}
              </div>
            );
          })}
        </nav>

        {/* Compact account area: one row that opens an upward dropdown with the account/utility links,
            so the footer no longer stacks six rows and push the nav into a scroll. */}
        <div className="relative p-3" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
          {accountOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setAccountOpen(false)} />
              <div className="absolute bottom-full left-3 right-3 mb-2 z-20 rounded-xl py-1 shadow-2xl"
                style={{ background: `linear-gradient(rgba(255,255,255,0.06), rgba(255,255,255,0.06)), ${sidebarBg}`, border: `1px solid ${HAIRLINE}` }}>
                {!youngKid && (
                  <>
                    <div className="relative">
                      <ShellNavLink item={{ label: t('nav.notifications'), href: '/notifications', icon: Bell }} active={isNavActive('/notifications')} onClick={() => setAccountOpen(false)} />
                      {unreadCount > 0 && (
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount > 9 ? '9+' : unreadCount}</span>
                      )}
                    </div>
                    <ShellNavLink item={{ label: t('nav.security', 'Security'), href: '/security', icon: ShieldCheck }} active={isNavActive('/security')} onClick={() => setAccountOpen(false)} />
                    <ShellNavLink item={{ label: t('nav.privacyData', 'Privacy & my data'), href: '/privacy/data', icon: FileText }} active={isNavActive('/privacy/data')} onClick={() => setAccountOpen(false)} />
                  </>
                )}
                <div className="px-2 py-1"><LanguageSwitcher variant="full" /></div>
                <div className="my-1 mx-2" style={{ borderTop: `1px solid ${HAIRLINE}` }} />
                {user?.email?.toLowerCase().endsWith('@synops-demo.test') && (
                  <button
                    onClick={async () => {
                      setAccountOpen(false);
                      if (!window.confirm('Reset this demo learner\'s progress so you can run through the lessons again?')) return;
                      try { await apiFetch('/learn/demo-reset', { method: 'POST', body: JSON.stringify({}) }); } catch { /* ignore */ }
                      window.location.href = '/dashboard';
                    }}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm font-medium transition-colors hover:bg-white/5"
                    style={{ color: 'rgba(255,255,255,0.6)' }} title="Reset progress (demo only)"
                  >
                    <RotateCcw className="h-4 w-4 shrink-0" /> Reset demo
                  </button>
                )}
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm font-medium transition-colors hover:bg-white/5"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                >
                  <LogOut className="h-4 w-4 shrink-0" /> {t('nav.signOut')}
                </button>
              </div>
            </>
          )}

          <button
            onClick={() => setAccountOpen((o) => !o)}
            className="flex items-center gap-3 w-full px-2 py-2 rounded-lg transition-colors hover:bg-white/5"
            aria-expanded={accountOpen}
          >
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarImage src={user.avatarUrl || undefined} />
              <AvatarFallback style={{ background: 'rgba(255,255,255,0.14)', color: '#fff' }}>
                {user.firstName?.[0] || user.email[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 flex flex-col min-w-0 text-left">
              <span className="text-sm font-medium leading-none truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>
                {user.firstName} {user.lastName}
              </span>
              <span className="text-xs mt-1 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {roleLabel}
              </span>
            </div>
            {!youngKid && unreadCount > 0 && !accountOpen && <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />}
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform" style={{ color: 'rgba(255,255,255,0.4)', transform: accountOpen ? 'rotate(180deg)' : 'none' }} />
          </button>
        </div>
      </aside>

      {/* ── Mobile full-screen menu drawer ─────────────────── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col" style={{ background: sidebarBg }}>
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
                {roleLabel}
              </p>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-4 py-4">
            {navGroups.map((group, gi) => {
              const open = group.heading ? sectionOpen(group.heading) : true;
              return (
                <div key={gi} className="mb-0.5 space-y-0.5">
                  {group.heading && collapsibleHeading(group.heading)}
                  {open && group.items.map((item) => (
                    <ShellNavLink
                      key={item.href + item.label}
                      item={item}
                      active={isNavActive(item.href)}
                      large
                      onClick={() => setMobileMenuOpen(false)}
                    />
                  ))}
                </div>
              );
            })}

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
        {/* Super-admin command bar (desktop): the platform console gets a distinct top bar the
            partner site does not have - global "jump to", a breadcrumb, system health and
            notifications - so the shell reads as a command center, and the sidebar is left free
            for navigation only. */}
        {isSuperPlatform && (
          <header className="hidden md:flex h-14 items-center gap-3 px-6 shrink-0" style={{ background: sidebarBg, borderBottom: `1px solid ${HAIRLINE}` }}>
            <span className="text-[11px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {t('nav.platformConsole', 'Platform Console')}
            </span>
            {activeNavLabel && (
              <>
                <span style={{ color: 'rgba(255,255,255,0.28)' }}>/</span>
                <span className="text-sm font-medium whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.92)' }}>{activeNavLabel}</span>
              </>
            )}
            <div className="flex-1 flex justify-center px-4">
              <div className="relative w-full max-w-sm">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.4)' }} />
                <input
                  value={commandQuery}
                  onChange={(e) => setCommandQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    const query = commandQuery.trim().toLowerCase();
                    const hit = flatNav.find((i) => i.label.toLowerCase().includes(query));
                    if (query && hit) { navigate(hit.href); setCommandQuery(''); }
                  }}
                  placeholder={t('nav.jumpTo', 'Jump to a section')}
                  aria-label={t('nav.jumpTo', 'Jump to a section')}
                  className="w-full rounded-md pl-9 pr-3 py-2 text-sm outline-none placeholder:text-white/40"
                  style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}
                />
              </div>
            </div>
            <Link href="/admin/health" className="flex items-center gap-1.5 text-xs whitespace-nowrap transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.6)' }}>
              <Activity className="h-4 w-4" /> {t('nav.health', 'System health')}
            </Link>
            <Link href="/notifications" className="relative transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.7)' }} aria-label={t('nav.notifications')}>
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          </header>
        )}

        {/* Mobile top header */}
        <header className="h-14 flex items-center justify-between px-4 md:hidden shrink-0" style={{ background: sidebarBg }}>
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
      <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden" style={{ background: sidebarBg, borderTop: `1px solid ${HAIRLINE}` }}>
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

      <SupportChat />

      {import.meta.env.DEV && <DevRoleSwitcher />}
    </div>
  );
}
