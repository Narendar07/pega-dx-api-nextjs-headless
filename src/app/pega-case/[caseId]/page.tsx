'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getCase,
  getAssignment,
  getAssignmentAction,
  submitAssignmentAction,
} from '@/lib/pega-client';
import { extractFields, buildContent, extractValidationErrors } from '@/lib/metadata-interpreter';
import DynamicForm from '@/components/DynamicForm';
import type { RenderedField } from '@/types/pega';

type CaseState =
  | 'loading'
  | 'form'
  | 'completed'
  | 'no_assignments'
  | 'error';

interface StageInfo {
  ID: string;
  name: string;
  visited_status?: string;
}

interface NavStep {
  ID: string;
  name: string;
  actionID: string;
  visited_status: string;
}

interface AssignmentRef {
  assignmentID: string;
  actionID: string;
  name: string;
}

function CaseProcessingContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const caseId = params.caseId as string;

  const [state, setState] = useState<CaseState>('loading');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [fields, setFields] = useState<RenderedField[]>([]);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [currentAssignment, setCurrentAssignment] = useState<AssignmentRef | null>(null);
  const [etag, setEtag] = useState<string | undefined>();
  const [stages, setStages] = useState<StageInfo[]>([]);
  const [currentStage, setCurrentStage] = useState<string>('');
  const [navSteps, setNavSteps] = useState<NavStep[]>([]);
  const [caseStatus, setCaseStatus] = useState<string>('');
  const [confirmationNote, setConfirmationNote] = useState<string>('');
  const [rawApiResponse, setRawApiResponse] = useState<unknown>(null);
  const [rawFields, setRawFields] = useState<RenderedField[]>([]);
  const [stepHistory, setStepHistory] = useState<string[]>([]);

  // ─── Apply form data from an action response ───
  const applyActionResponse = useCallback(
    (formData: Record<string, unknown>, formEtag: string | undefined, actionID: string, assignmentID: string) => {
      const uiResources = (formData as { uiResources?: unknown }).uiResources;
      const responseData = (formData as { data?: Record<string, unknown> }).data;
      const caseInfo = (responseData as { caseInfo?: Record<string, unknown> } | undefined)?.caseInfo || {};
      const content = (caseInfo as { content?: Record<string, unknown> }).content || {};

      const stagesData = (caseInfo as { stages?: StageInfo[] }).stages || [];
      if (stagesData.length > 0) setStages(stagesData);

      const stageLabel = (caseInfo as { stageLabel?: string }).stageLabel || '';
      if (stageLabel) setCurrentStage(stageLabel);

      const status = (caseInfo as { status?: string }).status || '';
      if (status) setCaseStatus(status);

      // Multi-step navigation within the assignment
      const navStepsData = (uiResources as { navigation?: { steps?: NavStep[] } } | undefined)
        ?.navigation?.steps || [];
      if (navStepsData.length > 0) setNavSteps(navStepsData);

      console.log('=== UI RESOURCES ===', JSON.stringify(uiResources, null, 2));
      console.log('=== CASE CONTENT ===', JSON.stringify(content, null, 2));

      const extractedFields = extractFields(
        uiResources as never,
        content,
        responseData
      );
      console.log('=== EXTRACTED FIELDS ===', JSON.stringify(extractedFields, null, 2));
      setRawFields(extractedFields);
      setFields(extractedFields);
      setEtag(formEtag);

      // Find action name for step history
      const assignments = (caseInfo as { assignments?: Array<{ actions?: Array<{ ID: string; name: string }> }> }).assignments || [];
      const action = assignments[0]?.actions?.find((a) => a.ID === actionID);
      const actionName = action?.name || actionID;

      setCurrentAssignment({ assignmentID, actionID, name: actionName });
      setStepHistory((prev) => [...prev, actionName]);
      setRawApiResponse(formData);
      setState('form');
    },
    []
  );

  // ─── Fallback: load case → find assignment → get action form ───
  const loadFromCase = useCallback(async () => {
    const decodedCaseId = decodeURIComponent(caseId);

    const caseResult = await getCase(decodedCaseId);
    const caseData = caseResult.data as Record<string, unknown>;
    console.log('=== GET CASE RESPONSE ===', JSON.stringify(caseData, null, 2));
    setRawApiResponse(caseData);

    const caseInfo =
      (caseData as { data?: { caseInfo?: Record<string, unknown> } }).data?.caseInfo ||
      (caseData as { caseInfo?: Record<string, unknown> }).caseInfo ||
      {};

    const status = (caseInfo as { status?: string }).status || '';
    setCaseStatus(status);

    const stagesData = (caseInfo as { stages?: StageInfo[] }).stages || [];
    setStages(stagesData);
    setCurrentStage((caseInfo as { stageLabel?: string }).stageLabel || '');

    const assignments =
      (caseInfo as { assignments?: Array<Record<string, unknown>> }).assignments || [];

    if (assignments.length === 0) {
      setState('no_assignments');
      return;
    }

    const assignment = assignments[0];
    const assignmentID = assignment.ID as string;

    const assignResult = await getAssignment(assignmentID);
    const assignData = assignResult.data as Record<string, unknown>;
    console.log('=== GET ASSIGNMENT RESPONSE ===', JSON.stringify(assignData, null, 2));

    const actions =
      (assignData as {
        data?: { caseInfo?: { assignments?: Array<{ actions?: Array<{ ID: string; name: string }> }> } };
      }).data?.caseInfo?.assignments?.[0]?.actions || [];
    const firstAction = actions[0];

    if (!firstAction) {
      setError('No available actions for this assignment');
      setRawApiResponse(assignData);
      setState('error');
      return;
    }

    const actionID = firstAction.ID;
    const formResult = await getAssignmentAction(assignmentID, actionID);
    const formData = formResult.data as Record<string, unknown>;
    console.log('=== GET ASSIGNMENT ACTION RESPONSE ===', JSON.stringify(formData, null, 2));

    applyActionResponse(formData, formResult.etag, actionID, assignmentID);
  }, [caseId, applyActionResponse]);

  // ─── Primary loader ───
  const loadCase = useCallback(async () => {
    try {
      setState('loading');
      setError('');

      const urlAssignmentID = searchParams.get('assignmentID');
      const urlActionID = searchParams.get('actionID');

      if (urlAssignmentID && urlActionID) {
        // Fast path: use query params from createCase response
        const formResult = await getAssignmentAction(urlAssignmentID, urlActionID);
        const formData = formResult.data as Record<string, unknown>;
        console.log('=== GET ASSIGNMENT ACTION (fast path) ===', JSON.stringify(formData, null, 2));
        applyActionResponse(formData, formResult.etag, urlActionID, urlAssignmentID);
      } else {
        await loadFromCase();
      }
    } catch (err) {
      console.error('Error loading case:', err);
      setError(err instanceof Error ? err.message : 'Failed to load case');
      setState('error');
    }
  }, [caseId, searchParams, applyActionResponse, loadFromCase]);

  useEffect(() => {
    loadCase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  // ─── Submit form ───
  const handleSubmit = async (formData: Record<string, unknown>) => {
    if (!currentAssignment) return;

    try {
      setSubmitting(true);
      setValidationErrors({});

      const content = buildContent(formData);

      const result = await submitAssignmentAction(
        currentAssignment.assignmentID,
        currentAssignment.actionID,
        content,
        etag
      );

      const responseData = result.data as Record<string, unknown>;
      console.log('=== SUBMIT ASSIGNMENT ACTION RESPONSE ===', JSON.stringify(responseData, null, 2));
      setRawApiResponse(responseData);

      const note = (responseData as { confirmationNote?: string }).confirmationNote;
      if (note) {
        setConfirmationNote(note);
        setSubmitting(false);
        setState('completed');
        return;
      }

      const nextAssignment = (responseData as {
        nextAssignmentInfo?: { ID: string; context: string };
      }).nextAssignmentInfo;

      if (nextAssignment) {
        // Load next assignment form directly if we can get its actions
        const assignResult = await getAssignment(nextAssignment.ID);
        const assignData = assignResult.data as Record<string, unknown>;
        console.log('=== GET NEXT ASSIGNMENT ===', JSON.stringify(assignData, null, 2));

        const actions =
          (assignData as {
            data?: { caseInfo?: { assignments?: Array<{ actions?: Array<{ ID: string; name: string }> }> } };
          }).data?.caseInfo?.assignments?.[0]?.actions || [];
        const firstAction = actions[0];

        if (firstAction) {
          const formResult = await getAssignmentAction(nextAssignment.ID, firstAction.ID);
          const formResponseData = formResult.data as Record<string, unknown>;
          console.log('=== GET NEXT ACTION FORM ===', JSON.stringify(formResponseData, null, 2));
          applyActionResponse(formResponseData, formResult.etag, firstAction.ID, nextAssignment.ID);
          return;
        }
      }

      // Fallback: reload from case
      await loadFromCase();
    } catch (err) {
      const validationErr = err as Error & { validationBody?: unknown };
      if (validationErr.validationBody) {
        console.log('=== FULL 422 BODY ===', JSON.stringify(validationErr.validationBody, null, 2));
        setRawApiResponse(validationErr.validationBody);
        const fieldErrors = extractValidationErrors(validationErr.validationBody);
        console.log('=== VALIDATION ERRORS ===', fieldErrors);
        if (Object.keys(fieldErrors).length > 0) {
          // Has field-level OR _form-level errors — stay on form and show them
          setValidationErrors(fieldErrors);
          setSubmitting(false);
          return;
        }
        // Pega returned 422 with an unrecognised body — show it in error state
        setError('Pega returned a validation error. See Raw API Inspector for details.');
        setState('error');
        setSubmitting(false);
        return;
      }
      console.error('Error submitting form:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit');
      setState('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => router.push('/');

  // ─── Stage Progress Bar ───
  const StageProgressBar = () => {
    if (stages.length === 0) return null;
    return (
      <div className="mb-8">
        <div className="flex items-center">
          {stages.map((stage, idx) => {
            const isActive = stage.name === currentStage;
            const isVisited = stage.visited_status === 'visited';
            return (
              <div key={stage.ID} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium
                      ${isActive
                        ? 'bg-blue-600 text-white'
                        : isVisited
                          ? 'bg-green-100 text-green-700 border-2 border-green-500'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                  >
                    {isVisited && !isActive ? '✓' : idx + 1}
                  </div>
                  <span className={`text-xs mt-1 ${isActive ? 'font-semibold text-blue-600' : 'text-gray-500'}`}>
                    {stage.name}
                  </span>
                </div>
                {idx < stages.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-2 ${isVisited ? 'bg-green-400' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Multi-step nav bar (steps within an assignment) ───
  const NavStepBar = () => {
    if (navSteps.length === 0) return null;
    return (
      <div className="mb-6 flex items-center gap-0 overflow-x-auto">
        {navSteps.map((step, idx) => {
          const isCurrent = step.visited_status === 'current';
          const isDone = step.visited_status === 'visited' || step.visited_status === 'completed';
          return (
            <div key={step.ID} className="flex items-center shrink-0">
              <div
                className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap
                  ${isCurrent
                    ? 'bg-blue-600 text-white'
                    : isDone
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
              >
                {step.name}
              </div>
              {idx < navSteps.length - 1 && (
                <div className="w-6 h-px bg-gray-300 mx-1 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ─── Raw API Inspector ───
  const RawApiInspector = () => (
    <details className="mt-6" open>
      <summary className="text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-700 select-none">
        Raw API Inspector (debug)
      </summary>
      <div className="mt-3 space-y-4">
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">Extracted Fields</p>
          <pre className="bg-gray-900 text-green-400 text-xs p-4 rounded-lg overflow-auto max-h-64">
            {JSON.stringify(rawFields, null, 2)}
          </pre>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">Full DX API Response</p>
          <pre className="bg-gray-900 text-green-400 text-xs p-4 rounded-lg overflow-auto max-h-96">
            {JSON.stringify(rawApiResponse, null, 2)}
          </pre>
        </div>
      </div>
    </details>
  );

  // ─── Render: loading / submitting ───
  if (state === 'loading' || submitting) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent" />
          <p className="mt-4 text-gray-600">
            {submitting ? 'Submitting...' : 'Loading case...'}
          </p>
        </div>
      </div>
    );
  }

  // ─── Render: error ───
  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-red-200 p-8">
            <div className="text-red-600 text-lg font-semibold mb-2">Error</div>
            <p className="text-gray-700 text-sm mb-4">{error}</p>
            <div className="text-xs text-gray-400 mb-4 font-mono bg-gray-50 p-3 rounded-lg break-all">
              Case ID: {decodeURIComponent(caseId)}
            </div>
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => loadCase()}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                Retry
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
              >
                Back to Home
              </button>
            </div>
            <RawApiInspector />
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: no assignments ───
  if (state === 'no_assignments') {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-8">
            <div className="text-amber-700 text-lg font-semibold mb-2">No Open Assignments</div>
            <p className="text-gray-600 text-sm mb-2">
              This case has no pending assignments. It may already be resolved or waiting on a process step.
            </p>
            <p className="text-xs text-gray-400 font-mono mb-4 bg-gray-50 p-3 rounded-lg break-all">
              {decodeURIComponent(caseId)}
            </p>
            {caseStatus && (
              <p className="text-sm text-gray-600 mb-4">
                Status: <span className="font-medium">{caseStatus}</span>
              </p>
            )}
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => loadCase()}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                Refresh
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
              >
                Back to Home
              </button>
            </div>
            <RawApiInspector />
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: completed ───
  if (state === 'completed') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-sm border border-green-200 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Case Completed</h2>
          {confirmationNote && (
            <p className="text-gray-600 text-sm mb-4">{confirmationNote}</p>
          )}
          <p className="text-xs text-gray-400 mb-6 font-mono">{decodeURIComponent(caseId)}</p>
          <button
            onClick={handleCancel}
            className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // ─── Render: form ───
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={handleCancel}
            className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-flex items-center gap-1"
          >
            ← Back to Home
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {currentAssignment?.name || 'Processing Case'}
              </h1>
              <p className="text-xs text-gray-400 font-mono mt-1">
                {decodeURIComponent(caseId)}
              </p>
            </div>
            {caseStatus && (
              <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                {caseStatus}
              </span>
            )}
          </div>
        </div>

        {/* Stage Progress */}
        <StageProgressBar />
        <NavStepBar />

        {/* Step History */}
        {stepHistory.length > 1 && (
          <div className="flex items-center gap-2 mb-6 text-xs text-gray-400">
            {stepHistory.map((step, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span>→</span>}
                <span className={i === stepHistory.length - 1 ? 'text-blue-600 font-medium' : ''}>
                  {step}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Form Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
          {fields.length > 0 ? (
            <DynamicForm
              fields={fields}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              isSubmitting={submitting}
              errors={validationErrors}
            />
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg mb-2">No form fields returned</p>
              <p className="text-sm">
                The DX API returned a response but the metadata interpreter could not extract
                renderable fields. Check the Raw API Inspector below.
              </p>
            </div>
          )}
        </div>

        {/* Raw API Inspector */}
        <RawApiInspector />
      </div>
    </div>
  );
}

export default function CaseProcessingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent" />
        </div>
      }
    >
      <CaseProcessingContent />
    </Suspense>
  );
}
