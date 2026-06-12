import { ApiService } from '@/app/core/services/api.service'
import type { ExecutionModelDto } from '@/app/interfaces/testlab.interface'
import { Injectable, inject } from '@angular/core'
import { Observable } from 'rxjs'
export interface SeleniumStepResultDto {
  index: number
  id?: string
  name: string
  channel?: string
  action?: string
  status: 'passed' | 'failed'
  message?: string
  screenshotPath?: string | null
}

export interface SeleniumRunResponseDto {
  status: 'passed' | 'failed' | 'error'
  message?: string
  errorMessage?: string
  screenshotPath?: string | null
  stepResults?: SeleniumStepResultDto[]
  executionModel?: ExecutionModelDto | null
  execution_model?: ExecutionModelDto | null
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
