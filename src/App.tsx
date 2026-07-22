import { FormEvent, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes, Link, useLocation, useNavigate } from 'react-router-dom';
import { Bot, ChevronDown, Menu, Search, ShieldAlert, ShieldCheck, ShieldX, UserRound } from 'lucide-react';
import { useAgentRuntime, useSubject, useTrustState } from './hooks';
import { DashboardPage } from './pages/DashboardPage';
import { CatalogPage } from './pages/CatalogPage';
import { ProductEditPage } from './pages/ProductEditPage';
import { OrdersPage } from './pages/OrdersPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { AgentGuardPage } from './pages/AgentGuardPage';
import { ConfigPage } from './pages/ConfigPage';
import { SellerLandingPage } from './pages/SellerLandingPage';
import { SamanthaOrb } from './components/SamanthaOrb';
import { Button } from './components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from './components/ui/input-group';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './components/ui/sheet';
import { effectiveElevatedTrustState, type PortfolioTrustState } from './lib/trust';
import { cn } from './lib/utils';
import { useAuthContext } from './contexts/AuthContext';
import { useAuthProviders } from './lib/authProviders';

const IDENTITY_AUTH_ENABLED = import.meta.env.VITE_IDENTITY_AUTH_ENABLED === 'true';

type NavItem = {
  href: string;
  label: string;
  external?: boolean;
};

/** Persistent shop destinations only — permissions live under Account. */
const PRIMARY_NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/catalog', label: 'Catalog' },
  { href: '/orders', label: 'Orders' },
  { href: '/config', label: 'Settings' },
];

const ACCOUNT_ASSISTANT_ITEM: NavItem = {
  href: '/config?tab=agent-guard',
  label: 'Agent Guard',
};

type HeaderControl = 'search' | 'account' | null;

export function headerTrustIsHealthy(label: string): boolean {
  return label === 'Verified';
}

export function headerRuntimeIsHealthy(label: string): boolean {
  return label === 'Ready';
}

function getTrustMeta(state: PortfolioTrustState, loading?: boolean) {
  if (loading) {
    return {
      label: 'Loading',
      detail: 'Checking session trust before elevated seller actions unlock.',
      className: 'bg-secondary text-secondary-foreground',
      icon: ShieldAlert,
    };
  }

  switch (state) {
    case 'verified':
      return {
        label: 'Verified',
        detail:
          'Your signed-in seller identity is verified. Connection and AgentGuard status are shown separately.',
        className: 'bg-primary/12 text-primary',
        icon: ShieldCheck,
      };
    case 'identity_present_unverified':
      return {
        label: 'Unverified',
        detail:
          'Identity exists, but seller trust must be verified before publishing elevated actions.',
        className: 'bg-accent text-accent-foreground',
        icon: ShieldAlert,
      };
    case 'manual_review':
      return {
        label: 'Manual review',
        detail: 'Verification is under review, so high-trust seller actions remain constrained.',
        className: 'bg-accent text-accent-foreground',
        icon: ShieldAlert,
      };
    case 'revoked_or_blocked':
      return {
        label: 'Blocked',
        detail: 'Trust is blocked or revoked. Sign in again or review your identity.',
        className: 'bg-destructive/12 text-destructive',
        icon: ShieldX,
      };
    default:
      return {
        label: 'Sign in required',
        detail: 'Sign in before elevated seller actions.',
        className: 'bg-secondary text-secondary-foreground',
        icon: ShieldAlert,
      };
  }
}

export function getHeaderTrustMeta(
  state: PortfolioTrustState,
  loading: boolean,
  principalId?: string | null
) {
  return getTrustMeta(effectiveElevatedTrustState(state, principalId), loading);
}

export function getRuntimeMeta({
  loading,
  runtime_available,
}: {
  loading?: boolean;
  runtime_available: boolean;
  auth_mode: string;
  blocked_reason?: string | null;
}) {
  if (loading) {
    return {
      label: 'Loading',
      detail: 'Checking whether the seller assistant is available.',
      className: 'bg-secondary text-secondary-foreground',
      icon: Bot,
    };
  }

  if (runtime_available) {
    return {
      label: 'Ready',
      detail: 'The seller assistant is ready for delegated seller tasks.',
      className: 'bg-primary/12 text-primary',
      icon: Bot,
    };
  }

  return {
    label: 'Unavailable',
    detail: 'The seller assistant is not ready. Open Settings → Agent Guard to review permissions.',
    className: 'bg-accent text-accent-foreground',
    icon: Bot,
  };
}

