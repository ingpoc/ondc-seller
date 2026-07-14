const PROTECTED_ACTIONS = {
  catalog_save: 'verified',
  catalog_delete: 'verified',
  order_accept: 'verified',
  order_reject: 'verified',
  order_dispatch: 'verified',
  seller_config_save: 'verified',
  seller_config_generate_keys: 'verified',
};

const ORDER_MUTATION_RE = /^\/api\/seller\/orders\/([^/]+)\/(accept|reject|dispatch)$/;
const CATALOG_ITEM_RE = /^\/api\/catalog\/products\/([^/]+)$/;

export function inferProtectedSellerAction(method, pathname) {
  const normalizedMethod = method.toUpperCase();

  if (pathname === '/api/catalog/products' && normalizedMethod === 'POST') {
    return { action: 'catalog_save', auditSubjectFrom: 'body_id' };
  }

  const catalogItemMatch = pathname.match(CATALOG_ITEM_RE);
  if (catalogItemMatch && (normalizedMethod === 'PUT' || normalizedMethod === 'PATCH')) {
    return { action: 'catalog_save', auditSubject: catalogItemMatch[1] };
  }

  if (catalogItemMatch && normalizedMethod === 'DELETE') {
    return { action: 'catalog_delete', auditSubject: catalogItemMatch[1] };
  }

  const orderMutationMatch = pathname.match(ORDER_MUTATION_RE);
  if (orderMutationMatch && normalizedMethod === 'POST') {
    const mutation = orderMutationMatch[2];
    return {
      action:
        mutation === 'accept'
          ? 'order_accept'
          : mutation === 'reject'
            ? 'order_reject'
            : 'order_dispatch',
      auditSubject: orderMutationMatch[1],
    };
  }

  if (pathname === '/api/seller/config' && normalizedMethod === 'POST') {
    return { action: 'seller_config_save', auditSubjectFrom: 'body_subscriber_id' };
  }

  if (pathname === '/api/seller/config/generate-keys' && normalizedMethod === 'POST') {
    return { action: 'seller_config_generate_keys', auditSubjectFrom: 'body_subscriber_id' };
  }

  return null;
}

export function normalizeHeaderValue(headers, name) {
  const key = Object.keys(headers).find((entry) => entry.toLowerCase() === name.toLowerCase());
  const value = key ? headers[key] : undefined;
  return Array.isArray(value) ? value[0] : value;
}

export function resolveAuditSubject(routePolicy, body, headers) {
  if (routePolicy.auditSubject) {
    return routePolicy.auditSubject;
  }

  const headerSubject = normalizeHeaderValue(headers, 'x-seller-audit-subject');
  if (headerSubject) {
    return headerSubject;
  }

  if (routePolicy.auditSubjectFrom === 'body_id' && body?.id) {
    return String(body.id);
  }

  if (routePolicy.auditSubjectFrom === 'body_subscriber_id' && body?.subscriberId) {
    return String(body.subscriberId);
  }

  return null;
}

export function evaluateProtectedSellerRequest({
  routePolicy,
  headers,
  body,
  session,
  trust,
}) {
  if (!routePolicy) {
    return { allowed: true, status: 200, reason: 'Public or read-only seller route.' };
  }

  const action = normalizeHeaderValue(headers, 'x-seller-protected-action');
  const requiredTrust = normalizeHeaderValue(headers, 'x-seller-required-trust-state');
  const walletAddress = normalizeHeaderValue(headers, 'x-wallet-address');
  const enforcement = normalizeHeaderValue(headers, 'x-seller-trust-enforcement');
  const userId = normalizeHeaderValue(headers, 'x-user-id') ?? null;
  const auditSubject = resolveAuditSubject(routePolicy, body, headers);
  const audit = (outcome, reason) => ({
    action: routePolicy.action,
    wallet_address: walletAddress ?? session?.wallet_address ?? null,
    subject_id: session?.subject_id ?? null,
    audit_subject_id: auditSubject,
    trust_state: trust?.trust_state ?? 'unavailable',
    outcome,
    reason,
    created_at: new Date().toISOString(),
  });

  if (!session?.valid || !session.subject_id) {
    const reason = 'A valid seller session is required.';
    return { allowed: false, status: 401, reason, audit: audit('blocked', reason) };
  }

  if (action !== routePolicy.action) {
    const reason = 'Seller protected action header does not match route.';
    return { allowed: false, status: 403, reason, audit: audit('blocked', reason) };
  }

  if (requiredTrust !== PROTECTED_ACTIONS[routePolicy.action]) {
    const reason = 'Seller protected action requires the wrong trust state.';
    return { allowed: false, status: 403, reason, audit: audit('blocked', reason) };
  }

  if (enforcement !== 'backend_must_revalidate_trust') {
    const reason = 'Seller backend must revalidate trust before mutation.';
    return { allowed: false, status: 403, reason, audit: audit('blocked', reason) };
  }

  if (!walletAddress || walletAddress !== session.wallet_address) {
    const reason = 'Seller session wallet must match the protected action wallet.';
    return { allowed: false, status: 403, reason, audit: audit('blocked', reason) };
  }

  if (userId && userId !== session.subject_id) {
    const reason = 'Seller action subject must match the active session.';
    return { allowed: false, status: 403, reason, audit: audit('blocked', reason) };
  }

  if (!auditSubject) {
    const reason = 'Seller audit subject is required.';
    return { allowed: false, status: 403, reason, audit: audit('blocked', reason) };
  }

  if (!trust) {
    const reason = 'Trust state is unavailable.';
    return { allowed: false, status: 503, reason, audit: audit('blocked', reason) };
  }

  if (trust.wallet_address !== walletAddress) {
    const reason = 'Trust wallet does not match the active session.';
    return { allowed: false, status: 403, reason, audit: audit('blocked', reason) };
  }

  if (trust.trust_state !== 'verified' || trust.high_trust_eligible !== true) {
    const reason = 'Verified seller trust or demo/Google session is required.';
    return { allowed: false, status: 403, reason, audit: audit('blocked', reason) };
  }

  const reason = 'Seller protected action passed backend trust enforcement.';
  return {
    allowed: true,
    status: 200,
    reason,
    audit: audit('allowed', reason),
  };
}
