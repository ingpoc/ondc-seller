import { Fragment } from 'react';
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { AppShell, Badge, RollingSearch, type NavItem } from '@portfolio-ui';
import { DashboardPage } from './pages/DashboardPage';
import { CatalogPage } from './pages/CatalogPage';
import { ProductEditPage } from './pages/ProductEditPage';
import { AgentChatPage } from './pages/AgentChatPage';
import { OrdersPage } from './pages/OrdersPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { ConfigPage } from './pages/ConfigPage';
import { useAgentRuntime } from './hooks/useAgentEntitlement';
import { useTrustState } from './hooks/useTrustState';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { TrustStatusChip } from './components/TrustStatus';

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/catalog', label: 'Catalog' },
  { href: '/orders', label: 'Orders' },
  { href: '/config', label: 'Config' },
  { href: '/agent', label: 'Agent' },
];

const WALLET_BUTTON_STYLE = {
  backgroundColor: 'var(--ui-primary)',
  borderRadius: '999px',
  boxShadow: '0 10px 24px rgba(234,106,42,0.24)',
  height: '44px',
  padding: '0 18px',
  fontSize: '0.875rem',
  fontWeight: 700,
};

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

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { publicKey } = useWallet();
  const { user } = useAuthContext();
  const walletAddress = publicKey?.toBase58() ?? null;
  const subjectId = user?.wallet_address ?? walletAddress;
  const trust = useTrustState(walletAddress);
  const runtime = useAgentRuntime(subjectId, walletAddress);

  const handleSearch = (query: string) => {
    navigate(`/catalog?q=${encodeURIComponent(query)}`);
  };

  return (
    <AppShell
      brand={{
        name: 'ONDC Seller',
        href: '/dashboard',
        tagline: 'Operate a trust-aware catalog for verified commerce.',
      }}
      navItems={NAV_ITEMS}
      activePath={getActivePath(location.pathname)}
      renderLink={(item, className, isActive, onNavigate) => (
        <Link
          key={item.href}
          to={item.href}
          className={className}
          aria-current={isActive ? 'page' : undefined}
          onClick={onNavigate}
        >
          {item.label}
        </Link>
      )}
      headerSearch={<RollingSearch onSearch={handleSearch} />}
      actions={
        <Fragment>
          {subjectId ? (
            <Badge tone={runtime.runtime_available ? 'success' : 'warning'}>
              {runtime.loading ? 'Runtime loading' : `Runtime ${runtime.auth_mode}`}
            </Badge>
          ) : null}
          {walletAddress ? (
            <TrustStatusChip state={trust.state} loading={trust.loading} />
          ) : null}
          <WalletMultiButton style={WALLET_BUTTON_STYLE} />
        </Fragment>
      }
    >
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
    </AppShell>
  );
}
