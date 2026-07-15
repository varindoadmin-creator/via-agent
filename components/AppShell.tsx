'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, ShoppingCart, Package, Boxes, Inbox,
  ClipboardCheck, BarChart2, Circle, Target, FileText, BookOpen, Landmark, Truck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Role } from '@/lib/auth';

// Baked in at compile time — guarantees a unique client bundle hash on every deploy.
const _BUILD = process.env.NEXT_PUBLIC_BUILD_TIME;

interface NavItem {
  id: string;
  href: string;
  label: string;
}

interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

const NAV: Array<{ type: 'standalone'; item: NavItem & { icon: LucideIcon }; hidden?: boolean } | { type: 'section'; section: NavSection; hidden?: boolean }> = [
  { type: 'standalone', item: { id: 'chat', href: '/dashboard', icon: LayoutDashboard, label: 'Home' }, hidden: true },
  { type: 'standalone', item: { id: 'leads', href: '/leads', icon: Target, label: 'Leads' }, hidden: true },
  {
    type: 'section',
    section: {
      id: 'items', label: 'Items', icon: Boxes,
      items: [
        { id: 'items-list',  href: '/inventory',                label: 'Items'       },
        { id: 'price-lists', href: '/inventory/price-lists',    label: 'Price Lists' },
      ],
    },
    hidden: true,
  },
  {
    type: 'section',
    section: {
      id: 'inventory', label: 'Inventory', icon: Truck,
      items: [{ id: 'shipments', href: '/inventory/shipments', label: 'Shipments' }],
    },
    hidden: true,
  },
  {
    type: 'section',
    section: {
      id: 'sales', label: 'Sales', icon: ShoppingCart,
      items: [
        { id: 'customers',    href: '/customers',           label: 'Customers'     },
        { id: 'salesorders',  href: '/shipments',           label: 'Sales Orders'  },
        { id: 'invoices',     href: '/print',               label: 'Invoices'      },
        { id: 'tax-invoices', href: '/sales/tax-invoices',  label: 'Tax Invoices'  },
      ],
    },
    hidden: true,
  },
  {
    type: 'section',
    section: {
      id: 'purchases', label: 'Purchases', icon: Package,
      items: [
        { id: 'purchaseorders', href: '/purchases', label: 'Purchase Orders' },
        { id: 'bills',          href: '/bills',     label: 'Bills'           },
      ],
    },
    hidden: true,
  },
  {
    type: 'section',
    section: {
      id: 'banking', label: 'Banking', icon: Landmark,
      items: [{ id: 'reconcile', href: '/reconcile', label: 'Bank Reconciliation' }],
    },
    hidden: true,
  },
  {
    type: 'section',
    section: {
      id: 'approvals', label: 'Approvals', icon: ClipboardCheck,
      items: [
        { id: 'approval-so', href: '/approvals/so', label: 'Sales Order'    },
        { id: 'approval-po', href: '/approvals/po', label: 'Purchase Order' },
      ],
    },
  },
  {
    type: 'section',
    section: {
      id: 'requests', label: 'Requests', icon: Inbox,
      items: [
        { id: 'req-samples',    href: '/requests/samples',    label: 'Samples'    },
        { id: 'req-quotes',     href: '/requests/quotes',     label: 'Quotes'     },
        { id: 'req-catalogues', href: '/requests/catalogues', label: 'Catalogues' },
      ],
    },
  },
  {
    type: 'section',
    section: {
      id: 'documents', label: 'Documents', icon: FileText,
      items: [
        { id: 'goods-collection-memo', href: '/documents/goods-collection-memo', label: 'Goods Collection Memo' },
      ],
    },
  },
  {
    type: 'section',
    section: {
      id: 'reports', label: 'Reports', icon: BarChart2,
      items: [
        { id: 'sales-report',     href: '/reports/sales',     label: 'Sales'          },
        { id: 'purchases-report', href: '/reports/purchases',  label: 'Purchases'      },
      ],
    },
    hidden: true,
  },
  { type: 'standalone', item: { id: 'guide', href: '/guide', icon: BookOpen, label: 'Guide' } },
];

const COMING_SOON = ['/bills', '/orders', '/prices', '/reports'];

// Nav item id -> API endpoint whose "New" status count should badge that item.
const NEW_COUNT_ENDPOINTS: Record<string, string> = {
  'req-samples':    '/api/requests/samples',
  'req-quotes':     '/api/requests/quotes',
  'req-catalogues': '/api/requests/catalogues',
};

