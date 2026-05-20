// ─── DX API V2 Response Types ───

export interface PegaConfig {
  pegaServer: {
    baseUrl: string;
    appAlias: string;
    apiBasePath: string;
    caseType: string;
    tokenEndpoint: string;
  };
  auth: {
    type: 'basic' | 'oauth';
    clientId?: string;
    clientSecret?: string;
    username: string;
    password: string;
  };
  phoneModels: PhoneModel[];
}

export interface PhoneModel {
  name: string;
  guid: string;
  price: string;
  retail: string;
  save: string;
  level: string;
}

// ─── DX API V2 Case Creation ───

export interface CreateCaseRequest {
  caseTypeID: string;
  content?: Record<string, unknown>;
  processID?: string;
  parentCaseID?: string;
}

export interface CreateCaseResponse {
  ID: string;
  data: CaseData;
  uiResources?: UIResources;
  assignments?: Assignment[];
  nextAssignmentInfo?: NextAssignmentInfo;
  confirmationNote?: string;
}

// ─── Case Data ───

export interface CaseData {
  caseInfo: {
    caseTypeID: string;
    ID: string;
    content: Record<string, unknown>;
    status: string;
    urgency: string;
    createTime: string;
    createdBy: string;
    lastUpdateTime: string;
    lastUpdatedBy: string;
    owner: string;
    assignments?: Assignment[];
    availableActions?: AvailableAction[];
    stage?: string;
    stageLabel?: string;
    stages?: Stage[];
  };
}

export interface Assignment {
  ID: string;
  name: string;
  instructions?: string;
  classID?: string;
  context?: string;
  canPerform?: boolean;
  isMultiStep?: boolean;
  actions?: AvailableAction[];
}

export interface AvailableAction {
  ID: string;
  name: string;
  type?: string;
  links?: {
    open?: { href: string };
  };
}

export interface Stage {
  ID: string;
  name: string;
  type: string;
  visited_status?: string;
}

export interface NextAssignmentInfo {
  ID: string;
  context: string;
}

// ─── UI Resources (View Metadata) ───

export interface UIResources {
  resources?: {
    views?: Record<string, ViewComponent[]>;
    fields?: Record<string, FieldDefinition | FieldDefinition[]>;
    datapages?: Record<string, unknown>;
    dataTypes?: Record<string, unknown>;
  };
  root?: ViewComponent;
  navigation?: {
    template?: string;
    steps?: Array<{
      ID: string;
      name: string;
      actionID: string;
      visited_status: string;
      allow_jump?: boolean;
      links?: { open?: { href: string; type: string } };
    }>;
  };
  components?: string[];
  context_data?: Record<string, unknown>;
  actionButtons?: {
    main?: Array<{ jsAction: string; name: string; actionID: string }>;
    secondary?: Array<{ jsAction: string; name: string; actionID: string }>;
  };
}

export interface ViewDefinition {
  name: string;
  config: Record<string, unknown>;
  children?: ViewComponent[];
  type: string;
}

export interface ViewComponent {
  type: string;
  config: ComponentConfig;
  children?: ViewComponent[];
}

export interface ComponentConfig {
  // Common fields
  name?: string;
  label?: string;
  value?: string;
  readOnly?: boolean;
  required?: boolean;
  disabled?: boolean;
  visibility?: boolean;
  placeholder?: string;
  helperText?: string;
  testId?: string;
  displayMode?: string;

  // Field-specific
  datasource?: DataSource;
  listType?: string;
  maxLength?: number;
  allowDecimals?: boolean;
  currencyISOCode?: string;
  dateTimeFormat?: string;

  // Layout-specific
  template?: string;
  title?: string;
  instructions?: string;
  icon?: string;
  heading?: string;
  showLabel?: boolean;
  [key: string]: unknown;
}

export interface DataSource {
  source?: string;
  fields?: {
    key?: string;
    text?: string;
    value?: string;
  };
  records?: Array<{
    key: string;
    text: string;
    value: string;
  }>;
}

export interface FieldDefinition {
  classID?: string;
  type?: string;
  label?: string;
  maxLength?: number;
  isSpecial?: boolean;
  fieldID?: string;
  datasource?: DataSource;
}

// ─── Assignment Action (Form) Response ───

export interface AssignmentActionResponse {
  data: {
    caseInfo: {
      content: Record<string, unknown>;
      assignments: Assignment[];
      [key: string]: unknown;
    };
  };
  uiResources: UIResources;
  nextAssignmentInfo?: NextAssignmentInfo;
  confirmationNote?: string;
}

// ─── Rendered Field (for form rendering) ───

export interface CardOption {
  key: string;
  text: string;
  value: string;
  image?: string;
  extraData?: Record<string, unknown>;
}

export interface RenderedField {
  type: string;
  fieldID: string;
  label: string;
  value: unknown;
  required: boolean;
  readOnly: boolean;
  disabled: boolean;
  placeholder?: string;
  helperText?: string;
  options?: Array<{ key: string; text: string; value: string }>;
  cardOptions?: CardOption[];
  maxLength?: number;
  config: ComponentConfig;
}
