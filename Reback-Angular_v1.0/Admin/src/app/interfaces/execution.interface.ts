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
