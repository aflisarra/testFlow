import { CommonModule } from '@angular/common'
import { Component, OnInit, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import {
  AdminManagementService,
  AppProject,
  AppUser,
} from '@/app/core/services/admin-management.service'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { ConfirmModalComponent } from '../admin/shared/confirm-modal.component'
import { ToastrService } from 'ngx-toastr'
import { Store } from '@ngrx/store'
import { getUser } from '@/app/store/authentication/authentication.selector'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'

@Component({
  selector: 'app-project-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './project-management.component.html',
  styleUrls: ['./project-management.component.css'],
})
export class ProjectManagementComponent implements OnInit {
  private fb = inject(FormBuilder)
  private adminService = inject(AdminManagementService)
  private modalService = inject(NgbModal)
  private toastr = inject(ToastrService)
  private store = inject(Store)

  projects: AppProject[] = []
  users: AppUser[] = []

  loading = false
  usersLoading = false
  submitting = false
  error = ''
  eliteTeamOpen = false
  readonly defaultAvatar = 'assets/images/users/default-user.svg'
  private readonly backendOrigin = 'http://localhost:3000'
  private currentUserId = ''
  private currentUserEmail = ''

  selectedProjectId: string | null = null
  assignedUserIds = new Set<string>()

  projectForm = this.fb.group({
    title: ['', [Validators.required, Validators.pattern(/\S+/)]],
    description: [''],
    startDate: [''],
    endDate: [''],
    milestoneDate: [''],
    status: this.fb.nonNullable.control<'draft' | 'active' | 'paused' | 'completed'>('draft'),
  })

  get selectedProject(): AppProject | null {
    if (!this.selectedProjectId) return null
    return this.projects.find((p) => p._id === this.selectedProjectId) || null
  }

  ngOnInit(): void {
    void this.initializePage()
  }

  private async initializePage(): Promise<void> {
    await this.loadCurrentUserContext()
    this.loadUsers()
    this.loadProjects()
  }

  loadUsers(): void {
    this.usersLoading = true
    this.adminService.getUsers().subscribe({
      next: (users) => {
        this.users = (users || []).filter((u) => !this.isCurrentUser(u))
        this.usersLoading = false
      },
      error: () => {
        this.users = []
        this.usersLoading = false
      },
    })
  }

  loadProjects(): void {
    this.loading = true
    this.error = ''

    this.adminService.getProjects(false).subscribe({
      next: (projects) => {
        this.projects = projects || []
        this.loading = false

        if (this.selectedProjectId) {
          const selected = this.projects.find((p) => p._id === this.selectedProjectId)
          if (selected) {
            this.onSelectProject(selected)
            return
          }
          this.selectedProjectId = null
        }
      },
      error: (err) => {
        this.error = err?.error?.message || 'Unable to load projects'
        this.loading = false
      },
    })
  }

  onNewProject(): void {
    this.selectedProjectId = null
    this.assignedUserIds.clear()
    this.projectForm.reset({
      title: '',
      description: '',
      startDate: '',
      endDate: '',
      milestoneDate: '',
      status: 'draft',
    })
  }

  onSelectProject(project: AppProject): void {
    this.selectedProjectId = project._id
    this.assignedUserIds = new Set((project.assignedUsers || []).map((u) => u._id))

    this.projectForm.patchValue({
      title: project.title || '',
      description: project.description || '',
      startDate: this.toDateInput(project.startDate),
      endDate: this.toDateInput(project.endDate),
      milestoneDate: this.toDateInput(project.milestoneDate),
      status: project.status || 'draft',
    })
  }

  isAssigned(userId: string): boolean {
    return this.assignedUserIds.has(userId)
  }

  toggleAssignUser(userId: string, checked: boolean): void {
    if (checked) this.assignedUserIds.add(userId)
    else this.assignedUserIds.delete(userId)
  }

  toggleEliteTeam(): void {
    this.eliteTeamOpen = !this.eliteTeamOpen
  }

  saveProject(): void {
    if (this.projectForm.invalid || this.hasInvalidDateOrder()) {
      this.projectForm.markAllAsTouched()
      if (this.hasInvalidDateOrder()) {
        this.error = 'Please verify dates: end and milestone dates must be on or after start date.'
      }
      return
    }

    const trimmedTitle = String(this.projectForm.value.title || '').trim()
    if (!trimmedTitle) {
      this.error = 'Project title is required.'
      this.projectForm.controls.title.markAsTouched()
      return
    }

    this.submitting = true
    const payload = {
      title: trimmedTitle,
      description: String(this.projectForm.value.description || '').trim(),
      startDate: this.projectForm.value.startDate || null,
      endDate: this.projectForm.value.endDate || null,
      milestoneDate: this.projectForm.value.milestoneDate || null,
      status: this.projectForm.value.status || 'draft',
      assignedUsers: Array.from(this.assignedUserIds),
    }

    const req$ = this.selectedProject
      ? this.adminService.updateProject(this.selectedProject._id, payload)
      : this.adminService.createProject(payload)

    req$.subscribe({
      next: (res) => {
        const wasEditing = !!this.selectedProject
        this.submitting = false
        this.error = ''
        this.toastr.success(
          'This action was completed successfully.',
          wasEditing ? 'Edited' : 'Created'
        )
        if (!wasEditing) {
          this.onNewProject()
        }
        this.loadProjects()
      },
      error: (err) => {
        this.submitting = false
        this.error = err?.error?.message || 'Unable to save project'
      },
    })
  }

  deleteProject(project: AppProject): void {
    const ref = this.modalService.open(ConfirmModalComponent, {
      centered: true,
      windowClass: 'confirm-modal-window',
      backdropClass: 'confirm-modal-backdrop',
    })
    ref.componentInstance.title = 'Delete project ?'
    ref.componentInstance.entityName = project.title
    ref.componentInstance.confirmText = 'Delete'
    ref.componentInstance.cancelText = 'Cancel'

    ref.closed.subscribe(() => {
      this.adminService.deleteProject(project._id).subscribe({
        next: () => {
          this.toastr.success('This action was completed successfully.', 'Deleted')
          this.onNewProject()
          this.loadProjects()
        },
        error: (err) => {
          this.error = err?.error?.message || 'Unable to delete project'
        },
      })
    })
  }

  private toDateInput(value?: string | null): string {
    if (!value) return ''
    return String(value).slice(0, 10)
  }

  hasInvalidDateOrder(): boolean {
    const start = this.projectForm.value.startDate || ''
    const end = this.projectForm.value.endDate || ''
    const milestone = this.projectForm.value.milestoneDate || ''

    if (start && end && end < start) return true
    if (start && milestone && milestone < start) return true
    return false
  }

  resolveAvatarUrl(picture?: string): string {
    const raw = String(picture || '').trim()
    if (!raw) return this.defaultAvatar
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
    if (raw.startsWith('/')) return `${this.backendOrigin}${raw}`
    return raw
  }

  onAvatarError(event: Event) {
    const img = event.target as HTMLImageElement | null
    if (!img) return
    img.src = this.defaultAvatar
  }

  private async loadCurrentUserContext(): Promise<void> {
    const current = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
    this.currentUserId = String((current as any)?.id || (current as any)?._id || '').trim()
    this.currentUserEmail = String((current as any)?.email || '').trim().toLowerCase()
  }

  private isCurrentUser(user: AppUser): boolean {
    const userId = String(user?._id || '').trim()
    const userEmail = String(user?.email || '').trim().toLowerCase()
    const idMatch = userId.length > 0 && userId === this.currentUserId
    const emailMatch = userEmail.length > 0 && userEmail === this.currentUserEmail
    return idMatch || emailMatch
  }
}
