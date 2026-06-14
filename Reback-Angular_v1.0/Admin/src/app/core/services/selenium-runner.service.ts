import { ApiService } from '@/app/core/services/api.service'
import type { ExecutionModelDto } from '@/app/interfaces/testlab.interface'
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

  // ✅ Message/content
  message?: string
  error?: string

  // ✅ Actual vs Expected (assertions)
  actual?: string
  expected?: string
  actualResult?: string
  expectedResult?: string

  // ✅ Screenshot support with fallback chain
  screenshots?: ScreenshotDto[] // Primary: array of screenshots
  screenshot?: ScreenshotDto    // Fallback: single screenshot object
  screenshotPath?: string       // Fallback: URL string
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
  logs?: Array<{
    id?: string
    timestamp?: string
    stepIndex?: number
    level?: string
    message?: string
    data?: Record<string, unknown>
    executionTime?: number
  }>
}

@Injectable({ providedIn: 'root' })
export class SeleniumRunnerService {
  private api = inject(ApiService)

  runSingleTestCase(testCase: Record<string, unknown>): Observable<SeleniumRunResponseDto> {
    return this.api.post<SeleniumRunResponseDto>(`/api/selenium/run-test-case`, { testCase })
  }


  
/*getExecutions(filters: any) {
    return this.api.get('/api/selenium/executions', filters)
  }*/
 
getExecutions(filters: any) {
  return this.api.get('/api/selenium/executions', {
    params: { ...filters }
  })
}


  
getProjects() {
  return this.api.get<any[]>('/api/projects')
}


getSuitesByProject(projectId: string) {
  return this.api.get<any[]>(`/api/testsuites/project/${projectId}`)
}

getPlansBySuite(suiteId: string) {
  return this.api.get<any[]>(`/api/testsuites/${suiteId}/plans`)
}

getTestCasesByPlan(planId: string) {
  return this.api.get<any[]>(`/api/testsuites/plans/${planId}/cases`)
}



getExecutionDetail(id: string) {
  return this.api.get(`/api/selenium/executions/${id}`)
}
}
