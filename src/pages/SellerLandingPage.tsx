import { Navigate, useLocation } from 'react-router-dom';
import { Badge, Button, Card, PageLayout, Section } from '@/components/seller-ui';
import { useAuthContext } from '../contexts/AuthContext';

type LandingLocationState = {
  returnTo?: string;
};

function safeReturnPath(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/dashboard';
}

export function SellerLandingPage() {
  const location = useLocation();
  const { isAuthenticated, loading, login } = useAuthContext();
  const returnTo = safeReturnPath((location.state as LandingLocationState | null)?.returnTo);

  if (!loading && isAuthenticated) {
    return <Navigate to={returnTo} replace />;
  }

  return (
    <PageLayout
      title="Run your store with clear control"
      subtitle="Sign in to manage listings, customer orders, protected refunds, and assistant permissions."
    >
      <Section
        eyebrow="Seller workspace"
        title="Your store data stays private until you sign in"
        description="Catalog management, customer details, payments, connection settings, and assistant authority are available only inside your authenticated workspace."
        actions={
          <Button type="button" size="lg" disabled={loading} onClick={() => login(returnTo)}>
            {loading ? 'Checking sign-in…' : 'Sign in to Seller workspace'}
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="space-y-3 border-border/70 shadow-none">
            <Badge tone="info">Catalog</Badge>
            <h2 className="text-xl font-semibold text-foreground">Keep listings buyer-ready</h2>
            <p className="text-sm text-muted-foreground">
              Update product details, whole-rupee prices, stock, and buyer-facing information.
            </p>
          </Card>
          <Card className="space-y-3 border-border/70 shadow-none">
            <Badge tone="info">Orders</Badge>
            <h2 className="text-xl font-semibold text-foreground">Act with customer context</h2>
            <p className="text-sm text-muted-foreground">
              Review payment and delivery state before accepting, fulfilling, or refunding an order.
            </p>
          </Card>
          <Card className="space-y-3 border-border/70 shadow-none">
            <Badge tone="info">AgentGuard</Badge>
            <h2 className="text-xl font-semibold text-foreground">Set assistant boundaries</h2>
            <p className="text-sm text-muted-foreground">
              Choose permitted actions and approval limits while AgentGuard checks every protected
              action.
            </p>
          </Card>
        </div>
      </Section>
    </PageLayout>
  );
}

export { safeReturnPath };
