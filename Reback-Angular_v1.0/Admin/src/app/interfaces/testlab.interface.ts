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
  testCases?: TestCaseDto[]
  casesCount?: number
}

export interface GeneratePlanResponse {
  testSuiteId: string
  projectId?: string
  testPlans?: TestPlanDto[]
  steps?: string[]
  plans?: PlanTestDto[]
  reused?: boolean
}

export interface TestCaseDto {
  id: string
  title: string
  steps: string[]
  expected_result: string
}

export interface GenerateTestCasesResponse {
  testSuiteId: string
  planId: string
  planTitle: string
  testCases: TestCaseDto[]
  reused?: boolean
}

export interface PlanStatusRow {
  planId: string
  status: string
}

export interface TestCasesByPlanDto {
  planId: string
  planTitle?: string
  testCases: TestCaseDto[]
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
  validationStatus?: 'validated' | 'invalid'
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
  status?: 'completed' | 'incomplete' | 'validated' | 'invalid'
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
  validationStatus?: 'validated' | 'invalid'
  validationPlanStatuses?: PlanStatusRow[]
  validationSavedAt?: string | null
  executionStatus?: 'completed' | 'incomplete' | null
  executionPlanStatuses?: PlanStatusRow[]
  executionSavedAt?: string | null
  createdAt?: string
  updatedAt?: string
  totalCases?: number
  casesCount?: number
  specFile?: string
  spec_file?: string
}

