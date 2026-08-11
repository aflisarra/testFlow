export interface PlanTestDto {
  _id?: string
  contenu: string
  ordre: number
  testSuiteId: string
  createdAt?: string
}

export interface TestPlanDto {
  id: string
  title: string
  description: string
  module?: string | null
  testCases?: TestCaseDto[]
  casesCount?: number
  objective?: string   // ← nouveau
  scope?: string       // ← nouveau
  priority?: string    // ← nouveau
  requirements?: {     // ← nouveau
    id?: string
    title?: string
    description?: string
    source?: string
    priority?: string
  }[]
  
}

export interface GeneratePlanResponse {
  testSuiteId: string
  projectId?: string
  pendingReviewCount?: number
  testPlans?: TestPlanDto[]
  steps?: string[]
  plans?: PlanTestDto[]
  reused?: boolean
}


export interface CreateSuitePayload {
  projectId: string
  name: string
  testPlans: TestPlanDto[]
  planStatuses: Record<string, string> // ✅ enlever any
  specText?: string
  fileName?: string
}


export interface CreatedBy {
  userId?: string
  name?: string
  picture?: string
}

export interface ExecutionModelTargetDto {
  kind?: string
  name?: string
  role?: string | null
  url?: string | null
  path?: string | null
  method?: string | null
}

export interface ExecutionModelValueDto {
  source?: string
  key?: string | null
  text?: string | null
}

export interface ExecutionModelAssertionDto {
  kind?: string
  expected?: unknown
}

export interface ExecutionModelStepDto {
  id?: string
  raw?: string
  channel?: 'ui' | 'api' | 'assertion' | 'data' | 'unknown' | string
  action?: string
  target?: ExecutionModelTargetDto
  value?: ExecutionModelValueDto | null
  assertion?: ExecutionModelAssertionDto | null
  requires?: string[]
}

export interface ExecutionModelDto {
  version?: string
  source?: Record<string, unknown>
  preconditions?: string[]
  steps?: ExecutionModelStepDto[]
  expected_result?: string
  confidence?: string
}

export interface TestCaseStepDetailDto {
  step: string
  expected_result?: string
  actual_result?: string
  status?: 'pending' | 'passed' | 'failed_execution' | 'failed_assertion' | 'skipped'
  
}


export interface TestCaseDto {
  id: string
  title: string
  steps: string[]
  expected_result: string

  planId?: string
  testSuiteId?: string

  // ✅ Nouveaux champs Selenium-utiles
  objective?: string
  preconditions?: string[]
  requirements?: {
    id?: string
    title?: string
    description?: string
    source?: string
    priority?: string
  }[]
  priority?: string
  severity?: string
  type?: string
  test_data?: unknown
  stepDetails?: TestCaseStepDetailDto[]

  executionModel?: ExecutionModelDto | null
  execution_model?: ExecutionModelDto | null
  createdBy?: CreatedBy
}


export interface GenerateTestCasesResponse {
  testSuiteId: string
  planId: string
  planTitle: string
  testCases: TestCaseDto[]
  reused?: boolean
  pendingReviewCount?: number
}

export interface IngestSpecResponse {
  testSuiteId: string
  pendingReviewCount: number
}

export type RoleLabel =
  | 'CONTEXT'
  | 'ACTOR'
  | 'FEATURE'
  | 'REQUIREMENT'
  | 'ACCEPTANCE'
  | 'NON_FUNCTIONAL'
  | 'OUT_OF_SCOPE'
  | 'GLOSSARY'

export interface RoleReviewItem {
  itemId: string
  text: string
  headingPath: string[]
  nearestHeading: string | null
  suggestedRole: RoleLabel | null
}

export interface RoleReviewQueueResponse {
  specHash: string
  pendingCount: number
  items: RoleReviewItem[]
}

export interface ResolveRoleReviewResponse {
  item: RoleReviewItem & {
    role: RoleLabel
    roleMethod: 'human'
    reviewed: true
    reviewState: 'resolved'
  }
  pendingCount: number
}

export interface SpecItem {
  itemId: string
  text: string
  headingPath: string[]
  nearestHeading: string | null
  sourceChunkId: string
  role: RoleLabel | 'UNTAGGED'
  roleMethod: string
  reviewed: boolean
  reviewState: string
  requirementId: string | null
}

export interface SpecItemsResponse {
  specHash: string
  totalCount: number
  items: SpecItem[]
}

export interface PlanStatusRow {
  planId: string
  status: string
}

export interface TestCasesByPlanDto {
  planId: string
  planTitle?: string
  testCases: TestCaseDto[]
  generatedBy?: unknown
  author?: unknown
  createdBy?: unknown

}

export interface GetTestPlansResponse {
  testSuiteId: string
  testPlans: TestPlanDto[]
  testCasesByPlan?: TestCasesByPlanDto[]
  testStatus?: 'Draft' | 'Generating' | 'Incomplete' | 'Ready' | 'Passed' | 'Failed'
  lastGeneratedAt?: string | null
  savedAt?: string | null
  executedAt?: string | null
  sessionStatus?: 'complete' | 'incomplete'
  planStatuses?: PlanStatusRow[]
  sessionSavedAt?: string | null
  validationStatus?: 'completed' | 'incomplete'
  validationPlanStatuses?: PlanStatusRow[]
  validationSavedAt?: string | null
  executionStatus?: 'completed' | 'incomplete' | null
  executionPlanStatuses?: PlanStatusRow[]
  executionSavedAt?: string | null
}

export interface TestLabProjectUserDto {
  _id: string
  name?: string
  email?: string
  picture?: string | null
}

export interface TestLabProjectDto {
  _id: string
  title: string
  startDate?: string | null
  endDate?: string | null
  milestoneDate?: string | null
  assignedUsers?: (TestLabProjectUserDto | string)[]
  ownerId?: TestLabProjectUserDto | string
}

export interface TestSuiteDto {
  _id: string
  projectId?: string | TestLabProjectDto | null
  projectTitle?: string
  nom?: string
  nametest?: string
  creatorName?: string
  picture?: string
  canOpen?: boolean
  status?: 'completed' | 'incomplete'
  testStatus?: 'Draft' | 'Generating' | 'Incomplete' | 'Ready' | 'Passed' | 'Failed'
  lastGeneratedAt?: string | null
  savedAt?: string | null
  executedAt?: string | null
  totalTestCases?: number
  description?: string
  specFileName?: string
  urlCible?: string
  testPlans?: TestPlanDto[]
  testCasesByPlan?: TestCasesByPlanDto[]
  sessionStatus?: 'complete' | 'incomplete'
  planStatuses?: PlanStatusRow[]
  sessionSavedAt?: string | null
  validationStatus?: 'completed' | 'incomplete'
  validationPlanStatuses?: PlanStatusRow[]
  validationSavedAt?: string | null
  executionStatus?: 'completed' | 'incomplete' | null
  executionPlanStatuses?: PlanStatusRow[]
  executionSavedAt?: string | null
  lastActionBy?: {
    userId?: string | null
    name?: string
    action?: 'generate-plan' | 'generate-test-case' | 'regenerate-plan' | 'regenerate-test-case' | null
    at?: string | null
  } | null
  createdAt?: string
  updatedAt?: string
  totalCases?: number
  casesCount?: number
  specFile?: string
  spec_file?: string 
  specText?: string
  styleConfig?: string

}