export function NavigationLink({
  href,
  label,
  onNavigate,
  external,
}: {
  href: string;
  label: string;
  onNavigate?: () => void;
  external?: boolean;
}) {
  if (external) {
    return (
      <a href={href} onClick={onNavigate} className="nav-pill">
        {label}
      </a>
    );
  }

  return (
    <NavLink to={href} onClick={onNavigate} className="nav-pill">
      {label}
    </NavLink>
  );
}

export function RequireSellerSession({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { isAuthenticated, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6" role="status">
        Checking sign-in…
      </div>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/" replace state={{ returnTo }} />;
  }

  return children;
}

function HeaderSearch({
  onSearch,
  expanded = false,
  onExpand,
  onCollapse,
  className,
}: {
  onSearch: (query: string) => void;
  expanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [expanded]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSearch(String(formData.get('query') || '').trim());
    onCollapse?.();
  }

  if (!expanded) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className={cn('rounded-full shadow-sm min-[1800px]:w-auto min-[1800px]:px-3', className)}
        onClick={onExpand}
        aria-label="Open catalog search"
      >
        <Search className="size-4" />
        <span className="hidden min-[1800px]:inline">Search</span>
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      <label htmlFor="header-search-query" className="sr-only">
        Search catalog
      </label>
      <InputGroup className="h-10 bg-background">
        <InputGroupAddon>
          <InputGroupText>
            <Search className="size-4" />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          id="header-search-query"
          ref={inputRef}
          name="query"
          placeholder="Search catalog..."
          aria-label="Search catalog"
          className="text-[14px] md:text-[14px] placeholder:text-[14px]"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onCollapse?.();
            }
          }}
        />
      </InputGroup>
    </form>
  );
}

function useSellerHeaderAuthority() {
  const { walletAddress, subjectId, principalId } = useSubject();
  const trust = useTrustState(walletAddress);
  const runtime = useAgentRuntime(subjectId, walletAddress);
  const trustMeta = getHeaderTrustMeta(trust.state, trust.loading, principalId);
  const runtimeMeta = getRuntimeMeta(runtime);
  return { trustMeta, runtimeMeta };
}

/** Healthy Ready/Verified stay out of the bar; only consequential problems surface. */
function HeaderAttentionBadge() {
  const { trustMeta, runtimeMeta } = useSellerHeaderAuthority();
  const trustOk = headerTrustIsHealthy(trustMeta.label);
  const runtimeOk = headerRuntimeIsHealthy(runtimeMeta.label);
  if (trustMeta.label === 'Loading' || runtimeMeta.label === 'Loading') return null;
  if (trustOk && runtimeOk) return null;

  const preferTrust = !trustOk;
  const href = preferTrust ? '/config?tab=network' : '/config?tab=agent-guard';
  const label = preferTrust ? `Identity: ${trustMeta.label}` : `Assistant: ${runtimeMeta.label}`;
  const Icon = preferTrust ? trustMeta.icon : runtimeMeta.icon;
  const detail = preferTrust ? trustMeta.detail : runtimeMeta.detail;

  return (
    <Link
      to={href}
      title={detail}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium',
        preferTrust ? trustMeta.className : runtimeMeta.className
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span>{label}</span>
    </Link>
  );
}

