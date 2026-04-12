import { FormEvent, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, Link, useLocation, useNavigate } from 'react-router-dom';
import { Bot, Menu, Search, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useAgentRuntime, useSubject, useTrustState } from './hooks';
import { DashboardPage } from './pages/DashboardPage';
import { CatalogPage } from './pages/CatalogPage';
import { ProductEditPage } from './pages/ProductEditPage';
import { AgentChatPage } from './pages/AgentChatPage';
import { OrdersPage } from './pages/OrdersPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { ConfigPage } from './pages/ConfigPage';
import { Button, buttonVariants } from './components/ui/button';
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
import { normalizeLoopbackUrl } from './lib/loopback';
import type { PortfolioTrustState } from './lib/trust';
import { cn } from './lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/catalog', label: 'Catalog' },
  { href: '/orders', label: 'Orders' },
  { href: '/config', label: 'Config' },
  { href: '/agent', label: 'Agent' },
] as const;

const IDENTITY_WEB_URL = normalizeLoopbackUrl(
  import.meta.env.VITE_IDENTITY_WEB_URL || 'http://127.0.0.1:43100',
);

const WALLET_BUTTON_STYLE = {
  backgroundColor: 'var(--primary)',
  color: 'var(--primary-foreground)',
  borderRadius: '999px',
  boxShadow: 'var(--wallet-shadow)',
  height: '40px',
  padding: '0 16px',
  fontSize: '0.875rem',
  fontWeight: 600,
};

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
  if (pathname.startsWith('/agent')) {
    return '/agent';
  }
  return '/dashboard';
}

function getTrustMeta(state: PortfolioTrustState, loading?: boolean) {
  if (loading) {
    return {
      label: 'Loading',
      detail: 'Checking AadhaarChain before elevated seller actions unlock.',
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
        detail: 'Trust is blocked or revoked. Review AadhaarChain before continuing.',
        className: 'bg-destructive/12 text-destructive',
        icon: ShieldX,
      };
    default:
      return {
        label: 'No identity',
        detail: 'Create a wallet-backed identity before acting as a trust-aware seller.',
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
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={href}
      onClick={onNavigate}
      className={cn(
        buttonVariants({ variant: active ? 'secondary' : 'ghost', size: 'sm' }),
        'rounded-full',
      )}
    >
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
  const trust = useTrustState(walletAddress);
  const runtime = useAgentRuntime(subjectId, walletAddress);
  const [activeControl, setActiveControl] = useState<HeaderControl>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const activePath = getActivePath(location.pathname);
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
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="min-w-0 shrink-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Seller
          </div>
          <Link to="/dashboard" className="block text-xl font-semibold tracking-[-0.04em] text-foreground">
            ONDC Seller
          </Link>
          <div className="hidden text-sm text-muted-foreground sm:block">
            Operate a trust-aware catalog and fulfillment surface.
          </div>
        </div>

        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => (
            <NavigationLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={activePath === item.href}
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

          <HeaderControlTile
            icon={Bot}
            label={`Runtime ${runtimeMeta.label}`}
            detail={runtimeMeta.detail}
            expanded={activeControl === 'runtime'}
            onExpand={() => setActiveControl('runtime')}
            className={runtimeMeta.className}
            ariaLabel="Open runtime status"
          />

          <HeaderControlTile
            icon={trustMeta.icon}
            label={`Trust ${trustMeta.label}`}
            detail={trustMeta.detail}
            href={`${IDENTITY_WEB_URL}/dashboard`}
            expanded={activeControl === 'trust'}
            onExpand={() => setActiveControl('trust')}
            className={trustMeta.className}
            ariaLabel="Open trust status"
          />

          <WalletMultiButton style={WALLET_BUTTON_STYLE} />
        </div>

        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <WalletMultiButton style={WALLET_BUTTON_STYLE} />
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
                  Move between catalog, orders, config, and agent workflows.
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
                    />
                  ))}
                </div>

                <HeaderSearch onSearch={(query) => {
                  handleSearch(query);
                  setMobileOpen(false);
                }} expanded onCollapse={() => setMobileOpen(false)} />

                <div className="flex flex-col gap-2">
                  <div className={cn('flex items-center gap-2 rounded-3xl px-3 py-2 text-sm', runtimeMeta.className)}>
                    <Bot className="size-4" />
                    <span>Runtime {runtimeMeta.label}</span>
                  </div>
                  <a
                    href={`${IDENTITY_WEB_URL}/dashboard`}
                    className={cn('flex items-center gap-2 rounded-3xl px-3 py-2 text-sm', trustMeta.className)}
                  >
                    <TrustIcon className="size-4" />
                    <span>Trust {trustMeta.label}</span>
                  </a>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export function App() {
  return (
    <div className="min-h-screen">
      <HeaderBar />
      <main className="pb-10">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/catalog/new" element={<ProductEditPage />} />
          <Route path="/catalog/:id" element={<ProductEditPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/agent" element={<AgentChatPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
