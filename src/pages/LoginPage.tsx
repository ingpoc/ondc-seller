import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageLayout, PageHeader } from '@/components/seller-ui';
import { IDENTITY_WEB_URL } from '@/lib/identityUrls';

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
