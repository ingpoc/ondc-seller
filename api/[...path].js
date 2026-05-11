import {
  evaluateProtectedSellerRequest,
  inferProtectedSellerAction,
} from '../src/lib/sellerApiRuntime.js';

const COMMERCE_API_BASE = process.env.SELLER_COMMERCE_API_BASE || process.env.VITE_API_BASE_URL || '';
const IDENTITY_API_BASE = process.env.SELLER_IDENTITY_API_BASE || process.env.VITE_IDENTITY_URL || '';
const TRUST_API_BASE = process.env.SELLER_TRUST_API_BASE || process.env.VITE_TRUST_API_URL || IDENTITY_API_BASE;

function sendJson(response, status, payload) {
  response.status(status).json(payload);
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
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

async function readJsonBody(request) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method ?? '')) {
    return {};
  }

  if (!request.body) {
    return {};
  }

  if (typeof request.body === 'object') {
    return request.body;
  }

  try {
    return JSON.parse(request.body);
  } catch {
    return {};
  }
}

async function validateSession(request) {
  if (!IDENTITY_API_BASE) {
    return { valid: false, subject_id: null, wallet_address: null };
  }

  try {
    const response = await fetch(`${IDENTITY_API_BASE}/api/auth/me`, {
      headers: {
        cookie: headerValue(request.headers, 'cookie') ?? '',
      },
    });
    if (!response.ok) {
      return { valid: false, subject_id: null, wallet_address: null };
    }

    const payload = await response.json();
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

async function fetchTrust(walletAddress, request) {
  if (!TRUST_API_BASE || !walletAddress) {
    return null;
  }

  try {
    const response = await fetch(`${TRUST_API_BASE}/api/identity/${encodeURIComponent(walletAddress)}/trust`, {
      headers: {
        cookie: headerValue(request.headers, 'cookie') ?? '',
      },
    });
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return payload?.data ?? payload;
  } catch {
    return null;
  }
}

function buildUpstreamUrl(request) {
  const incoming = new URL(request.url, `https://${request.headers.host ?? 'ondc-seller.local'}`);
  return `${COMMERCE_API_BASE}${incoming.pathname}${incoming.search}`;
}

async function proxyCommerceRequest(request, response, body) {
  if (!COMMERCE_API_BASE) {
    return sendJson(response, 503, {
      error: 'seller_commerce_backend_unconfigured',
      message: 'SELLER_COMMERCE_API_BASE or VITE_API_BASE_URL is required for seller API proxying.',
    });
  }

  const upstreamResponse = await fetch(buildUpstreamUrl(request), {
    method: request.method,
    headers: {
      'content-type': headerValue(request.headers, 'content-type') ?? 'application/json',
      cookie: headerValue(request.headers, 'cookie') ?? '',
      authorization: headerValue(request.headers, 'authorization') ?? '',
      'x-wallet-address': headerValue(request.headers, 'x-wallet-address') ?? '',
      'x-user-id': headerValue(request.headers, 'x-user-id') ?? '',
      'x-seller-protected-action': headerValue(request.headers, 'x-seller-protected-action') ?? '',
      'x-seller-required-trust-state': headerValue(request.headers, 'x-seller-required-trust-state') ?? '',
      'x-seller-trust-enforcement': headerValue(request.headers, 'x-seller-trust-enforcement') ?? '',
      'x-seller-audit-subject': headerValue(request.headers, 'x-seller-audit-subject') ?? '',
    },
    body: ['GET', 'HEAD'].includes(request.method ?? '') ? undefined : JSON.stringify(body ?? {}),
  });

  const text = await upstreamResponse.text();
  response.status(upstreamResponse.status);
  response.setHeader('content-type', upstreamResponse.headers.get('content-type') ?? 'application/json');
  response.send(text);
}

export default async function handler(request, response) {
  const incoming = new URL(request.url, `https://${request.headers.host ?? 'ondc-seller.local'}`);
  const body = await readJsonBody(request);
  const routePolicy = inferProtectedSellerAction(request.method ?? 'GET', incoming.pathname);

  if (routePolicy) {
    const session = await validateSession(request);
    const walletAddress = headerValue(request.headers, 'x-wallet-address') ?? session.wallet_address;
    const trust = await fetchTrust(walletAddress, request);
    const decision = evaluateProtectedSellerRequest({
      routePolicy,
      headers: request.headers,
      body,
      session,
      trust,
    });
    recordSellerAudit(decision.audit);

    if (!decision.allowed) {
      return sendJson(response, decision.status, {
        error: 'seller_trust_enforcement_failed',
        message: decision.reason,
      });
    }
  }

  return proxyCommerceRequest(request, response, body);
}
