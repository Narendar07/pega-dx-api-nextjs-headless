import pegaConfig from '../../pega-config.json';
import type {
  PegaConfig,
  CreateCaseResponse,
  AssignmentActionResponse,
  CaseData,
} from '@/types/pega';

const config = pegaConfig as PegaConfig;

// ─── OAuth Token Cache (module-level, server-side only) ───
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getOAuthToken(): Promise<string> {
  // Return cached token if still valid (30s buffer before expiry)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30000) {
    return cachedToken.accessToken;
  }

  const base = config.pegaServer.baseUrl.replace(/\/$/, '');
  const serverBase = base.includes('/prweb')
    ? base.substring(0, base.indexOf('/prweb'))
    : base;
  const tokenUrl = `${serverBase}/prweb${config.pegaServer.tokenEndpoint}`;

  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: config.auth.clientId || '',
    client_secret: config.auth.clientSecret || '',
    username: config.auth.username,
    password: config.auth.password,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OAuth token failed: ${response.status} — ${errorText}`);
  }

  const tokenData = await response.json();
  cachedToken = {
    accessToken: tokenData.access_token,
    expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
  };

  return cachedToken.accessToken;
}

async function getAuthHeader(): Promise<string> {
  if (config.auth.type === 'oauth') {
    const token = await getOAuthToken();
    return `Bearer ${token}`;
  }
  const encoded = Buffer.from(
    `${config.auth.username}:${config.auth.password}`
  ).toString('base64');
  return `Basic ${encoded}`;
}

// ─── Base URL builder ───
function apiUrl(path: string): string {
  const base = config.pegaServer.baseUrl.replace(/\/$/, '');
  const alias = config.pegaServer.appAlias;
  const prefix = alias
    ? `${base.replace('/prweb', '')}/prweb/app/${alias}${config.pegaServer.apiBasePath}`
    : `${base}${config.pegaServer.apiBasePath}`;
  return `${prefix}${path}`;
}

// ─── Common headers (async) ───
async function headers(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  return {
    Authorization: await getAuthHeader(),
    'Content-Type': 'application/json',
    ...extra,
  };
}

// ─── Generic fetch wrapper ───
async function pegaFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<{ data: T; etag?: string; status: number }> {
  const baseHeaders = await headers();
  const response = await fetch(url, {
    ...options,
    headers: {
      ...baseHeaders,
      ...(options.headers as Record<string, string>),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    if (response.status === 422) {
      const body = await response.json().catch(() => ({}));
      console.error(`Pega validation error [422]:`, body);
      const err = new Error('Pega DX API validation error') as Error & {
        statusCode: number;
        validationBody: unknown;
      };
      err.statusCode = 422;
      err.validationBody = body;
      throw err;
    }
    const errorBody = await response.text();
    console.error(`Pega API error [${response.status}]: ${errorBody}`);
    throw new Error(
      `Pega DX API error: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as T;
  const etag = response.headers.get('etag') || undefined;

  return { data, etag, status: response.status };
}

// ═══════════════════════════════════════════
// DX API V2 ENDPOINTS
// ═══════════════════════════════════════════

/**
 * GET /casetypes
 * Returns available case types for the application
 */
export async function getCaseTypes() {
  const url = apiUrl('/casetypes');
  return pegaFetch<{ caseTypes: Array<{ ID: string; name: string }> }>(url);
}

/**
 * POST /cases
 * Creates a new case with optional starting fields
 */
export async function createCase(
  caseTypeID: string,
  startingFields?: Record<string, unknown>
): Promise<{ data: CreateCaseResponse; etag?: string }> {
  const url = apiUrl('/cases');
  const body: Record<string, unknown> = { caseTypeID };

  if (startingFields && Object.keys(startingFields).length > 0) {
    body.content = startingFields;
  }

  return pegaFetch<CreateCaseResponse>(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * GET /assignments
 * Returns the current user's active worklist (open assignments).
 * /cases list endpoint returns 405 in this Pega config; the worklist
 * is the correct DX API V2 approach for "My Cases".
 */
export async function getWorklist() {
  const url = apiUrl('/assignments');
  return pegaFetch<{
    assignments: Array<{
      ID: string;
      name: string;
      urgency?: number;
      processName?: string;
      createTime?: string;
      caseID?: string;
      status?: string;
    }>;
  }>(url);
}

/**
 * GET /cases/{caseID}
 * Retrieves case details with UI metadata
 */
export async function getCase(
  caseID: string,
  viewType: 'page' | 'none' = 'page'
): Promise<{ data: CaseData; etag?: string }> {
  const url = apiUrl(`/cases/${encodeURIComponent(caseID)}?viewType=${viewType}`);
  return pegaFetch<CaseData>(url);
}

/**
 * GET /assignments/{assignmentID}
 * Retrieves assignment details
 */
export async function getAssignment(assignmentID: string) {
  const url = apiUrl(`/assignments/${encodeURIComponent(assignmentID)}`);
  return pegaFetch<AssignmentActionResponse>(url);
}

/**
 * GET /assignments/{assignmentID}/actions/{actionID}
 * Retrieves the form/view for a specific action on an assignment
 */
export async function getAssignmentAction(
  assignmentID: string,
  actionID: string
): Promise<{ data: AssignmentActionResponse; etag?: string }> {
  const url = apiUrl(
    `/assignments/${encodeURIComponent(assignmentID)}/actions/${encodeURIComponent(actionID)}`
  );
  return pegaFetch<AssignmentActionResponse>(url);
}

/**
 * PUT /assignments/{assignmentID}/actions/{actionID}
 * Submits form data for an assignment action
 */
export async function submitAssignmentAction(
  assignmentID: string,
  actionID: string,
  content: Record<string, unknown>,
  etag?: string
): Promise<{ data: AssignmentActionResponse; etag?: string }> {
  const url = apiUrl(
    `/assignments/${encodeURIComponent(assignmentID)}/actions/${encodeURIComponent(actionID)}`
  );

  const extraHeaders: Record<string, string> = {};
  if (etag) {
    extraHeaders['If-Match'] = etag;
  }

  return pegaFetch<AssignmentActionResponse>(url, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
    headers: extraHeaders,
  });
}

/**
 * PUT /cases/{caseID}
 * Updates case data
 */
export async function updateCase(
  caseID: string,
  content: Record<string, unknown>,
  etag?: string
) {
  const url = apiUrl(`/cases/${encodeURIComponent(caseID)}`);

  const extraHeaders: Record<string, string> = {};
  if (etag) {
    extraHeaders['If-Match'] = etag;
  }

  return pegaFetch(url, {
    method: 'PUT',
    body: JSON.stringify({ content }),
    headers: extraHeaders,
  });
}

/**
 * GET /data_views/{dataViewID}
 * Queries a data view / data page
 */
export async function getDataView(
  dataViewID: string,
  params?: Record<string, string>
) {
  const searchParams = new URLSearchParams(params || {});
  const query = searchParams.toString();
  const url = apiUrl(
    `/data_views/${encodeURIComponent(dataViewID)}${query ? `?${query}` : ''}`
  );
  return pegaFetch(url);
}

// ─── Config getter ───
export function getPegaConfig(): PegaConfig {
  return config;
}
