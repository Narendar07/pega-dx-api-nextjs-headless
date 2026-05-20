import type {
  UIResources,
  ViewComponent,
  RenderedField,
  ComponentConfig,
  CardOption,
} from '@/types/pega';

const COMPONENT_TYPE_MAP: Record<string, string> = {
  TextInput: 'text',
  TextArea: 'textarea',
  Phone: 'phone',
  Email: 'email',
  URL: 'url',
  Integer: 'integer',
  Decimal: 'decimal',
  Currency: 'currency',
  Percentage: 'percentage',
  Boolean: 'checkbox',
  Checkbox: 'checkbox',
  RadioButtons: 'radio',
  RadioButtonGroup: 'radio',
  Dropdown: 'dropdown',
  DropDown: 'dropdown',
  AutoComplete: 'autocomplete',
  Date: 'date',
  DateTime: 'datetime',
  Time: 'time',
  Attachment: 'attachment',
  RichText: 'richtext',
  DisplayText: 'display',
  // Layout types — recurse into children
  View: 'view',
  Region: 'region',
  FlowContainer: 'flowcontainer',
  DefaultForm: 'defaultform',
  Stages: 'stages',
  Reference: 'reference',
  CaseView: 'caseview',
  CaseSummary: 'casesummary',
  FieldGroup: 'region',
  FieldGroupList: 'region',
  DeferLoad: 'region',
  Group: 'region',
  Column: 'region',
  Columns: 'region',
  Grid: 'region',
  Table: 'region',
  ScrollContainer: 'region',
};

const LAYOUT_TYPES = new Set([
  'view', 'region', 'flowcontainer', 'defaultform',
  'reference', 'stages', 'caseview', 'casesummary',
]);

function extractPropertyRef(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/^@[A-Z]+\s+/, '').replace(/^\./, '').trim();
}

