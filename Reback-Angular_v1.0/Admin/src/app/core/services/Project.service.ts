import { ApiService } from '@/app/core/services/api.service'
import { Injectable, inject } from '@angular/core'
import { Observable } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private api = inject(ApiService)

  // ✅ Get users by project
  getUsersByProject(projectId: string): Observable<any[]> {
    return this.api.get<any[]>(`/api/projects/${projectId}/users`)
  }

  
getPlansByProject(projectId: string) {
  return this.api.get(`/api/testplans?projectId=${projectId}`)
}

// ✅ TEST CASES BY PLAN
getTestCasesByPlan(planId: string) {
  return this.api.get(`/api/testcases?planId=${planId}`)
}



}