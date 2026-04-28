// ============================================================
// services/testlab.service.ts
// ============================================================

import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

// ── Types ───────────────────────────────────────────────────

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

export interface GetTestPlansResponse {
  testSuiteId: string
  testPlans: TestPlanDto[]
  testCasesByPlan?: any[]
  testStatus?: 'Draft' | 'Generating' | 'Incomplete' | 'Ready' | 'Passed' | 'Failed'
  lastGeneratedAt?: string | null
  savedAt?: string | null
  executedAt?: string | null
  sessionStatus?: 'complete' | 'incomplete'
  planStatuses?: Array<{ planId: string; status: string }>
  sessionSavedAt?: string | null
  validationStatus?: 'validated' | 'invalid'
  validationPlanStatuses?: Array<{ planId: string; status: string }>
  validationSavedAt?: string | null
  executionStatus?: 'completed' | 'incomplete' | null
  executionPlanStatuses?: Array<{ planId: string; status: string }>
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
  assignedUsers?: Array<TestLabProjectUserDto | string>
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
  testCasesByPlan?: any[]
  sessionStatus?: 'complete' | 'incomplete'
  planStatuses?: Array<{ planId: string; status: string }>
  sessionSavedAt?: string | null
  validationStatus?: 'validated' | 'invalid'
  validationPlanStatuses?: Array<{ planId: string; status: string }>
  validationSavedAt?: string | null
  executionStatus?: 'completed' | 'incomplete' | null
  executionPlanStatuses?: Array<{ planId: string; status: string }>
  executionSavedAt?: string | null
  createdAt?: string
  updatedAt?: string
}

// ── Service ─────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class TestLabService {
  private http = inject(HttpClient)

  private baseUrl = 'http://localhost:3000/api'

  // ── Génération ───────────────────────────────────────────

  generatePlanFromDocx(formData: FormData): Observable<GeneratePlanResponse> {
    return this.http.post<GeneratePlanResponse>(
      `${this.baseUrl}/ollama/generate-plan`,
      formData
    )
  }

  generateTestCases(payload: {
    testSuiteId: string
    planId: string
    planTitle?: string
    planDescription?: string
    regenerate?: boolean
  }): Observable<GenerateTestCasesResponse> {
    return this.http.post<GenerateTestCasesResponse>(
      `${this.baseUrl}/ollama/generate-test-cases`,
      payload
    )
  }

  // ── Test Suites ──────────────────────────────────────────

  // ✅ GET /api/testsuites/user/:userId
  getTestSuitesByUser(userId: string): Observable<TestSuiteDto[]> {
    return this.http.get<TestSuiteDto[]>(
      `${this.baseUrl}/testsuites/user/${userId}`
    )
  }

  // ✅ GET /api/testsuites
  getAllTestSuites(): Observable<TestSuiteDto[]> {
    return this.http.get<TestSuiteDto[]>(`${this.baseUrl}/testsuites`)
  }

  // ✅ GET /api/testsuites/:id
  getTestSuiteById(testSuiteId: string): Observable<TestSuiteDto> {
    return this.http.get<TestSuiteDto>(`${this.baseUrl}/testsuites/${testSuiteId}`)
  }

  // ✅ GET /api/test-plans/project/:projectId
  getTestPlanByProject(projectId: string): Observable<TestSuiteDto | null> {
    // Backend returns an array (most-recent first): GET /api/testsuites/project/:projectId
    return this.http
      .get<TestSuiteDto[] | TestSuiteDto | null>(
        `${this.baseUrl}/testsuites/project/${projectId}`
      )
      .pipe(
        map((resp) => {
          if (!resp) return null
          if (Array.isArray(resp)) return resp[0] || null
          return resp
        })
      )
  }

  // ✅ GET /api/testsuites/:id/plans
  getTestPlans(testSuiteId: string): Observable<GetTestPlansResponse> {
    return this.http.get<GetTestPlansResponse>(
      `${this.baseUrl}/testsuites/${testSuiteId}/plans`
    )
  }

  saveSuiteSession(
    testSuiteId: string,
    payload: {
      sessionKind?: 'validation' | 'execution'
      suiteStatus: 'validated' | 'invalid' | 'completed' | 'incomplete'
      planStatuses: Record<string, string>
      testCasesByPlan?: any[]
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
      planStatuses: Array<{ planId: string; status: string }>
      sessionSavedAt: string | null
      validationStatus?: 'validated' | 'invalid'
      validationPlanStatuses?: Array<{ planId: string; status: string }>
      validationSavedAt?: string | null
      executionStatus?: 'completed' | 'incomplete' | null
      executionPlanStatuses?: Array<{ planId: string; status: string }>
      executionSavedAt?: string | null
    }
  }> {
    return this.http.patch<{
      message: string
      suite: {
        _id: string
        sessionStatus: 'complete' | 'incomplete'
        planStatuses: Array<{ planId: string; status: string }>
        sessionSavedAt: string | null
        validationStatus?: 'validated' | 'invalid'
        validationPlanStatuses?: Array<{ planId: string; status: string }>
        validationSavedAt?: string | null
        executionStatus?: 'completed' | 'incomplete' | null
        executionPlanStatuses?: Array<{ planId: string; status: string }>
        executionSavedAt?: string | null
      }
    }>(`${this.baseUrl}/testsuites/${testSuiteId}/session`, payload)
  }

  exportWord(testSuiteId: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/testsuites/${testSuiteId}/export-word`, {
      responseType: 'blob',
    })
  }

  // ── Legacy ───────────────────────────────────────────────

  getPlanByTestSuiteId(
    testSuiteId: string
  ): Observable<{ plans: PlanTestDto[]; steps: string[] }> {
    return this.http.get<{ plans: PlanTestDto[]; steps: string[] }>(
      `${this.baseUrl}/ollama/testsuite/${testSuiteId}/plan`
    )
  }

  // ── Utilitaires ──────────────────────────────────────────

  checkHealth(): Observable<{ status: string }> {
    return this.http.get<{ status: string }>(`${this.baseUrl}/ollama/health`)
  }

  chat(message: string): Observable<{ reply: string }> {
    return this.http.post<{ reply: string }>(`${this.baseUrl}/ollama/chat`, {
      message,
    })
  }
}