function AccountMenu({
  open,
  onOpenChange,
  onLogout,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  const { trustMeta, runtimeMeta } = useSellerHeaderAuthority();
  const TrustIcon = trustMeta.icon;
  const panelId = 'seller-account-menu';

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full shadow-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
      >
        <UserRound className="size-4" aria-hidden />
        <span>Account</span>
        <ChevronDown className={cn('size-3.5 opacity-70 transition', open && 'rotate-180')} aria-hidden />
      </Button>
      {open ? (
        <div
          id={panelId}
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-border/70 bg-background p-3 shadow-lg"
        >
          <div className="space-y-2 border-b border-border/60 pb-3 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Identity
            </p>
            <div className="flex items-start gap-2 text-foreground">
              <TrustIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-medium">{trustMeta.label}</p>
                <p className="text-xs text-muted-foreground">{trustMeta.detail}</p>
              </div>
            </div>
            <p className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Assistant
            </p>
            <div className="flex items-start gap-2 text-foreground">
              <Bot className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-medium">{runtimeMeta.label}</p>
                <p className="text-xs text-muted-foreground">{runtimeMeta.detail}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 pt-2">
            <Link
              role="menuitem"
              to={ACCOUNT_ASSISTANT_ITEM.href}
              className="rounded-xl px-3 py-2 text-sm hover:bg-secondary"
              onClick={() => {
                onOpenChange(false);
                onNavigate?.();
              }}
            >
              {ACCOUNT_ASSISTANT_ITEM.label}
            </Link>
            <Link
              role="menuitem"
              to="/config?tab=samantha"
              className="rounded-xl px-3 py-2 text-sm hover:bg-secondary"
              onClick={() => {
                onOpenChange(false);
                onNavigate?.();
              }}
            >
              Samantha
            </Link>
            <Link
              role="menuitem"
              to="/config"
              className="rounded-xl px-3 py-2 text-sm hover:bg-secondary"
              onClick={() => {
                onOpenChange(false);
                onNavigate?.();
              }}
            >
              Settings
            </Link>
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              className="justify-start rounded-xl px-3"
              onClick={() => {
                onOpenChange(false);
                onLogout();
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AccountPanelCompact({
  onLogout,
  onNavigate,
}: {
  onLogout: () => void;
  onNavigate: () => void;
}) {
  const { trustMeta, runtimeMeta } = useSellerHeaderAuthority();
  const TrustIcon = trustMeta.icon;

  return (
    <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Account</p>
      <div className="space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <TrustIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">Identity · {trustMeta.label}</p>
            <p className="text-xs text-muted-foreground">{trustMeta.detail}</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Bot className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">Assistant · {runtimeMeta.label}</p>
            <p className="text-xs text-muted-foreground">{runtimeMeta.detail}</p>
          </div>
        </div>
      </div>
      <NavigationLink
        href={ACCOUNT_ASSISTANT_ITEM.href}
        label={ACCOUNT_ASSISTANT_ITEM.label}
        onNavigate={onNavigate}
      />
      <NavigationLink href="/config?tab=samantha" label="Samantha" onNavigate={onNavigate} />
      <NavigationLink href="/config" label="Settings" onNavigate={onNavigate} />
      <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onLogout}>
        Sign out
      </Button>
    </div>
  );
}

function HeaderBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isAuthenticated,
    loading: authLoading,
    loginAuth0,
    loginGoogle,
    logout,
  } = useAuthContext();
  const authProviders = useAuthProviders();
  const [activeControl, setActiveControl] = useState<HeaderControl>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!controlsRef.current?.contains(event.target as Node)) {
        setActiveControl(null);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  function handleSearch(query: string) {
    const next = query ? `/catalog?q=${encodeURIComponent(query)}` : '/catalog';
    navigate(next);
  }

  return (
    <header className="shell-header">
      <div className="shell-inner">
        <div className="min-w-0 shrink-0">
          <Link
            to={isAuthenticated ? '/dashboard' : '/'}
            className="block text-lg font-semibold tracking-tight text-foreground sm:text-xl"
          >
            ONDC Seller
          </Link>
          <div className="hidden text-xs text-muted-foreground sm:block">
            {isAuthenticated ? 'Catalog and orders' : 'Sign in to manage your store'}
          </div>
        </div>

        {isAuthenticated ? (
          <div className="hidden flex-1 justify-center lg:flex">
            <nav aria-label="Primary seller navigation" className="nav-track">
              {PRIMARY_NAV_ITEMS.map((item) => (
                <NavigationLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  external={item.external}
                />
              ))}
            </nav>
          </div>
        ) : null}

        <div ref={controlsRef} className="ml-auto hidden items-center gap-2 lg:flex">
          {isAuthenticated ? (
            <>
              <HeaderSearch
                onSearch={handleSearch}
                expanded={activeControl === 'search'}
                onExpand={() => setActiveControl('search')}
                onCollapse={() => setActiveControl(null)}
                className={cn(activeControl === 'search' ? 'w-[20rem]' : 'w-auto')}
              />
              <HeaderAttentionBadge />
              <AccountMenu
                open={activeControl === 'account'}
                onOpenChange={(next) => setActiveControl(next ? 'account' : null)}
                onLogout={() => void logout()}
              />
            </>
          ) : null}

          {IDENTITY_AUTH_ENABLED && !authLoading && !isAuthenticated ? (
            <div className="flex items-center gap-2">
              {authProviders.auth0 ? (
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full"
                  onClick={() => loginAuth0(location.pathname)}
                >
                  Sign in
                </Button>
              ) : null}
              {!authProviders.auth0 && authProviders.google ? (
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full"
                  onClick={() => loginGoogle(location.pathname)}
                >
                  Google
                </Button>
              ) : null}
              {!authProviders.loading && !authProviders.auth0 && !authProviders.google ? (
                <span className="text-xs text-muted-foreground">Sign-in not configured</span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2 lg:hidden">
          {IDENTITY_AUTH_ENABLED && !authLoading && !isAuthenticated ? (
            <div className="flex items-center gap-1">
              {authProviders.auth0 ? (
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full"
                  onClick={() => loginAuth0(location.pathname)}
                >
                  Sign in
                </Button>
              ) : null}
              {!authProviders.auth0 && authProviders.google ? (
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full"
                  onClick={() => loginGoogle(location.pathname)}
                >
                  Google
                </Button>
              ) : null}
              {!authProviders.loading && !authProviders.auth0 && !authProviders.google ? (
                <span className="text-xs text-muted-foreground">Sign-in not configured</span>
              ) : null}
            </div>
          ) : null}
          {isAuthenticated ? (
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Open seller navigation"
                  aria-expanded={mobileOpen}
                  aria-controls="seller-navigation"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      setMobileOpen(true);
                    }
                  }}
                >
                  <Menu className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent id="seller-navigation" side="right" className="w-[20rem]">
                <SheetHeader>
                  <SheetTitle>Seller navigation</SheetTitle>
                  <SheetDescription>
                    Move between catalog, orders, and settings. Account tools are below.
                  </SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-3 px-6 pb-6">
                  <div className="flex flex-col gap-2">
                    {PRIMARY_NAV_ITEMS.map((item) => (
                      <NavigationLink
                        key={item.href}
                        href={item.href}
                        label={item.label}
                        onNavigate={() => setMobileOpen(false)}
                        external={item.external}
                      />
                    ))}
                  </div>

                  <HeaderSearch
                    onSearch={(query) => {
                      handleSearch(query);
                      setMobileOpen(false);
                    }}
                    expanded
                    onCollapse={() => setMobileOpen(false)}
                  />

                  <AccountPanelCompact
                    onLogout={() => void logout()}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </div>
              </SheetContent>
            </Sheet>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function App() {
  const location = useLocation();
  const { isAuthenticated } = useAuthContext();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-screen">
      <a
        href="#seller-main-content"
        className="sr-only fixed left-4 top-4 z-[100] rounded-full bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only"
      >
        Skip to main content
      </a>
      <HeaderBar />
      <main id="seller-main-content" tabIndex={-1} className="pb-10">
        <Routes>
          <Route path="/" element={<SellerLandingPage />} />
          <Route
            path="/dashboard"
            element={
              <RequireSellerSession>
                <DashboardPage />
              </RequireSellerSession>
            }
          />
          <Route
            path="/catalog"
            element={
              <RequireSellerSession>
                <CatalogPage />
              </RequireSellerSession>
            }
          />
          <Route
            path="/catalog/new"
            element={
              <RequireSellerSession>
                <ProductEditPage />
              </RequireSellerSession>
            }
          />
          <Route
            path="/catalog/:id"
            element={
              <RequireSellerSession>
                <ProductEditPage />
              </RequireSellerSession>
            }
          />
          <Route
            path="/orders"
            element={
              <RequireSellerSession>
                <OrdersPage />
              </RequireSellerSession>
            }
          />
          <Route
            path="/orders/:id"
            element={
              <RequireSellerSession>
                <OrderDetailPage />
              </RequireSellerSession>
            }
          />
          <Route
            path="/agentguard"
            element={
              <RequireSellerSession>
                <AgentGuardPage />
              </RequireSellerSession>
            }
          />
          <Route
            path="/config"
            element={
              <RequireSellerSession>
                <ConfigPage />
              </RequireSellerSession>
            }
          />
          <Route
            path="*"
            element={<Navigate to={isAuthenticated ? '/dashboard' : '/'} replace />}
          />
        </Routes>
      </main>
      {isAuthenticated ? <SamanthaOrb /> : null}
    </div>
  );
}
