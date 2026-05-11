import { Injectable, inject } from '@angular/core'
import { Observable } from 'rxjs'
import { ApiService } from '@/app/core/services/api.service'

export interface SeleniumStepResultDto {
  index: number
  name: string
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
}

@Injectable({ providedIn: 'root' })
export class SeleniumRunnerService {
  private api = inject(ApiService)

  runSingleTestCase(testCase: Record<string, unknown>): Observable<SeleniumRunResponseDto> {
    return this.api.post<SeleniumRunResponseDto>(`/api/selenium/run-test-case`, { testCase })
  }
}

