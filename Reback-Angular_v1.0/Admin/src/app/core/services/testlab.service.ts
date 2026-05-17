// ============================================================
// services/testlab.service.ts
// ============================================================

import { Injectable, inject } from '@angular/core'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { ApiService } from '@/app/core/services/api.service'

import type {
  GeneratePlanResponse,
  GenerateTestCasesResponse,
  GetTestPlansResponse,
  PlanTestDto,
  TestPlanDto,
  TestCasesByPlanDto,
  TestSuiteDto,
} from '@/app/interfaces/testlab.interface'

export type {
  GeneratePlanResponse,
  GenerateTestCasesResponse,
  GetTestPlansResponse,
  PlanTestDto,
  TestCaseDto,
  TestCasesByPlanDto,
  TestLabProjectDto,
  TestLabProjectUserDto,
  TestPlanDto,
  TestSuiteDto,
} from '@/app/interfaces/testlab.interface'

@Injectable({ providedIn: 'root' })
export class TestLabService {
  private api = inject(ApiService)

  // ── Génération ──────────────────────────────────────────────

  generatePlanFromDocx(formData: FormData): Observable<GeneratePlanResponse> {
    return this.api.post<GeneratePlanResponse>(`/api/ollama/generate-plan`, formData)
  }

  getSpecDocument(testSuiteId: string): Observable<Blob> {
    return this.api.getBlob(`/api/ollama/testsuite/${testSuiteId}/spec-document`)
  }

  generateTestCases(payload: {
    testSuiteId: string
    planId: string
    planTitle?: string
    planDescription?: string
    regenerate?: boolean
    generationRequestId?: string
  }): Observable<GenerateTestCasesResponse> {
    return this.api.post<GenerateTestCasesResponse>(`/api/ollama/generate-test-cases`, payload)
  }

  cancelGeneration(payload: {
    testSuiteId?: string
    planId?: string
    scope?: 'plans' | 'cases' | 'all'
    requestId?: string
  }): Observable<{ message?: string }> {
    return this.api.post<{ message?: string }>(`/api/ollama/cancel-generation`, payload)
  }

  // ── Test Suites ─────────────────────────────────────────────

  // ✅ GET /api/testsuites/user/:userId
  getTestSuitesByUser(userId: string): Observable<TestSuiteDto[]> {
    return this.api.get<TestSuiteDto[]>(`/api/testsuites/user/${userId}`)
  }

  // ✅ GET /api/testsuites
  getAllTestSuites(): Observable<TestSuiteDto[]> {
    return this.api.get<TestSuiteDto[]>(`/api/testsuites`)
  }

  // ✅ GET /api/testsuites/:id
  getTestSuiteById(testSuiteId: string): Observable<TestSuiteDto> {
    return this.api.get<TestSuiteDto>(`/api/testsuites/${testSuiteId}`)
  }

  // ✅ PATCH /api/testsuites/:id/project
  setTestSuiteProject(testSuiteId: string, projectId: string | null): Observable<{ suite: TestSuiteDto }> {
    return this.api.patch<{ suite: TestSuiteDto }>(`/api/testsuites/${testSuiteId}/project`, { projectId })
  }

  // ✅ GET /api/test-plans/project/:projectId
  getTestPlanByProject(projectId: string): Observable<TestSuiteDto | null> {
    // Backend returns an array (most-recent first): GET /api/testsuites/project/:projectId
    return this.api.get<TestSuiteDto[] | TestSuiteDto | null>(`/api/testsuites/project/${projectId}`)
      .pipe(
        map((resp) => {
          if (!resp) return null
          if (Array.isArray(resp)) return resp[0] || null
          return resp
        })
      )
  }

  getTestSuitesByProject(projectId: string): Observable<TestSuiteDto[]> {
    return this.api.get<TestSuiteDto[] | TestSuiteDto | null>(`/api/testsuites/project/${projectId}`)
      .pipe(
        map((resp) => {
          if (!resp) return []
          return Array.isArray(resp) ? resp : [resp]
        })
      )
  }

  // ✅ GET /api/testsuites/:id/plans
  getTestPlans(testSuiteId: string): Observable<GetTestPlansResponse> {
    return this.api.get<GetTestPlansResponse>(`/api/testsuites/${testSuiteId}/plans`)
  }

  saveSuiteSession(
    testSuiteId: string,
    payload: {
      sessionKind?: 'validation' | 'execution'
      suiteStatus: 'completed' | 'incomplete'
      planStatuses: Record<string, string>
      testPlans?: TestPlanDto[]
      testCasesByPlan?: TestCasesByPlanDto[]
    }
  ): Observable<{
    message: string
    suite: {
      _id: string
      testStatus?: 'Draft' | 'Generating' | 'Incomplete' | 'Ready' | 'Passed' | 'Failed'
      lastGeneratedAt?: string | null
      savedAt?: string | null
      executedAt?: string | null
      sessionStatus: 'complete' | 'incomplete'
      planStatuses: { planId: string; status: string }[]
      sessionSavedAt: string | null
      validationStatus?: 'completed' | 'incomplete'
      validationPlanStatuses?: { planId: string; status: string }[]
      validationSavedAt?: string | null
      executionStatus?: 'completed' | 'incomplete' | null
      executionPlanStatuses?: { planId: string; status: string }[]
      executionSavedAt?: string | null
      }
  }> {
    return this.api.patch<{
      message: string
      suite: {
        _id: string
        sessionStatus: 'complete' | 'incomplete'
        planStatuses: { planId: string; status: string }[]
        sessionSavedAt: string | null
        validationStatus?: 'completed' | 'incomplete'
        validationPlanStatuses?: { planId: string; status: string }[]
        validationSavedAt?: string | null
        executionStatus?: 'completed' | 'incomplete' | null
        executionPlanStatuses?: { planId: string; status: string }[]
        executionSavedAt?: string | null
      }
    }>(`/api/testsuites/${testSuiteId}/session`, payload)
  }

  exportWord(testSuiteId: string): Observable<Blob> {
    return this.api.getBlob(`/api/testsuites/${testSuiteId}/export-word`)
  }

  // ── Legacy ─────────────────────────────────────────────────

  getPlanByTestSuiteId(
    testSuiteId: string
  ): Observable<{ plans: PlanTestDto[]; steps: string[] }> {
    return this.api.get<{ plans: PlanTestDto[]; steps: string[] }>(`/api/ollama/testsuite/${testSuiteId}/plan`)
  }

  // ── Utilitaires ────────────────────────────────────────────

  checkHealth(): Observable<{ status: string }> {
    return this.api.get<{ status: string }>(`/api/ollama/health`)
  }

  chat(message: string): Observable<{ reply: string }> {
    return this.api.post<{ reply: string }>(`/api/ollama/chat`, {
      message,
    })
  }
}
