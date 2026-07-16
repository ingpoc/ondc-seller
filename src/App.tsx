import { FormEvent, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, Link, useLocation, useNavigate } from 'react-router-dom';
import { Bot, Menu, Search, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { useAgentRuntime, useSubject, useTrustState } from './hooks';
import { DashboardPage } from './pages/DashboardPage';
import { CatalogPage } from './pages/CatalogPage';
import { ProductEditPage } from './pages/ProductEditPage';
import { AgentChatPage } from './pages/AgentChatPage';
import { OrdersPage } from './pages/OrdersPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { AgentGuardPage } from './pages/AgentGuardPage';
import { ConfigPage } from './pages/ConfigPage';
import { SamanthaOrb } from './components/SamanthaOrb';
import { Button } from './components/ui/button';
import { ButtonGroup, ButtonGroupText } from './components/ui/button-group';
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
import type { PortfolioTrustState } from './lib/trust';
import { cn } from './lib/utils';
import { useAuthContext } from './contexts/AuthContext';
import { useAuthProviders } from './lib/authProviders';

const IDENTITY_AUTH_ENABLED = import.meta.env.VITE_IDENTITY_AUTH_ENABLED === 'true';

type NavItem = {
  href: string;
  label: string;
  external?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: '/agentguard', label: 'Business controls' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/catalog', label: 'Catalog' },
  { href: '/orders', label: 'Orders' },
  { href: '/config', label: 'Settings' },
];

const SECONDARY_NAV_ITEMS: NavItem[] = [
  { href: '/agent', label: 'Ask Samantha' },
  { href: '/usecase.html#agents', label: 'How it works', external: true },
];



type HeaderControl = 'search' | 'runtime' | 'trust' | null;

function getActivePath(pathname: string): string {
  if (pathname === '/' || pathname.startsWith('/dashboard')) {
    return '/dashboard';
  }
  if (pathname.startsWith('/catalog')) {
    return '/catalog';
  }
  if (pathname.startsWith('/orders')) {
    return '/orders';
  }
  if (pathname.startsWith('/config')) {
    return '/config';
  }
  if (pathname.startsWith('/agentguard')) {
    return '/agentguard';
  }
  if (pathname.startsWith('/agent')) {
    return '/agent';
  }
  return '/dashboard';
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
        detail: 'Verified trust keeps catalog, config, and high-trust operations available.',
        className: 'bg-primary/12 text-primary',
        icon: ShieldCheck,
      };
    case 'identity_present_unverified':
      return {
        label: 'Unverified',
        detail: 'Identity exists, but seller trust must be verified before publishing elevated actions.',
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

function getRuntimeMeta({
  loading,
  runtime_available,
  auth_mode,
  blocked_reason,
}: {
  loading?: boolean;
  runtime_available: boolean;
  auth_mode: string;
  blocked_reason?: string | null;
}) {
  if (loading) {
    return {
      label: 'Loading',
      detail: 'Checking whether the local seller runtime is available.',
      className: 'bg-secondary text-secondary-foreground',
      icon: Bot,
    };
  }

  if (runtime_available) {
    return {
      label: auth_mode,
      detail: 'The seller agent runtime is available for this subject and wallet context.',
      className: 'bg-primary/12 text-primary',
      icon: Bot,
    };
  }

  return {
    label: 'Unavailable',
    detail: blocked_reason || 'Local seller runtime is unavailable for this session.',
    className: 'bg-accent text-accent-foreground',
    icon: Bot,
  };
}

function NavigationLink({
  href,
  label,
  active,
  onNavigate,
  external,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate?: () => void;
  external?: boolean;
}) {
  if (external) {
    return (
      <a href={href} onClick={onNavigate} className="nav-pill" data-active="false">
        {label}
      </a>
    );
  }

  return (
    <Link to={href} onClick={onNavigate} className="nav-pill" data-active={active ? 'true' : 'false'}>
      {label}
    </Link>
  );
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
        className={cn('rounded-full shadow-sm', className)}
        onClick={onExpand}
        aria-label="Open catalog search"
      >
        <Search className="size-4" />
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

function HeaderControlTile({
  icon: Icon,
  label,
  detail,
  href,
  expanded,
  onExpand,
  className,
  ariaLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  detail: string;
  href?: string;
  expanded: boolean;
  onExpand: () => void;
  className: string;
  ariaLabel: string;
}) {
  if (!expanded) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="rounded-full shadow-sm"
        onClick={onExpand}
        aria-label={ariaLabel}
      >
        <Icon className="size-4" />
      </Button>
    );
  }

  const tile = (
    <ButtonGroup className="shadow-sm">
      <ButtonGroupText className={cn('gap-2 rounded-full px-3', className)}>
        <Icon className="size-4" />
        <span className="text-sm font-medium">{label}</span>
      </ButtonGroupText>
    </ButtonGroup>
  );

  return href ? (
    <a href={href} className="block" title={detail}>
      {tile}
    </a>
  ) : (
    <div title={detail}>{tile}</div>
  );
}

function HeaderBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { walletAddress, subjectId } = useSubject();
  const { isAuthenticated, loading: authLoading, loginAuth0, loginGoogle, logout } =
    useAuthContext();
  const authProviders = useAuthProviders();
  const trust = useTrustState(walletAddress);
  const runtime = useAgentRuntime(subjectId, walletAddress);
  const [activeControl, setActiveControl] = useState<HeaderControl>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const activePath = getActivePath(location.pathname);
  const visibleSecondaryNavItems = isAuthenticated
    ? SECONDARY_NAV_ITEMS
    : SECONDARY_NAV_ITEMS.filter((item) => item.href !== '/agent');
  const trustMeta = getTrustMeta(trust.state, trust.loading);
  const runtimeMeta = getRuntimeMeta(runtime);
  const TrustIcon = trustMeta.icon;

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
          <Link to="/dashboard" className="block text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            ONDC Seller
          </Link>
          <div className="hidden text-xs text-muted-foreground sm:block">
            Manage products and orders across the ONDC network
          </div>
        </div>

        <nav className="hidden flex-1 items-center justify-center gap-1.5 lg:flex">
          {NAV_ITEMS.map((item) => (
            <NavigationLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={activePath === item.href}
              external={item.external}
            />
          ))}
        </nav>

        <div ref={controlsRef} className="ml-auto hidden items-center gap-2 lg:flex">
          <HeaderSearch
            onSearch={handleSearch}
            expanded={activeControl === 'search'}
            onExpand={() => setActiveControl('search')}
            onCollapse={() => setActiveControl(null)}
            className={cn(activeControl === 'search' ? 'w-[20rem]' : 'w-auto')}
          />

          {isAuthenticated ? (
            <>
              <HeaderControlTile
                icon={Bot}
                label={`Assistant ${runtimeMeta.label}`}
                detail={runtimeMeta.detail}
                expanded={activeControl === 'runtime'}
                onExpand={() => setActiveControl('runtime')}
                className={runtimeMeta.className}
                ariaLabel="Open assistant status"
              />

              <HeaderControlTile
                icon={trustMeta.icon}
                label={`Access ${trustMeta.label}`}
                detail={trustMeta.detail}
                expanded={activeControl === 'trust'}
                onExpand={() => setActiveControl('trust')}
                className={trustMeta.className}
                ariaLabel="Open account access status"
              />
            </>
          ) : null}

          {IDENTITY_AUTH_ENABLED && !authLoading ? (
            isAuthenticated ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => void logout()}
              >
                Sign out
              </Button>
            ) : (
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
                {!authProviders.loading &&
                !authProviders.auth0 &&
                !authProviders.google ? (
                  <span className="text-xs text-muted-foreground">Sign-in not configured</span>
                ) : null}
              </div>
            )
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2 lg:hidden">
          {IDENTITY_AUTH_ENABLED && !authLoading ? (
            isAuthenticated ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => void logout()}
              >
                Sign out
              </Button>
            ) : (
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
                {!authProviders.loading &&
                !authProviders.auth0 &&
                !authProviders.google ? (
                  <span className="text-xs text-muted-foreground">Sign-in not configured</span>
                ) : null}
              </div>
            )
          ) : null}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="icon-sm" aria-label="Open seller navigation">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[20rem]">
              <SheetHeader>
                <SheetTitle>Seller navigation</SheetTitle>
                <SheetDescription>
                  Move between products, orders, settings, and seller tools.
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-3 px-6 pb-6">
                <div className="flex flex-col gap-2">
                  {NAV_ITEMS.map((item) => (
                    <NavigationLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      active={activePath === item.href}
                      onNavigate={() => setMobileOpen(false)}
                      external={item.external}
                    />
                  ))}
                </div>

                <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
                  {visibleSecondaryNavItems.map((item) => (
                    <NavigationLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      active={activePath === item.href}
                      onNavigate={() => setMobileOpen(false)}
                      external={item.external}
                    />
                  ))}
                </div>

                <HeaderSearch onSearch={(query) => {
                  handleSearch(query);
                  setMobileOpen(false);
                }} expanded onCollapse={() => setMobileOpen(false)} />

                {isAuthenticated ? (
                <div className="flex flex-col gap-2">
                  <div className={cn('flex items-center gap-2 rounded-3xl px-3 py-2 text-sm', runtimeMeta.className)}>
                    <Bot className="size-4" />
                    <span>Assistant {runtimeMeta.label}</span>
                  </div>
                  <a
                            className={cn('flex items-center gap-2 rounded-3xl px-3 py-2 text-sm', trustMeta.className)}
                  >
                    <TrustIcon className="size-4" />
                    <span>Access {trustMeta.label}</span>
                  </a>
                </div>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export function App() {
  const location = useLocation();
  const { isAuthenticated } = useAuthContext();
  const activePath = getActivePath(location.pathname);
  const visibleSecondaryNavItems = isAuthenticated
    ? SECONDARY_NAV_ITEMS
    : SECONDARY_NAV_ITEMS.filter((item) => item.href !== '/agent');

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-screen">
      <HeaderBar />
      <main className="pb-10">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/catalog/new" element={<ProductEditPage />} />
          <Route path="/catalog/:id" element={<ProductEditPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/agentguard" element={<AgentGuardPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route
            path="/agent"
            element={isAuthenticated ? <AgentChatPage /> : <Navigate to="/dashboard" replace />}
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
      <footer className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-3 border-t border-border/60 px-4 py-6 text-sm text-muted-foreground sm:px-6">
        {visibleSecondaryNavItems.map((item) => (
          <NavigationLink
            key={item.href}
            href={item.href}
            label={item.label}
            active={activePath === item.href}
            external={item.external}
          />
        ))}
      </footer>
      {isAuthenticated ? <SamanthaOrb /> : null}
    </div>
  );
}
