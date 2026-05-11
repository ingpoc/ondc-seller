import {
  evaluateProtectedSellerRequest,
  inferProtectedSellerAction,
} from '../../src/lib/sellerApiRuntime.js';

const COMMERCE_API_BASE = process.env.SELLER_COMMERCE_API_BASE || process.env.VITE_API_BASE_URL || '';
const IDENTITY_API_BASE = process.env.SELLER_IDENTITY_API_BASE || process.env.VITE_IDENTITY_URL || '';
const TRUST_API_BASE = process.env.SELLER_TRUST_API_BASE || process.env.VITE_TRUST_API_URL || IDENTITY_API_BASE;

function response(statusCode, payload, headers = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  };
}

function recordSellerAudit(audit) {
  if (!audit) {
    return;
  }

  console.info(JSON.stringify({
    type: 'seller_trust_enforcement_audit',
    ...audit,
  }));
}

function headerValue(headers, name) {
  const key = Object.keys(headers ?? {}).find((entry) => entry.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

function normalizeApiPath(event) {
  const rawPath = event.rawUrl ? new URL(event.rawUrl).pathname : event.path;
  const prefix = '/.netlify/functions/api';
  if (rawPath.startsWith(prefix)) {
    const suffix = rawPath.slice(prefix.length);
    return suffix.startsWith('/api/') ? suffix : `/api${suffix}`;
  }
  return rawPath;
}

function readJsonBody(event) {
  if (!event.body) {
    return {};
  }

  try {
    return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
  } catch {
    return {};
  }
}

async function validateSession(event) {
  if (!IDENTITY_API_BASE) {
    return { valid: false, subject_id: null, wallet_address: null };
  }

  try {
    const authResponse = await fetch(`${IDENTITY_API_BASE}/api/auth/me`, {
      headers: {
        cookie: headerValue(event.headers, 'cookie') ?? '',
      },
    });
    if (!authResponse.ok) {
      return { valid: false, subject_id: null, wallet_address: null };
    }

    const payload = await authResponse.json();
    const user = payload?.data ?? payload?.user ?? payload;
    return {
      valid: Boolean(user?.wallet_address || user?.walletAddress),
      subject_id: user?.id ?? user?.subject_id ?? user?.wallet_address ?? user?.walletAddress ?? null,
      wallet_address: user?.wallet_address ?? user?.walletAddress ?? null,
    };
  } catch {
    return { valid: false, subject_id: null, wallet_address: null };
  }
}

async function fetchTrust(walletAddress, event) {
  if (!TRUST_API_BASE || !walletAddress) {
    return null;
  }

  try {
    const trustResponse = await fetch(`${TRUST_API_BASE}/api/identity/${encodeURIComponent(walletAddress)}/trust`, {
      headers: {
        cookie: headerValue(event.headers, 'cookie') ?? '',
      },
    });
    if (!trustResponse.ok) {
      return null;
    }

    const payload = await trustResponse.json();
    return payload?.data ?? payload;
  } catch {
    return null;
  }
}

async function proxyCommerce(event, pathname, body) {
  if (!COMMERCE_API_BASE) {
    return response(503, {
      error: 'seller_commerce_backend_unconfigured',
      message: 'SELLER_COMMERCE_API_BASE or VITE_API_BASE_URL is required for seller API proxying.',
    });
  }

  const query = event.rawUrl ? new URL(event.rawUrl).search : '';
  const upstreamResponse = await fetch(`${COMMERCE_API_BASE}${pathname}${query}`, {
    method: event.httpMethod,
    headers: {
      'content-type': headerValue(event.headers, 'content-type') ?? 'application/json',
      cookie: headerValue(event.headers, 'cookie') ?? '',
      authorization: headerValue(event.headers, 'authorization') ?? '',
      'x-wallet-address': headerValue(event.headers, 'x-wallet-address') ?? '',
      'x-user-id': headerValue(event.headers, 'x-user-id') ?? '',
      'x-seller-protected-action': headerValue(event.headers, 'x-seller-protected-action') ?? '',
      'x-seller-required-trust-state': headerValue(event.headers, 'x-seller-required-trust-state') ?? '',
      'x-seller-trust-enforcement': headerValue(event.headers, 'x-seller-trust-enforcement') ?? '',
      'x-seller-audit-subject': headerValue(event.headers, 'x-seller-audit-subject') ?? '',
    },
    body: ['GET', 'HEAD'].includes(event.httpMethod) ? undefined : JSON.stringify(body ?? {}),
  });

  return {
    statusCode: upstreamResponse.status,
    headers: {
      'content-type': upstreamResponse.headers.get('content-type') ?? 'application/json',
    },
    body: await upstreamResponse.text(),
  };
}

export async function handler(event) {
  const pathname = normalizeApiPath(event);
  const body = readJsonBody(event);
  const routePolicy = inferProtectedSellerAction(event.httpMethod ?? 'GET', pathname);

  if (routePolicy) {
    const session = await validateSession(event);
    const walletAddress = headerValue(event.headers, 'x-wallet-address') ?? session.wallet_address;
    const trust = await fetchTrust(walletAddress, event);
    const decision = evaluateProtectedSellerRequest({
      routePolicy,
      headers: event.headers,
      body,
      session,
      trust,
    });
    recordSellerAudit(decision.audit);

    if (!decision.allowed) {
      return response(decision.status, {
        error: 'seller_trust_enforcement_failed',
        message: decision.reason,
      });
    }
  }

  return proxyCommerce(event, pathname, body);
}
