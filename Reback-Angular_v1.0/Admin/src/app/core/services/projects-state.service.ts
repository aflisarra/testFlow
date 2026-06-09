import { Injectable, inject } from '@angular/core'
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs'
import { AdminManagementService } from '@/app/core/services/admin-management.service'
import type { AppProject } from '@/app/interfaces/admin-management.interface'

@Injectable({ providedIn: 'root' })
export class ProjectsStateService {
  private adminManagement = inject(AdminManagementService)

  private readonly projectsSubject = new BehaviorSubject<AppProject[]>([])
  readonly projects$: Observable<AppProject[]> = this.projectsSubject.asObservable()

  async refresh(mine = false): Promise<void> {
    const projects = await firstValueFrom(this.adminManagement.getProjects(mine))
    this.projectsSubject.next(Array.isArray(projects) ? projects : [])
  }

  
}

