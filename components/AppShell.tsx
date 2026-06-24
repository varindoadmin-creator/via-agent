'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';

// Baked in at compile time — guarantees a unique client bundle hash on every deploy.
const _BUILD = process.env.NEXT_PUBLIC_BUILD_TIME;

interface NavItem {
  id: string;
  href: string;
  icon: string;
  label: string;
}

interface NavSection {
  id: string;
  label: string;
  icon: string;
  items: NavItem[];
}

const NAV: Array<{ type: 'standalone'; item: NavItem } | { type: 'section'; section: NavSection }> = [
  { type: 'standalone', item: { id: 'chat', href: '/', icon: '◈', label: 'Dashboard' } },
  {
    type: 'section',
    section: {
      id: 'sales', label: 'Sales', icon: '⬡',
      items: [
        { id: 'customers',    href: '/customers',           icon: '○', label: 'Customers'     },
        { id: 'salesorders',  href: '/shipments',           icon: '○', label: 'Sales Orders'  },
        { id: 'invoices',     href: '/print',               icon: '○', label: 'Invoices'      },
        { id: 'tax-invoices', href: '/sales/tax-invoices',  icon: '○', label: 'Tax Invoices'  },
      ],
    },
  },
  {
    type: 'section',
    section: {
      id: 'purchases', label: 'Purchases', icon: '◫',
      items: [
        { id: 'purchaseorders', href: '/purchases', icon: '○', label: 'Purchase Orders' },
        { id: 'bills',          href: '/bills',     icon: '○', label: 'Bills'           },
      ],
    },
  },
  {
    type: 'section',
    section: {
      id: 'inventory', label: 'Inventory', icon: '▣',
      items: [{ id: 'items', href: '/inventory', icon: '○', label: 'Items' }],
    },
  },
  {
    type: 'section',
    section: {
      id: 'requests', label: 'Requests', icon: '◻',
      items: [
        { id: 'req-samples',    href: '/requests/samples',    icon: '○', label: 'Samples'    },
        { id: 'req-quotes',     href: '/requests/quotes',     icon: '○', label: 'Quotes'     },
        { id: 'req-catalogues', href: '/requests/catalogues', icon: '○', label: 'Catalogues' },
      ],
    },
  },
  {
    type: 'section',
    section: {
      id: 'approvals', label: 'Approvals', icon: '◆',
      items: [{ id: 'approval-so', href: '/approvals/so', icon: '○', label: 'SO Approval Check' }],
    },
  },
  {
    type: 'section',
    section: {
      id: 'finance', label: 'Banking', icon: '⇌',
      items: [{ id: 'recon', href: '/reconcile', icon: '○', label: 'Reconciliation' }],
    },
  },
  {
    type: 'section',
    section: {
      id: 'reports', label: 'Reports', icon: '◈',
      items: [
        { id: 'sales-report',     href: '/reports/sales',     icon: '○', label: 'Sales'          },
        { id: 'purchases-report', href: '/reports/purchases',  icon: '○', label: 'Purchases'      },
        { id: 'mirpo-report',     href: '/reports/mirpo',      icon: '○', label: 'MIRPO Analysis' },
      ],
    },
  },
];

const COMING_SOON = ['/bills', '/orders', '/prices', '/reports'];

type Mode = 'mobile' | 'tablet' | 'desktop';

// ─── NavContent — shared between sidebar and mobile drawer ────────────────────

