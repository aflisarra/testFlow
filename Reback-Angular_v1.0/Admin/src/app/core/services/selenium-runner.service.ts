import { Injectable, inject } from '@angular/core'
import { Observable } from 'rxjs'
import { ApiService } from '@/app/core/services/api.service'
import type { ExecutionModelDto } from '@/app/interfaces/testlab.interface'

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
}