function resolveLocaleLabel(raw: string): string {
  // "@L Phone" → "Phone"  |  "@FL .ModelName" → "Model Name"  |  "@L .PhoneModelss" → "Phone Modelss"
  const stripped = raw.replace(/^@[A-Z]+\s+\.?/, '').trim();
  return stripped
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function resolveLabel(config: ComponentConfig): string {
  const raw = config.label || config.name || '';
  if (typeof raw === 'string' && (raw.startsWith('@FL ') || raw.startsWith('@L '))) {
    return resolveLocaleLabel(raw);
  }
  return String(raw);
}

/**
 * Walks uiResources, resolving named view references from resources.views,
 * and extracts renderable fields (including card-radio from DataReference views).
 *
 * fullResponseData is the entire `data` object from the DX API response — needed
 * to resolve data page results for datasource-driven RadioButtons.
 */
export function extractFields(
  uiResources: UIResources | undefined,
  caseContent: Record<string, unknown> = {},
  fullResponseData?: Record<string, unknown>
): RenderedField[] {
  if (!uiResources) {
    console.log('[metadata] uiResources is undefined');
    return [];
  }
  if (!uiResources.root) {
    console.log('[metadata] uiResources.root missing. Keys:', Object.keys(uiResources));
    return [];
  }

  const viewRegistry = uiResources.resources?.views ?? {};
  const fields: RenderedField[] = [];

  // Resolve data page list results from data.shared.<pageName>.<pageName>.<field>
  function getDataPageResults(sourceRef: string): Array<Record<string, unknown>> {
    // "@DATASOURCE D_PhoneModelsList.pxResults"
    const m = sourceRef.match(/@DATASOURCE\s+(\w+)\.(\w+)/);
    if (!m) return [];
    const [, pageName, field] = m;
    try {
      const shared = (fullResponseData as Record<string, unknown> | undefined)?.shared as
        Record<string, Record<string, Record<string, unknown>>> | undefined;
      const results = shared?.[pageName]?.[pageName]?.[field];
      return Array.isArray(results) ? (results as Array<Record<string, unknown>>) : [];
    } catch {
      return [];
    }
  }

  function walkComponent(component: ViewComponent, sectionLabel?: string) {
    const { type, config, children } = component;
    if (!type) return;

    // ── Named view reference ──────────────────────────────────────────────────
    if (type === 'reference' || type === 'Reference') {
      const viewName = config?.name as string | undefined;

      // Inherited props can carry the section label (e.g. "@L Phone")
      const inheritedProps = config?.inheritedProps as
        Array<{ prop: string; value: string }> | undefined;
      const inheritedLabelRaw = inheritedProps?.find((p) => p.prop === 'label')?.value;
      const resolvedLabel = inheritedLabelRaw
        ? resolveLocaleLabel(inheritedLabelRaw)
        : sectionLabel;

      if (viewName && viewRegistry[viewName]) {
        viewRegistry[viewName].forEach((v) => walkComponent(v, resolvedLabel));
      } else {
        children?.forEach((c) => walkComponent(c, resolvedLabel));
      }
      return;
    }

    const mappedType = COMPONENT_TYPE_MAP[type];

    if (!mappedType) {
      console.log(`[metadata] Unknown type: "${type}"`, config?.name ?? '');
    }

    // ── Layout containers ─────────────────────────────────────────────────────
    if (LAYOUT_TYPES.has(mappedType ?? '')) {
      children?.forEach((c) => walkComponent(c, sectionLabel));
      return;
    }

    // ── RadioButtons (simple or card-style) ───────────────────────────────────
    if (type === 'RadioButtons' || type === 'RadioButtonGroup') {
      if (!config) return;

      const fieldID = extractPropertyRef(config.value as string | undefined ?? '');
      console.log(`[metadata] RadioButtons: fieldID="${fieldID}" variant="${config.variant}" value="${config.value}"`);

      if (!fieldID) {
        children?.forEach((c) => walkComponent(c, sectionLabel));
        return;
      }

      type DsConfig = {
        source?: string;
        fields?: { key?: string; text?: string; value?: string };
        records?: Array<{ key: string; text?: string; value: string }>;
      };
      const rawDs = config.datasource;

      let options: Array<{ key: string; text: string; value: string }> = [];
      let cardOptions: CardOption[] | undefined;

      if (typeof rawDs === 'string' && (rawDs as string).includes('@ASSOCIATED')) {
        // Options live in the field definition (resources.fields), not a data page
        const fieldDefs = uiResources?.resources?.fields?.[fieldID];
        const defArr = Array.isArray(fieldDefs) ? fieldDefs : (fieldDefs ? [fieldDefs] : []);
        const records = (defArr[0]?.datasource as DsConfig | undefined)?.records;
        if (records) {
          options = records.map((r) => ({ key: r.key, text: r.text ?? r.key, value: r.value }));
        }
      } else {
        const ds = rawDs as DsConfig | undefined;
        if (ds?.records) {
          options = ds.records.map((r) => ({ key: r.key, text: r.text ?? r.key, value: r.value }));
        } else if (ds?.source) {
          const results = getDataPageResults(ds.source);
          const keyField = extractPropertyRef(ds.fields?.key ?? '');
          const textField = extractPropertyRef(ds.fields?.text ?? '');
          const valField = extractPropertyRef(ds.fields?.value ?? '');

          options = results.map((r) => ({
            key: String(r[keyField] ?? ''),
            text: String(r[textField] ?? ''),
            value: String(r[valField] ?? ''),
          }));

          if (config.variant === 'card') {
            // "@P .PhoneModelss.PhoneImage" → last segment "PhoneImage"
            const imgRef = config.image as string | undefined;
            const imgField = imgRef
              ? extractPropertyRef(imgRef).split('.').pop() ?? ''
              : '';

            cardOptions = results.map((r) => ({
              key: String(r[keyField] ?? ''),
              text: String(r[textField] ?? ''),
              value: String(r[valField] ?? ''),
              image: imgField && r[imgField] ? String(r[imgField]) : undefined,
              extraData: r,
            }));
          }
        }
      }

      const label = sectionLabel || resolveLabel(config);

      fields.push({
        type: cardOptions ? 'card-radio' : 'radio',
        fieldID,
        label,
        value: getNestedValue(caseContent, fieldID),
        required: Boolean(config.required),
        readOnly: Boolean(config.readOnly),
        disabled: Boolean(config.disabled),
        options,
        cardOptions,
        config,
      });
      return;
    }

    // ── Regular scalar fields ─────────────────────────────────────────────────
    if (mappedType && config) {
      const fieldID = extractPropertyRef(config.value as string | undefined ?? '');
      console.log(`[metadata] Field: type="${type}" fieldID="${fieldID}"`);

      if (!fieldID) {
        children?.forEach((c) => walkComponent(c, sectionLabel));
        return;
      }

      const field: RenderedField = {
        type: mappedType,
        fieldID,
        label: resolveLabel(config),
        value: getNestedValue(caseContent, fieldID),
        required: Boolean(config.required),
        readOnly: Boolean(config.readOnly),
        disabled: Boolean(config.disabled),
        placeholder: config.placeholder as string | undefined,
        helperText: config.helperText as string | undefined,
        maxLength: config.maxLength as number | undefined,
        config,
      };

      type InlineDsConfig = { records?: Array<{ key: string; text: string; value: string }> };
      const inlineDs = config.datasource as InlineDsConfig | undefined;
      if (inlineDs?.records) field.options = inlineDs.records;

      fields.push(field);
    }

    children?.forEach((c) => walkComponent(c, sectionLabel));
  }

  walkComponent(uiResources.root);
  return fields;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

export function buildContent(
  formData: Record<string, unknown>
): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(formData)) {
    if (key.includes('.')) {
      const parts = key.split('.');
      let current: Record<string, unknown> = content;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]] = value;
    } else {
      content[key] = value;
    }
  }
  return content;
}

