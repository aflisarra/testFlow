import type { ExecutionModelDto } from '@/app/core/services/testlab.service'

export type StepStatus = 'pass' | 'fail' | 'running' | 'waiting' | 'skipped'
export type TestStatus = 'in-progress' | 'passed' | 'failed' | 'aborted'

export interface LogLine {
  index: number
  level: 'INFO' | 'SUCCESS' | 'FAIL' | 'ERROR' | 'WARN' | 'TRACE'
  message: string
}

export interface ExecutionStep {
  id: number
  name: string
  subtitle: string
  status: StepStatus
  timestamp: string
  screenshotUrl?: string | null
}

export interface NodeMetrics {
  cpu: number
  memory: number
  latency: number
  threads: number
}

export interface AiRecommendation {
  element: string
  description: string
  suggestedFix: string
}

export interface ErrorMeta {
  errorType: string
  stepName: string
  screenshot: string
  duration: string
}

export interface TestScenario {
  projectName: string
  suiteName: string
  planName: string
  caseName: string
  executionId: string
  environment: string
  executionTime: string
  status: TestStatus
  progressPercent: number
  progressLabel: string
  activeStepLabel: string
  steps: ExecutionStep[]
  logs: LogLine[]
  aiRecommendation?: AiRecommendation
  errorMeta?: ErrorMeta
  failureSnapshot?: string
}

// ─────────────────────────────────────────────────────────────────────────
// Ajouts pour execution.component.ts
// ─────────────────────────────────────────────────────────────────────────

export interface TestCaseStepDetail {
  step: string
  expected_result?: string
  actual_result?: string
  status?: string
}

export interface ExecutionCredentials {
  email?: string
  password?: string
  apiToken?: string
  token?: string
}

export interface LoadedExecutionTestCase {
  id: string
  title: string
  steps: string[]
  stepDetails?: TestCaseStepDetail[]
  urlCible: string
  executionModel?: ExecutionModelDto | null
  test_data?: unknown
  credentials?: ExecutionCredentials
}

export type RawExecutionLogData = Record<string, unknown>

export interface RawExecutionLog {
  stepIndex?: number
  level?: string
  message?: string
  data?: RawExecutionLogData
}

export interface DetectorRecommendation {
  error: string
  rootCause?: string
  whatHappened?: string
  example?: string
  fix: string
}

export interface DetectorTimelineItem {
  step?: number
  action?: string
  result?: string
}

export interface DetectFailureData {
  title?: string
  description?: string
  rootCause?: string
  confidence?: number
  failedStepName?: string
  aiActionSummary?: string
  actionLabel?: string
  actionText?: string
  recommendations?: DetectorRecommendation[]
  diagnosticTips?: string[]
  suggestedSelectors?: string[]
  summary?: string
  whatHappened?: string
  simpleExplanation?: string
  example?: string
  expectedBehavior?: string
  actualBehavior?: string
  whyItFailed?: string
  severity?: string
  evidence?: string[]
  timeline?: DetectorTimelineItem[]
  developerFix?: string[]
  testerFix?: string[]
}

// Remplace: type DetectFailureResponse = { data?: DetectFailureData } & DetectFailureData
export interface DetectFailureResponse extends DetectFailureData {
  data?: DetectFailureData
}

export interface DetectorInsight {
  title: string
  description: string
  actionLabel: string
  actionText: string
  recommendations: DetectorRecommendation[]
  rootCause?: string
  confidence?: number
  failedStepName?: string
  aiActionSummary?: string
  diagnosticTips?: string[]
  suggestedSelectors?: string[]
  summary?: string
  whatHappened?: string
  simpleExplanation?: string
  example?: string
  expectedBehavior?: string
  actualBehavior?: string
  whyItFailed?: string
  severity?: string
  evidence?: string[]
  timeline?: DetectorTimelineItem[]
  developerFix?: string[]
  testerFix?: string[]
}

export interface DOMElementRect {
  height: number
  width: number
  x: number
  y: number
}

export interface DOMElement {
  ariaExpanded?: string
  ariaHaspopup?: string
  ariaLabel?: string
  classes?: string
  disabled?: boolean
  form?: string
  href?: string
  id?: string
  index?: number
  name?: string
  placeholder?: string
  /*rect?: DOMElementRect*/
  rect?: { x: number; y: number; width: number; height: number };
  role?: string
  tag: string
  testId?: string
  text?: string
  title?: string
  type?: string
  value?: string
  visible: boolean
}

export interface EditableAiAction {
  uid: string;
  stepIndex: number;
  type: string;
  selector: string;
  value: string;
  position?: { x: number; y: number; width: number; height: number } | null;
  originalType: string;
  originalSelector: string;
  originalValue: string;
  originalPosition?: { x: number; y: number; width: number; height: number } | null;
  isEdited: boolean;
}

export interface ExecutionFilters {
  project: string
  suite: string
  testPlan: string
  testCase: string
}

// ─── DTOs pour les dropdowns en cascade (remplace les `any[]` / `any`
// des listes project/suite/plan/testCase) ───────────────────────────────

export interface ProjectListItemDto {
  _id: string
  title?: string
}

export interface SuiteListItemDto {
  _id: string
  title?: string
}

export interface PlanListItemDto {
  //_id: string
  id?: string
  title?: string
}

export interface TestCaseListItemDto {
  _id: string
  title?: string
}

// Wrapper générique pour les endpoints qui renvoient soit un tableau brut,
// soit { data: [...] } / { testPlans: [...] } / { testCases: [...] }
export interface ListEnvelope<T> {
  data?: T[]
  testPlans?: T[]
  testCases?: T[]
}


// Remplace `Array<Record<string, unknown>>` utilisé par extractAiActions()
export type AiActionRecord = Record<string, unknown>