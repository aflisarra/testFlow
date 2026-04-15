// ============================================================
// services/testlab.service.ts
// ============================================================

import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable } from 'rxjs'

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
  sessionStatus?: 'complete' | 'incomplete'
  planStatuses?: Array<{ planId: string; status: string }>
  sessionSavedAt?: string | null
}

export interface TestSuiteDto {
  _id: string
  projectId?: string
  nom?: string
  nametest?: string
  creatorName?: string
  picture?: string
  totalTestCases?: number
  description?: string
  specFileName?: string
  urlCible?: string
  testPlans?: TestPlanDto[]
  testCasesByPlan?: any[]
  sessionStatus?: 'complete' | 'incomplete'
  planStatuses?: Array<{ planId: string; status: string }>
  sessionSavedAt?: string | null
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

  // ✅ GET /api/testsuites/:id/plans
  getTestPlans(testSuiteId: string): Observable<GetTestPlansResponse> {
    return this.http.get<GetTestPlansResponse>(
      `${this.baseUrl}/testsuites/${testSuiteId}/plans`
    )
  }

  saveSuiteSession(
    testSuiteId: string,
    payload: {
      suiteStatus: 'complete' | 'incomplete'
      planStatuses: Record<string, string>
      testCasesByPlan?: any[]
    }
  ): Observable<{
    message: string
    suite: {
      _id: string
      sessionStatus: 'complete' | 'incomplete'
      planStatuses: Array<{ planId: string; status: string }>
      sessionSavedAt: string | null
    }
  }> {
    return this.http.patch<{
      message: string
      suite: {
        _id: string
        sessionStatus: 'complete' | 'incomplete'
        planStatuses: Array<{ planId: string; status: string }>
        sessionSavedAt: string | null
      }
    }>(`${this.baseUrl}/testsuites/${testSuiteId}/session`, payload)
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