export function extractValidationErrors(
  errorResponse: unknown
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!errorResponse || typeof errorResponse !== 'object') return errors;

  const body = errorResponse as Record<string, unknown>;

  // Format 1: errorDetails[] — Pega DX API V2
  // fieldID is sometimes present directly; otherwise reconstruct from erroneousInput* keys
  if (Array.isArray(body.errorDetails)) {
    (body.errorDetails as Array<{
      message?: string;
      fieldID?: string;
      ValidationMessages?: string;
      erroneousInputOutputFieldInPage?: string;   // e.g. ".PaymentInfo"
      erroneousInputOutputIdentifier?: string;     // e.g. ".CardNumber"
    }>).forEach((d) => {
      const msg = d.message || d.ValidationMessages || '';

      let fieldID = d.fieldID;
      if (!fieldID && d.erroneousInputOutputFieldInPage && d.erroneousInputOutputIdentifier) {
        // ".PaymentInfo" + ".CardNumber" → "PaymentInfo.CardNumber"
        const page = d.erroneousInputOutputFieldInPage.replace(/^\./, '');
        const field = d.erroneousInputOutputIdentifier.replace(/^\./, '');
        fieldID = page ? `${page}.${field}` : field;
      }

      if (fieldID && msg) {
        errors[fieldID] = msg;
      } else if (msg) {
        errors['_form'] = errors['_form'] ? `${errors['_form']}; ${msg}` : msg;
      }
    });
    if (Object.keys(errors).length > 0) return errors;
  }

  // Format 2: errors[]
  if (Array.isArray(body.errors)) {
    (body.errors as Array<{ message?: string }>).forEach((e) => {
      if (e.message) errors['_form'] = errors['_form'] ? `${errors['_form']}; ${e.message}` : e.message;
    });
    if (Object.keys(errors).length > 0) return errors;
  }

  // Format 3: top-level message
  if (typeof body.message === 'string' && body.message) {
    errors['_form'] = body.message;
  }

  return errors;
}
