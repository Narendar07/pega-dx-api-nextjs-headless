import { NextRequest, NextResponse } from 'next/server';
import {
  createCase,
  getCase,
  getWorklist,
  getAssignment,
  getAssignmentAction,
  submitAssignmentAction,
  getCaseTypes,
  getPegaConfig,
} from '@/lib/pega-api';

/**
 * Server-side API routes that proxy DX API calls.
 * This avoids CORS issues and keeps credentials server-side.
 *
 * POST /api/pega — handles all Pega operations via action param
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      // ─── Get available case types ───
      case 'getCaseTypes': {
        const result = await getCaseTypes();
        return NextResponse.json(result.data);
      }

      // ─── Create a new case ───
      case 'createCase': {
        const { caseTypeID, startingFields } = params;
        const result = await createCase(caseTypeID, startingFields);
        return NextResponse.json(result.data, {
          headers: result.etag ? { 'X-Pega-ETag': result.etag } : {},
        });
      }

      // ─── Worklist (user's active assignments / open cases) ───
      case 'getCases': {
        const result = await getWorklist();
        return NextResponse.json(result.data);
      }

      // ─── Get case details ───
      case 'getCase': {
        const { caseID, viewType } = params;
        const result = await getCase(caseID, viewType);
        return NextResponse.json(result.data, {
          headers: result.etag ? { 'X-Pega-ETag': result.etag } : {},
        });
      }

      // ─── Get assignment details ───
      case 'getAssignment': {
        const { assignmentID } = params;
        const result = await getAssignment(assignmentID);
        return NextResponse.json(result.data, {
          headers: result.etag ? { 'X-Pega-ETag': result.etag } : {},
        });
      }

      // ─── Get assignment action form ───
      case 'getAssignmentAction': {
        const { assignmentID, actionID } = params;
        const result = await getAssignmentAction(assignmentID, actionID);
        return NextResponse.json(result.data, {
          headers: result.etag ? { 'X-Pega-ETag': result.etag } : {},
        });
      }

      // ─── Submit assignment action ───
      case 'submitAssignmentAction': {
        const { assignmentID, actionID, content, etag } = params;
        const result = await submitAssignmentAction(
          assignmentID,
          actionID,
          content,
          etag
        );
        return NextResponse.json(result.data, {
          headers: result.etag ? { 'X-Pega-ETag': result.etag } : {},
        });
      }

      // ─── Get config (non-sensitive parts) ───
      case 'getConfig': {
        const config = getPegaConfig();
        return NextResponse.json({
          caseType: config.pegaServer.caseType,
          phoneModels: config.phoneModels,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Pega API route error:', error);
    // Forward Pega validation errors (422) to the client with original body
    const validationErr = error as Error & { statusCode?: number; validationBody?: unknown };
    if (validationErr.statusCode === 422) {
      return NextResponse.json(validationErr.validationBody, { status: 422 });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
