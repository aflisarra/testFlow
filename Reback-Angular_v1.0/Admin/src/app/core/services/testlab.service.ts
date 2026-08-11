// ============================================================
// services/testlab.service.ts
// ============================================================
// ============================================================
// services/testlab.service.ts
// ============================================================

import { ApiService } from '@/app/core/services/api.service'
import { Injectable, inject } from '@angular/core'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

import type {
  GeneratePlanResponse,
  GenerateTestCasesResponse,
  GetTestPlansResponse,
  PlanTestDto,
  TestCasesByPlanDto,
  TestPlanDto,
  TestSuiteDto,
  IngestSpecResponse,
  RoleLabel,
  RoleReviewQueueResponse,
  ResolveRoleReviewResponse,
  SpecItem,
  SpecItemsResponse,
} from '@/app/interfaces/testlab.interface'

export type {
  ExecutionModelDto,
  ExecutionModelStepDto, GeneratePlanResponse,
  GenerateTestCasesResponse,
  GetTestPlansResponse,
  PlanTestDto,
  TestCaseDto, TestCasesByPlanDto,
  TestLabProjectDto,
  TestLabProjectUserDto,
  TestPlanDto,
  TestSuiteDto,
  IngestSpecResponse,
  RoleLabel,
  RoleReviewItem,
  RoleReviewQueueResponse,
  ResolveRoleReviewResponse,
  SpecItem,
  SpecItemsResponse,
} from '@/app/interfaces/testlab.interface'

export interface TestExecutionDto {
  executionId: string
  testSuiteId: string
  planId: string
  planKey?: string
  planTitle?: string
  testCaseId: string
  testCaseKey?: string
  testCaseTitle?: string
  status: 'running' | 'passed' | 'failed' | 'aborted'
  duration: number
  startedAt?: string
  finishedAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface SpecificationContentDto {
  fileName: string
  content: string
}
interface GenerateTestCasesPayload {
  testSuiteId: string
  planId: string
  planTitle?: string
  planDescription?: string
  specText?: string
  regenerate?: boolean
  generationRequestId?: string
}

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

generateTestCases(
  payload: GenerateTestCasesPayload
): Observable<GenerateTestCasesResponse> {
  const body = {
    testSuiteId: payload.testSuiteId,
    planId: payload.planId,
    planTitle: payload.planTitle || '',
    planDescription: payload.planDescription || '',
    specText: payload.specText || '',
    spec_text: payload.specText || payload.planDescription || '',
    regenerate: payload.regenerate ?? false,
    generationRequestId: payload.generationRequestId || '',
  }

  return this.api.post<GenerateTestCasesResponse>(
    `/api/ollama/generate-test-cases`,
    body
  )
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

  // ✅ GET /api/testsuites/project/:projectId
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

  ingestSpecification(formData: FormData, testSuiteId?: string): Observable<IngestSpecResponse> {
    const path = testSuiteId
      ? `/api/testsuites/${testSuiteId}/ingest-spec`
      : '/api/testsuites/ingest-spec'
    return this.api.post<IngestSpecResponse>(path, formData)
  }

  generateStoredPlan(testSuiteId: string, payload: Record<string, string | boolean> = {}): Observable<GeneratePlanResponse> {
    return this.api.post<GeneratePlanResponse>(`/api/testsuites/${testSuiteId}/generate-plan`, payload)
  }

  getRoleReviews(testSuiteId: string): Observable<RoleReviewQueueResponse> {
    return this.api.get<RoleReviewQueueResponse>(`/api/testsuites/${testSuiteId}/role-reviews`)
  }

  resolveRoleReview(
    testSuiteId: string,
    itemId: string,
    role: RoleLabel
  ): Observable<ResolveRoleReviewResponse> {
    return this.api.patch<ResolveRoleReviewResponse>(
      `/api/testsuites/${testSuiteId}/role-reviews/${itemId}`,
      { role }
    )
  }

  dismissRoleReview(testSuiteId: string, itemId: string, _reason?: string): Observable<void> {
    return this.api.delete<void>(`/api/testsuites/${testSuiteId}/role-reviews/${itemId}`)
  }

  getSpecItems(testSuiteId: string): Observable<SpecItemsResponse> {
    return this.api.get<SpecItemsResponse>(`/api/testsuites/${testSuiteId}/spec-items`)
  }

  getTestExecutions(testSuiteId: string): Observable<TestExecutionDto[]> {
    return this.api.get<TestExecutionDto[]>(`/api/testsuites/${testSuiteId}/executions`)
  }
  
generatePlanPreview(formData: FormData): Observable<GeneratePlanResponse> {
  return this.api.post<GeneratePlanResponse>(`/api/ollama/generate-plan`, formData)
}

createSuiteWithPlans(payload: {
  projectId: string
  name: string
  testPlans: TestPlanDto[]
  planStatuses: Record<string, string>
  specText?: string
  fileName?: string
}) {
  return this.api.post<{ testSuiteId: string }>(
    `/api/testsuites/save-plans`,
    {
      ...payload,
      testPlans: JSON.stringify(payload.testPlans),
      planStatuses: JSON.stringify(payload.planStatuses),
    }
  )
}

  // POST multipart form when uploading a spec file
  createSuiteWithPlansForm(formData: FormData) {
    return this.api.post<{ testSuiteId: string }>(`/api/testsuites/save-plans`, formData)
  }


  getRecentExecutions(limit = 20): Observable<TestExecutionDto[]> {
    return this.api.get<TestExecutionDto[]>(`/api/testsuites/executions/recent?limit=${limit}`)
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

deleteTestCase(id: string) {
  return this.api.delete<{ message: string }>(`/api/testsuites/cases/${id}`)
}

  getSpecificationContent(testSuiteId: string): Observable<SpecificationContentDto> {
    return this.api.get<SpecificationContentDto>(
      `/api/specifications/${testSuiteId}/content`
    )
  }

  updateSpecificationContent(
    testSuiteId: string,
    content: string
  ): Observable<{ message?: string; fileName?: string; content?: string }> {
    return this.api.put<{ message?: string; fileName?: string; content?: string }>(
      `/api/specifications/${testSuiteId}/content`,
      { content }
    )
  }

}
