import { ApiService } from '@/app/core/services/api.service'
import type { TestCaseDto, TestLabProjectUserDto, TestPlanDto } from '@/app/interfaces/testlab.interface'
import { Injectable, inject } from '@angular/core'
import { Observable } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private api = inject(ApiService)

  // ✅ Get users by project
  getUsersByProject(projectId: string): Observable<TestLabProjectUserDto[]> {
    return this.api.get<TestLabProjectUserDto[]>(`/api/projects/${projectId}/users`)
  }

  getPlansByProject(projectId: string): Observable<TestPlanDto[]> {
    return this.api.get<TestPlanDto[]>(`/api/testplans?projectId=${projectId}`)
  }

  // ✅ TEST CASES BY PLAN
  getTestCasesByPlan(planId: string): Observable<TestCaseDto[]> {
    return this.api.get<TestCaseDto[]>(`/api/testcases?planId=${planId}`)
  }
}