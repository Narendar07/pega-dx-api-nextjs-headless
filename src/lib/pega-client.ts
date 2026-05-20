'use client';

/**
 * Client-side wrapper for Pega DX API calls.
 * All calls go through /api/pega (server-side proxy)
 * so credentials never touch the browser.
 */

async function pegaCall<T>(action: string, params: Record<string, unknown> = {}): Promise<{
  data: T;
  etag?: string;
}> {
  const response = await fetch('/api/pega', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    if (response.status === 422) {
      const err = new Error('Validation error') as Error & { validationBody: unknown };
      err.validationBody = errorBody;
      throw err;
    }
    throw new Error(
      (errorBody as { error?: string }).error || `API error: ${response.status}`
    );
  }

  const data = (await response.json()) as T;
  const etag = response.headers.get('X-Pega-ETag') || undefined;

  return { data, etag };
}

// ─── Typed API methods ───

export function getConfig() {
  return pegaCall<{
    caseType: string;
    phoneModels: Array<{
      name: string;
      guid: string;
      price: string;
      retail: string;
      save: string;
      level: string;
    }>;
  }>('getConfig');
}

export function createCase(
  caseTypeID: string,
  startingFields?: Record<string, unknown>
) {
  return pegaCall('createCase', { caseTypeID, startingFields });
}

export function getCase(caseID: string, viewType: string = 'page') {
  return pegaCall('getCase', { caseID, viewType });
}

export function getAssignment(assignmentID: string) {
  return pegaCall('getAssignment', { assignmentID });
}

export function getAssignmentAction(assignmentID: string, actionID: string) {
  return pegaCall('getAssignmentAction', { assignmentID, actionID });
}

export function submitAssignmentAction(
  assignmentID: string,
  actionID: string,
  content: Record<string, unknown>,
  etag?: string
) {
  return pegaCall('submitAssignmentAction', {
    assignmentID,
    actionID,
    content,
    etag,
  });
}

export function getCases() {
  return pegaCall<{
    assignments: Array<{
      ID: string;
      name: string;
      urgency?: number;
      processName?: string;
      createTime?: string;
      caseID?: string;
      status?: string;
    }>;
  }>('getCases');
}