function NavContent({
  collapsed,
  openSections,
  pathname,
  onNav,
  onToggleSection,
  onClose,
}: {
  collapsed: boolean;
  openSections: Set<string>;
  pathname: string;
  onNav: (href: string) => void;
  onToggleSection: (id: string) => void;
  onClose?: () => void;
}) {
  function isActive(href: string) {
    return href === '/' ? pathname === '/' : pathname.startsWith(href);
  }
  function isSectionActive(s: NavSection) {
    return s.items.some(i => isActive(i.href));
  }

  const btnBase: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
    border: 'none', borderRadius: 6, transition: 'all 0.1s',
    position: 'relative', background: 'transparent',
    fontFamily: 'Inter, sans-serif', cursor: 'pointer',
  };

  return (
    <nav style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
      {NAV.map(entry => {
        if (entry.type === 'standalone') {
          const item = entry.item;
          const active = isActive(item.href);
          const soon = COMING_SOON.includes(item.href);
          return (
            <div key={item.id} style={{ padding: collapsed ? '0' : '0 6px', marginBottom: 1 }}>
              <button
                onClick={() => { onNav(item.href); onClose?.(); }}
                disabled={soon}
                title={collapsed ? item.label : undefined}
                style={{
                  ...btnBase,
                  padding: collapsed ? '8px 0' : '7px 10px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  background: active ? 'var(--sidebar-active-bg)' : 'transparent',
                  color: active ? '#f0ebe4' : soon ? 'var(--sidebar-border)' : 'var(--sidebar-text)',
                  cursor: soon ? 'default' : 'pointer',
                }}
                onMouseEnter={e => { if (!active && !soon) { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)'; (e.currentTarget as HTMLElement).style.color = '#c8c0b4'; } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = soon ? 'var(--sidebar-border)' : 'var(--sidebar-text)'; } }}
              >
                {active && !collapsed && <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 2.5, height: 14, borderRadius: '0 2px 2px 0', background: 'var(--accent)' }} />}
                <span style={{ fontSize: 13, flexShrink: 0, color: active ? 'var(--accent)' : 'inherit' }}>{item.icon}</span>
                {!collapsed && <span style={{ fontSize: 12.5, fontWeight: active ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
              </button>
            </div>
          );
        }

        const { section } = entry;
        const sectionActive = isSectionActive(section);
        const isOpen = openSections.has(section.id) || collapsed;

        return (
          <div key={section.id} style={{ marginBottom: 1 }}>
            <div style={{ padding: collapsed ? '0' : '0 6px' }}>
              <button
                onClick={() => onToggleSection(section.id)}
                title={collapsed ? section.label : undefined}
                style={{
                  ...btnBase,
                  padding: collapsed ? '8px 0' : '7px 10px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  color: sectionActive ? '#f0ebe4' : 'var(--sidebar-text)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)'; (e.currentTarget as HTMLElement).style.color = '#c8c0b4'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = sectionActive ? '#f0ebe4' : 'var(--sidebar-text)'; }}
              >
                <span style={{ fontSize: 13, flexShrink: 0, color: sectionActive ? 'var(--accent)' : 'inherit' }}>{section.icon}</span>
                {!collapsed && (
                  <>
                    <span style={{ fontSize: 12.5, fontWeight: sectionActive ? 500 : 400, flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                      {section.label}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--sidebar-section)', flexShrink: 0, transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>
                  </>
                )}
              </button>
            </div>

            {isOpen && (
              <div>
                {section.items.map(item => {
                  const active = isActive(item.href);
                  const soon = COMING_SOON.includes(item.href);
                  return (
                    <div key={item.id} style={{ padding: collapsed ? '0' : '0 6px 0 18px' }}>
                      <button
                        onClick={() => { onNav(item.href); onClose?.(); }}
                        disabled={soon}
                        title={collapsed ? item.label : undefined}
                        style={{
                          ...btnBase,
                          padding: collapsed ? '6px 0' : '5px 10px',
                          justifyContent: collapsed ? 'center' : 'flex-start',
                          background: active ? 'var(--sidebar-active-bg)' : 'transparent',
                          color: active ? '#f0ebe4' : soon ? 'var(--sidebar-border)' : 'var(--sidebar-section)',
                          cursor: soon ? 'default' : 'pointer',
                        }}
                        onMouseEnter={e => { if (!active && !soon) { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)'; (e.currentTarget as HTMLElement).style.color = '#c8c0b4'; } }}
                        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = soon ? 'var(--sidebar-border)' : 'var(--sidebar-section)'; } }}
                      >
                        {active && !collapsed && <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 2.5, height: 12, borderRadius: '0 2px 2px 0', background: 'var(--accent)' }} />}
                        {!collapsed && <span style={{ width: 4, height: 4, borderRadius: '50%', flexShrink: 0, background: active ? 'var(--accent)' : 'var(--sidebar-border)', marginLeft: 2 }} />}
                        {collapsed && <span style={{ fontSize: 11, color: active ? 'var(--accent)' : 'inherit' }}>{item.icon}</span>}
                        {!collapsed && (
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: active ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
                            {soon && <div style={{ fontSize: 9, color: 'var(--sidebar-section)', letterSpacing: '0.08em', fontFamily: 'JetBrains Mono, monospace' }}>SOON</div>}
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
        <div>
          <div style={{ color: '#f0ebe4', fontSize: 13, fontWeight: 600, letterSpacing: '0.01em', fontFamily: 'Inter, sans-serif' }}>VIA</div>
          <div style={{ color: 'var(--sidebar-section)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'JetBrains Mono, monospace' }}>Varindo Intelligence</div>
        </div>
      )}
    </div>
  );
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === '/login') return <>{children}</>;


  const [mode, setMode] = useState<Mode>('desktop');
  const [userCollapsed, setUserCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const allSectionIds = NAV
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

  const signOut = () => fetch('/api/auth/logout', { method: 'POST' }).then(() => { window.location.href = '/login'; });

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
            <div>
              <div style={{ color: '#f0ebe4', fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>VIA</div>
              <div style={{ color: 'var(--sidebar-section)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'JetBrains Mono, monospace' }}>Varindo Intelligence</div>
            </div>
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
              <div>
                <div style={{ color: '#f0ebe4', fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>VIA</div>
                <div style={{ color: 'var(--sidebar-section)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'JetBrains Mono, monospace' }}>Varindo Intelligence</div>
              </div>
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sidebar-section)', padding: 4, borderRadius: 4, fontSize: 16 }}
              aria-label="Close navigation"
            >✕</button>
          </div>

          <NavContent
            collapsed={false}
            openSections={openSections}
            pathname={pathname}
            onNav={handleNav}
            onToggleSection={handleToggleSection}
            onClose={() => setMobileOpen(false)}
          />

          <button
            onClick={signOut}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              borderTop: '1px solid var(--sidebar-border)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--sidebar-section)', fontSize: 12,
              fontFamily: 'JetBrains Mono, monospace', flexShrink: 0, width: '100%',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--danger)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-section)'}
          >
            <span style={{ fontSize: 12 }}>⎋</span>
            <span>Sign Out</span>
          </button>
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
      <aside style={{
        width: collapsed ? 52 : 210,
        flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)',
        transition: 'width 0.25s ease', overflow: 'hidden',
      }}>
        <Logo collapsed={collapsed} />

        <NavContent
          collapsed={collapsed}
          openSections={openSections}
          pathname={pathname}
          onNav={handleNav}
          onToggleSection={handleToggleSection}
        />

        <button
          onClick={signOut}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 8, padding: collapsed ? '10px 0' : '10px 14px',
            borderTop: '1px solid var(--sidebar-border)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--sidebar-section)', fontSize: 12,
            fontFamily: 'JetBrains Mono, monospace', flexShrink: 0, width: '100%',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--danger)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-section)'}
          title="Sign out"
        >
          <span style={{ fontSize: 12 }}>⎋</span>
          {!collapsed && <span>Sign Out</span>}
        </button>

        {mode === 'desktop' && (
          <button
            onClick={() => setUserCollapsed(c => !c)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 8, padding: collapsed ? '12px 0' : '12px 14px',
              borderTop: '1px solid var(--sidebar-border)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--sidebar-section)', fontSize: 12,
              fontFamily: 'JetBrains Mono, monospace', flexShrink: 0,
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
