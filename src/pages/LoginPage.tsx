import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageLayout, PageHeader } from '@portfolio-ui';

const IDENTITY_URL = import.meta.env.VITE_IDENTITY_URL || 'https://aadharcha.in';
const IDENTITY_WEB_URL = import.meta.env.VITE_IDENTITY_WEB_URL || IDENTITY_URL;

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get('return') || '/';

  useEffect(() => {
    const identityWebUrl = IDENTITY_WEB_URL;
    const returnTo = encodeURIComponent(window.location.origin + returnUrl);
    window.location.href = `${identityWebUrl}/login?return=${returnTo}`;
  }, [returnUrl]);

  return (
    <PageLayout>
      <PageHeader title="Logging in..." />
      <p>Redirecting to login page...</p>
    </PageLayout>
  );
}