type Mode = 'mobile' | 'tablet' | 'desktop';

// ─── NavContent — shared between sidebar and mobile drawer ────────────────────

function NavContent({
  nav,
  collapsed,
  openSections,
  pathname,
  onNav,
  onToggleSection,
  onClose,
  newCounts,
}: {
  nav: typeof NAV;
  collapsed: boolean;
  openSections: Set<string>;
  pathname: string;
  onNav: (href: string) => void;
  onToggleSection: (id: string) => void;
  onClose?: () => void;
  newCounts: Record<string, number>;
}) {
  function isActive(href: string) {
    return href === '/' ? pathname === '/' : pathname.startsWith(href);
  }
  function isSectionActive(s: NavSection) {
    return s.items.some(i => isActive(i.href));
  }

  const btnBase: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 9,
    border: 'none', borderRadius: 6, transition: 'all 0.1s',
    position: 'relative', background: 'transparent',
    fontFamily: 'Inter, sans-serif', cursor: 'pointer',
  };

  return (
    <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
      {nav.filter(entry => !entry.hidden).map(entry => {
        if (entry.type === 'standalone') {
          const item = entry.item;
          const Icon = item.icon;
          const active = isActive(item.href);
          const soon = COMING_SOON.includes(item.href);
          return (
            <div key={item.id} style={{ padding: collapsed ? '0' : '0 8px', marginBottom: 2 }}>
              <button
                onClick={() => { onNav(item.href); onClose?.(); }}
                disabled={soon}
                title={collapsed ? item.label : undefined}
                style={{
                  ...btnBase,
                  padding: collapsed ? '8px 0' : '7px 10px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  background: active ? 'var(--sidebar-active-bg)' : 'transparent',
                  color: active ? 'var(--sidebar-active-text)' : soon ? 'var(--sidebar-section)' : 'var(--sidebar-text)',
                  cursor: soon ? 'default' : 'pointer',
                }}
                onMouseEnter={e => { if (!active && !soon) { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = soon ? 'var(--sidebar-section)' : 'var(--sidebar-text)'; } }}
              >
                <Icon size={16} strokeWidth={2} style={{ flexShrink: 0 }} />
                {!collapsed && <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
              </button>
            </div>
          );
        }

        const { section } = entry;
        const SectionIcon = section.icon;
        const sectionActive = isSectionActive(section);
        const isOpen = openSections.has(section.id) || collapsed;

        return (
          <div key={section.id} style={{ marginBottom: 2 }}>
            <div style={{ padding: collapsed ? '0' : '0 8px' }}>
              <button
                onClick={() => onToggleSection(section.id)}
                title={collapsed ? section.label : undefined}
                style={{
                  ...btnBase,
                  padding: collapsed ? '8px 0' : '7px 10px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  color: sectionActive ? 'var(--text)' : 'var(--sidebar-text)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = sectionActive ? 'var(--text)' : 'var(--sidebar-text)'; }}
              >
                <SectionIcon size={16} strokeWidth={2} style={{ flexShrink: 0 }} />
                {!collapsed && (
                  <>
                    <span style={{ fontSize: 13, fontWeight: sectionActive ? 600 : 500, flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                      {section.label}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--sidebar-section)', flexShrink: 0, transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>
                  </>
                )}
              </button>
            </div>

            {isOpen && (
              <div>
                {section.items.map(item => {
                  const active = isActive(item.href);
                  const soon = COMING_SOON.includes(item.href);
                  const newCount = newCounts[item.id] || 0;
                  return (
                    <div key={item.id} style={{ padding: collapsed ? '0' : '0 8px' }}>
                      <button
                        onClick={() => { onNav(item.href); onClose?.(); }}
                        disabled={soon}
                        title={collapsed ? item.label : undefined}
                        style={{
                          ...btnBase,
                          padding: collapsed ? '6px 0' : '6px 10px 6px 30px',
                          justifyContent: collapsed ? 'center' : 'flex-start',
                          background: active ? 'var(--sidebar-active-bg)' : 'transparent',
                          color: active ? 'var(--sidebar-active-text)' : soon ? 'var(--sidebar-section)' : 'var(--sidebar-text)',
                          cursor: soon ? 'default' : 'pointer',
                        }}
                        onMouseEnter={e => { if (!active && !soon) { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; } }}
                        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = soon ? 'var(--sidebar-section)' : 'var(--sidebar-text)'; } }}
                      >
                        {collapsed && (
                          newCount > 0
                            ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />
                            : <Circle size={7} fill="currentColor" style={{ flexShrink: 0 }} />
                        )}
                        {!collapsed && (
                          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                            <div style={{ fontSize: 12.5, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.label}
                              {newCount > 0 && (
                                <span style={{ marginLeft: 5, fontWeight: 700, color: active ? 'inherit' : 'var(--danger)' }}>
                                  ({newCount})
                                </span>
                              )}
                            </div>
                            {soon && <div style={{ fontSize: 9, color: 'var(--sidebar-section)', letterSpacing: '0.08em' }}>SOON</div>}
                          </div>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: collapsed ? '16px 0' : '16px 14px',
      justifyContent: collapsed ? 'center' : 'flex-start',
      borderBottom: '1px solid var(--sidebar-border)', flexShrink: 0,
    }}>
      <div style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'white', fontSize: 12, fontWeight: 600, letterSpacing: '-0.5px' }}>V</span>
      </div>
      {!collapsed && (
        <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700, letterSpacing: '0.01em', fontFamily: 'Inter, sans-serif' }}>VIA</div>
      )}
    </div>
  );
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export default function AppShell({ children, role }: { children: React.ReactNode; role: Role | null }) {
  const pathname = usePathname();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('desktop');
  const [userCollapsed, setUserCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [newCounts, setNewCounts] = useState<Record<string, number>>({});

  // Admin only sees the sections currently exposed for day-to-day approval work;
  // Director sees everything. Server-side, middleware is what actually enforces
  // this — this filter just keeps the sidebar honest about what's reachable.
  const visibleNav = role === 'admin'
    ? NAV.filter(entry =>
        (entry.type === 'section' && (entry.section.id === 'approvals' || entry.section.id === 'requests' || entry.section.id === 'documents' || entry.section.id === 'sales')) ||
        (entry.type === 'standalone' && entry.item.id === 'guide')
      ).map(entry => {
        // Sales is only shown so Admin can reach Customers — Invoices and Tax
        // Invoices aren't in ADMIN_ALLOWED_PREFIXES (middleware.ts), so keep
        // them out of the sidebar too rather than showing a link that 403s.
        if (entry.type === 'section' && entry.section.id === 'sales') {
          return { ...entry, hidden: false, section: { ...entry.section, items: entry.section.items.filter(i => i.id === 'customers') } };
        }
        return { ...entry, hidden: false };
      }) // clear any hidden flag on entries explicitly allow-listed above
    : role === 'director'
    ? NAV.map(entry => ({ ...entry, hidden: false })) // Director sees every section, including WIP ones hidden from Admin
    : NAV;

  const allSectionIds = visibleNav
    .filter(n => n.type === 'section')
    .map(n => (n as { type: 'section'; section: NavSection }).section.id);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(allSectionIds));

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setMode(w < 768 ? 'mobile' : w < 1100 ? 'tablet' : 'desktop');
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Poll "New" request counts to badge the Requests sub-items
  useEffect(() => {
    let cancelled = false;
    async function fetchCounts() {
      const entries = await Promise.all(
        Object.entries(NEW_COUNT_ENDPOINTS).map(async ([id, url]) => {
          try {
            const res = await fetch(url);
            const data = await res.json();
            const count = Array.isArray(data.requests)
              ? data.requests.filter((r: { status?: string }) => (r.status || 'New') === 'New').length
              : 0;
            return [id, count] as const;
          } catch {
            return [id, 0] as const;
          }
        })
      );
      if (!cancelled) setNewCounts(Object.fromEntries(entries));
    }
    fetchCounts();
    const interval = setInterval(fetchCounts, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [pathname]);

  // Auto-open section for active route
  useEffect(() => {
    for (const entry of NAV) {
      if (entry.type === 'section') {
        const hasActive = entry.section.items.some(item =>
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
        );
        if (hasActive) setOpenSections(prev => new Set([...prev, entry.section.id]));
      }
    }
  }, [pathname]);

  const collapsed = mode === 'tablet' || (mode === 'desktop' && userCollapsed);

  const handleNav = useCallback((href: string) => {
    if (!COMING_SOON.includes(href)) router.push(href);
  }, [router]);

  const handleToggleSection = useCallback((id: string) => {
    if (collapsed) return;
    setOpenSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, [collapsed]);

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }, [router]);

  // Login page renders its own full-screen layout — no sidebar chrome.
  if (pathname === '/login') return <>{children}</>;

  // ── Mobile layout ──────────────────────────────────────────────────────────
  if (mode === 'mobile') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg)' }}>

        {/* Top bar */}
        <header style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 52, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px',
          background: 'var(--sidebar-bg)', borderBottom: '1px solid var(--sidebar-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'white', fontSize: 12, fontWeight: 600 }}>V</span>
            </div>
            <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>VIA</div>
          </div>
          <button
            onClick={() => setMobileOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sidebar-text)', padding: '6px', borderRadius: 6 }}
            aria-label="Open navigation"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <line x1="3" y1="6" x2="17" y2="6" />
              <line x1="3" y1="10" x2="17" y2="10" />
              <line x1="3" y1="14" x2="17" y2="14" />
            </svg>
          </button>
        </header>

        {/* Backdrop */}
        {mobileOpen && (
          <div
            onClick={() => setMobileOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 60 }}
          />
        )}

        {/* Drawer */}
        <aside style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, width: 240, zIndex: 70,
          display: 'flex', flexDirection: 'column',
          background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)',
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px', borderBottom: '1px solid var(--sidebar-border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'white', fontSize: 12, fontWeight: 600 }}>V</span>
              </div>
              <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>VIA</div>
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sidebar-section)', padding: 4, borderRadius: 4, fontSize: 16 }}
              aria-label="Close navigation"
            >✕</button>
          </div>

          <NavContent
            nav={visibleNav}
            collapsed={false}
            openSections={openSections}
            pathname={pathname}
            onNav={handleNav}
            onToggleSection={handleToggleSection}
            onClose={() => setMobileOpen(false)}
            newCounts={newCounts}
          />

          {role && (
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--sidebar-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ color: 'var(--sidebar-section)', fontSize: 11, fontFamily: 'Inter, sans-serif', textTransform: 'capitalize' }}>{role}</span>
              <button onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sidebar-section)', fontSize: 11, fontFamily: 'Inter, sans-serif', padding: 0 }}>Logout</button>
            </div>
          )}

        </aside>

        {/* Content */}
        <main style={{ flex: 1, overflow: 'auto', paddingTop: 52, minHeight: 0 }}>
          {children}
        </main>
      </div>
    );
  }

  // ── Tablet / Desktop layout ────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: 'var(--bg)' }}>
      <aside data-build={_BUILD} style={{
        width: collapsed ? 52 : 210,
        flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)',
        transition: 'width 0.25s ease', overflow: 'hidden',
      }}>
        <Logo collapsed={collapsed} />

        <NavContent
          nav={visibleNav}
          collapsed={collapsed}
          openSections={openSections}
          pathname={pathname}
          onNav={handleNav}
          onToggleSection={handleToggleSection}
          newCounts={newCounts}
        />

        {role && (
          <div style={{ padding: collapsed ? '8px 0' : '10px 14px', borderTop: '1px solid var(--sidebar-border)', display: 'flex', flexDirection: collapsed ? 'column' : 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexShrink: 0 }}>
            {!collapsed && <span style={{ color: 'var(--sidebar-section)', fontSize: 11, fontFamily: 'Inter, sans-serif', textTransform: 'capitalize' }}>{role}</span>}
            <button onClick={handleLogout} title="Log out" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sidebar-section)', fontSize: 11, fontFamily: 'Inter, sans-serif', padding: 0 }}>{collapsed ? '⎋' : 'Logout'}</button>
          </div>
        )}

        {mode === 'desktop' && (
          <button
            onClick={() => setUserCollapsed(c => !c)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 8, padding: collapsed ? '12px 0' : '12px 14px',
              borderTop: '1px solid var(--sidebar-border)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--sidebar-section)', fontSize: 12,
              fontFamily: 'Inter, sans-serif', flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-text)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-section)'}
          >
            <span style={{ fontSize: 11 }}>{collapsed ? '→' : '←'}</span>
            {!collapsed && <span>Collapse</span>}
          </button>
        )}
      </aside>

      <main style={{ flex: 1, overflow: 'auto', minWidth: 0, background: 'var(--bg)' }}>
        {children}
      </main>
    </div>
  );
}
