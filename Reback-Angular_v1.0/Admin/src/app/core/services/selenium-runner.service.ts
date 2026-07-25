import { ApiService } from '@/app/core/services/api.service'
import type {
  ExecutionModelDto,
  GetTestPlansResponse,
  TestLabProjectDto,
  TestSuiteDto
} from '@/app/interfaces/testlab.interface'
import { Injectable, inject } from '@angular/core'
import { Observable } from 'rxjs'

// ──── Screenshot DTO ──────────────────────────────
export interface ScreenshotDto {
  publicUrl?: string
  path?: string
  url?: string
}

// ──── Step Result DTO (Selenium Step) ──────────────
export interface SeleniumStepResultDto {
  index: number
  id?: string
  name: string
  channel?: string
  action?: string

  status: 'passed' | 'failed_execution' | 'failed_assertion' | 'skipped'

  message?: string
  error?: string

  actual?: string
  expected?: string
  actualResult?: string
  expectedResult?: string

  screenshots?: ScreenshotDto[]
  screenshot?: ScreenshotDto
  screenshotPath?: string
}

// ──── Project / Suite / Test Case ─────────────────

export interface ProjectListItemDto {
  _id: string
  title: string
}

export interface SuiteListItemDto {
  _id: string
  title: string
}

export interface TestCaseListItemDto {
  _id: string
  title: string
}

// ──── Execution DTOs ──────────────────────────────

export interface SeleniumLogDto {
  id?: string
  timestamp?: string
  stepIndex?: number
  level?: string
  message?: string
  data?: Record<string, unknown>
  executionTime?: number
}

export interface SeleniumRunResponseDto {
  status: 'passed' | 'failed' | 'error'
  message?: string
  errorMessage?: string
  screenshotPath?: string | null
  stepResults?: SeleniumStepResultDto[]
  screenshots?: ScreenshotDto[]
  executionModel?: ExecutionModelDto | null
  execution_model?: ExecutionModelDto | null
  logs?: SeleniumLogDto[]
}

// ──── Execution filters ──────────────────────────

export interface ExecutionFilters {
  project?: string
  suite?: string
  testPlan?: string
  testCase?: string
  status?: string
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
  days?: number
}

// ──── Execution list (history / analytics) ───────

export interface ExecutedByDto {
  name?: string
  fullName?: string
  username?: string
  picture?: string | null
}

export interface ExecutionListItemDto {
  executionId: string
  testCaseTitle?: string
  testCaseKey?: string
  executedByName?: string
  executedBy?: ExecutedByDto
  createdBy?: ExecutedByDto
  status:
    | 'passed'
    | 'failed'
    | 'failed_execution'
    | 'failed_assertion'
    | 'aborted'
    | 'running'
  startedAt?: string
  duration?: number

  // Champs supplémentaires utilisés par AnalyticsComponent
  project?: TestLabProjectDto | string
  projectId?: TestLabProjectDto | string
  projectName?: string
  projectTitle?: string
  testSuiteName?: string
  testSuite?: TestSuiteDto
  planTitle?: string
  planKey?: string
}

export interface ExecutionListResponseDto {
  total?: number
  data?: ExecutionListItemDto[]
}

// ──── Analytics ───────────────────────────────────

export interface ExecutionTrendItemDto {
  day: string
  passed: number
  failed: number
}

export interface ExecutionTrendResponseDto {
  data: ExecutionTrendItemDto[]
}

export interface TypeBreakdownItemDto {
  type: string
  count: number
  percent: number
}

export interface TypeBreakdownResponseDto {
  data: TypeBreakdownItemDto[]
}

@Injectable({ providedIn: 'root' })
export class SeleniumRunnerService {
  private api = inject(ApiService)

  // ────────────────────────────────────────────────
  // Selenium execution
  // ────────────────────────────────────────────────

  runSingleTestCase(
    testCase: Record<string, unknown>
  ): Observable<SeleniumRunResponseDto> {
    return this.api.post<SeleniumRunResponseDto>(
      `/api/selenium/run-test-case`,
      { testCase }
    )
  }

  // ────────────────────────────────────────────────
  // Execution history
  // ────────────────────────────────────────────────

  getExecutions(filters: ExecutionFilters): Observable<ExecutionListResponseDto> {
    return this.api.get<ExecutionListResponseDto>(
      `/api/selenium/executions`,
      {
        params: { ...filters },
      }
    )
  }

  // ────────────────────────────────────────────────
  // Projects
  // ────────────────────────────────────────────────

  getProjects(): Observable<ProjectListItemDto[]> {
    return this.api.get<ProjectListItemDto[]>(
      `/api/projects`
    )
  }

  // ────────────────────────────────────────────────
  // Test Suites
  // ────────────────────────────────────────────────

  getSuitesByProject(
    projectId: string
  ): Observable<SuiteListItemDto[]> {
    return this.api.get<SuiteListItemDto[]>(
      `/api/testsuites/project/${projectId}`
    )
  }

  // ────────────────────────────────────────────────
  // Test Plans
  // ────────────────────────────────────────────────

  getPlansBySuite(
    suiteId: string
  ): Observable<GetTestPlansResponse> {
    return this.api.get<GetTestPlansResponse>(
      `/api/testsuites/${suiteId}/plans`
    )
  }

  // ────────────────────────────────────────────────
  // Test Cases
  // ────────────────────────────────────────────────

  getTestCasesByPlan(
    planId: string
  ): Observable<TestCaseListItemDto[]> {
    return this.api.get<TestCaseListItemDto[]>(
      `/api/testsuites/plans/${planId}/cases`
    )
  }

  // ────────────────────────────────────────────────
  // Execution details
  // ────────────────────────────────────────────────

  getExecutionDetail(id: string): Observable<ExecutionModelDto> {
    return this.api.get<ExecutionModelDto>(
      `/api/selenium/executions/${id}`
    )
  }

  // ────────────────────────────────────────────────
  // Execution report
  // ────────────────────────────────────────────────

  getExecutionHistoryReport(
    testSuiteId: string
  ) {
    return this.api.getBlob(
      `/api/selenium/reports/test-suites/${encodeURIComponent(testSuiteId)}`
    )
  }

  // ────────────────────────────────────────────────
  // Abort execution
  // ────────────────────────────────────────────────

  abortExecution(id: string) {
    return this.api.patch(
      `/api/selenium/executions/${id}/abort`,
      {}
    )
  }

  // ────────────────────────────────────────────────
  // Execution trend
  // ────────────────────────────────────────────────

  getExecutionTrend(
    params: ExecutionFilters
  ): Observable<ExecutionTrendResponseDto> {
    return this.api.get<ExecutionTrendResponseDto>(
      `/api/selenium/executions/trend`,
      {
        params: { ...params },
      }
    )
  }

  // ────────────────────────────────────────────────
  // Test case type breakdown
  // ────────────────────────────────────────────────

  getTypeBreakdown(
    params: ExecutionFilters
  ): Observable<TypeBreakdownResponseDto> {
    return this.api.get<TypeBreakdownResponseDto>(
      `/api/selenium/testcases/type-breakdown`,
      {
        params: { ...params },
      }
    )
  }
}