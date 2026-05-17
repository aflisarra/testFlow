import { AdminManagementService } from '@/app/core/services/admin-management.service'
import type { AppProject, AppUser } from '@/app/interfaces/admin-management.interface'
import { getUser } from '@/app/store/authentication/authentication.selector'
import { CommonModule } from '@angular/common'

import {
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  ViewChild,
  TemplateRef,
  inject,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import {
  AbstractControl,
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms'
import { Router } from '@angular/router'
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap'
import { Store } from '@ngrx/store'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'
import { ConfirmModalComponent } from '../admin/shared/confirm-modal.component'
import { ApiService } from '@/app/core/services/api.service'
import { ProjectsRefreshService } from '@/app/core/services/projects-refresh.service'

import type { TeamMemberView } from '@/app/interfaces/project-management.interface'
import type { UserWithActions } from '@/app/interfaces/authorization.interface'

@Component({
  selector: 'app-project-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './project-management.component.html',
  styleUrls: ['./project-management.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})


export class ProjectManagementComponent implements OnInit {
  private fb = inject(FormBuilder)
  private adminService = inject(AdminManagementService)
  private modalService = inject(NgbModal)
  private toastr = inject(ToastrService)
  private store = inject(Store)
  private router = inject(Router)
  private api = inject(ApiService)
  private projectsRefresh = inject(ProjectsRefreshService)
  private destroyRef = inject(DestroyRef)


  

  projects: AppProject[] = []
  users: AppUser[] = []

  loading = false
  usersLoading = false
  submitting = false
  error = ''
  eliteTeamSearch = ''

  /** Search query for the project list panel */
  projectSearch = ''

  readonly defaultAvatar = 'assets/images/users/default-user.svg'
  private currentUserId = ''
  private currentUserEmail = ''

  private readonly ACTION_LIST_PROJECTS = 11
  private readonly ACTION_CREATE_PROJECT = 12
  private readonly ACTION_VIEW_PROJECT = 13
  private readonly ACTION_EDIT_PROJECT = 14
  private readonly ACTION_DELETE_PROJECT = 15
  private readonly ACTION_LIST_USERS = 10
  private readonly ACTION_VIEW_USER = 4

  canViewProjects = false
  canCreateProject = false
  canEditProject = false
  canDeleteProject = false
  canListUsers = false

  selectedProjectId: string | null = null
  @ViewChild('viewProjectModal') viewProjectModal!: TemplateRef<void>

  assignedUserIds = new Set<string>()
  editingProjectId: string | null = null
  editSubmitting = false
  editAssignedUserIds = new Set<string>()
  editEliteTeamOpen = false
  private eliteTeamSelectionBeforeOpen = new Set<string>()
  private eliteTeamApplied = false

  viewProject: AppProject | null = null

  currentProjectPage = 1
  private projectsPerPage = 10

  projectForm = this.fb.group({
    title: ['', [Validators.required, Validators.pattern(/\S+/)]],
    description: [''],
    startDate: ['', [Validators.required, this.validDateValidator.bind(this)]],
endDate: ['', [Validators.required, this.validDateValidator.bind(this)]],
milestoneDate: ['', [Validators.required, this.validDateValidator.bind(this)]],
    status: this.fb.nonNullable.control<'draft' | 'active' | 'paused' | 'completed'>('draft'),
  })

  editProjectForm = this.fb.group({
    title: ['', [Validators.required, Validators.pattern(/\S+/)]],
    description: [''],
    startDate: ['', [Validators.required, this.validDateValidator.bind(this)]],
endDate: ['', [Validators.required, this.validDateValidator.bind(this)]],
milestoneDate: ['', [Validators.required, this.validDateValidator.bind(this)]],
    status: this.fb.nonNullable.control<'draft' | 'active' | 'paused' | 'completed'>('draft'),
  })

  // ─── Getters ───────────────────────────────────────────────────────────────

  get createMinAfterStartDate(): string {
    return String(this.projectForm.value.startDate || '')
  }

  get editMinAfterStartDate(): string {
    return String(this.editProjectForm.value.startDate || '')
  }

  get selectedProject(): AppProject | null {
    if (!this.selectedProjectId) return null
    return this.projects.find((p) => p._id === this.selectedProjectId) || null
  }

  /** Projects filtered by the search query */
  get filteredProjects(): AppProject[] {
    const q = this.projectSearch.trim().toLowerCase()
    if (!q) return this.projects
    return this.projects.filter((p) =>
      String(p.title || '').toLowerCase().includes(q)
    )
  }

  /** Paginated slice of the filtered list */
  get paginatedProjects(): AppProject[] {
    const start = (this.currentProjectPage - 1) * this.projectsPerPage
    return this.filteredProjects.slice(start, start + this.projectsPerPage)
  }

  get totalProjectPages(): number {
    return Math.ceil(this.filteredProjects.length / this.projectsPerPage)
  }

  get projectsRangeStart(): number {
    if (this.filteredProjects.length === 0) return 0
    return (this.currentProjectPage - 1) * this.projectsPerPage + 1
  }

  get projectsRangeEnd(): number {
    const end = this.currentProjectPage * this.projectsPerPage
    return Math.min(end, this.filteredProjects.length)
  }


get viewProjectTeamMembers(): TeamMemberView[] {
  if (!this.viewProject) return []

  const assigned = this.viewProject.assignedUsers ?? []
  const byId = new Map(this.users.map((u) => [u._id, u]))

  return assigned.flatMap((u): TeamMemberView[] => {
    const user = byId.get(u._id)
    if (!user) return []

    const parts = String(user.name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)

    const initials =
      parts.length > 0
        ? `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase()
        : 'U'

    return [
      {
        id: user._id,
        name: user.name,
        initials,
        hasPhoto: !!user.picture,
        photoUrl: user.picture ? this.resolveAvatarUrl(user.picture) : null,
        isOwner: u.role === 'owner',
      },
    ]
  })
}

  get selectedTeamUsers(): AppUser[] {
    const byId = new Map(this.users.map((u) => [u._id, u]))
    return Array.from(this.assignedUserIds)
      .map((id) => byId.get(id))
      .filter((u): u is AppUser => !!u)
  }

  get teamPreviewUsers(): AppUser[] {
    return this.selectedTeamUsers.slice(0, 4)
  }

  get teamExtraCount(): number {
    const count = this.selectedTeamUsers.length - this.teamPreviewUsers.length
    return count > 0 ? count : 0
  }

  get filteredEliteUsers(): AppUser[] {
    const q = this.eliteTeamSearch.trim().toLowerCase()
    if (!q) return this.users
    return this.users.filter((u) => {
      const name = String(u.name || '').toLowerCase()
      const email = String(u.email || '').toLowerCase()
      const role = String(u.role || '').toLowerCase()
      return name.includes(q) || email.includes(q) || role.includes(q)
    })
  }

  get editSelectedCount(): number {
    return this.editAssignedUserIds.size
  }

  get editAllSelected(): boolean {
    const total = this.users.length
    if (total === 0) return false
    return this.editSelectedCount === total
  }

  get editFirstSelectedUser(): AppUser | null {
    const firstId = Array.from(this.editAssignedUserIds)[0]
    if (!firstId) return null
    return this.users.find((u) => u._id === firstId) || null
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.projectForm.setValidators(this.dateOrderValidatorForCreate)
    this.editProjectForm.setValidators(this.dateOrderValidatorForEdit)
    this.projectsRefresh.changes$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadProjects())

    void this.initializePage()
  }

  private async initializePage(): Promise<void> {
    await this.loadCurrentUserContext()
    await this.initPermissions()
    this.loadUsers()
    this.loadProjects()
  }

private async initPermissions(): Promise<void> {
  const current = await firstValueFrom(
    this.store.select(getUser).pipe(take(1))
  )

  const user = current as UserWithActions

  const actions = user.actions ?? []

  const ids = new Set<number>(
    actions.map(Number).filter(Number.isFinite)
  )

  this.canViewProjects =
    ids.has(this.ACTION_LIST_PROJECTS) ||
    ids.has(this.ACTION_VIEW_PROJECT)

  this.canCreateProject = ids.has(this.ACTION_CREATE_PROJECT)
  this.canEditProject = ids.has(this.ACTION_EDIT_PROJECT)
  this.canDeleteProject = ids.has(this.ACTION_DELETE_PROJECT)
  this.canListUsers =
    ids.has(this.ACTION_LIST_USERS) ||
    ids.has(this.ACTION_VIEW_USER)
}

  // ─── Load data ──────────────────────────────────────────────────────────────

  loadUsers(): void {
    if (!this.canListUsers) {
      this.users = []
      this.usersLoading = false
      return
    }
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
    if (!this.canViewProjects) {
      this.projects = []
      this.loading = false
      this.error = "Acces refuse: vous n'avez pas l'action Projet."
      return
    }
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

  // ─── Pagination ─────────────────────────────────────────────────────────────

  onPrevProjectsPage(): void {
    if (this.currentProjectPage > 1) this.currentProjectPage--
  }

  onNextProjectsPage(): void {
    if (this.currentProjectPage < this.totalProjectPages) this.currentProjectPage++
  }

  // ─── Form helpers ───────────────────────────────────────────────────────────

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

  onAssignUserChange(userId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false
    this.toggleAssignUser(userId, checked)
  }

  getUserInitials(name?: string | null): string {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return 'U'
    return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase()
  }

  // ─── Elite Team Modal ───────────────────────────────────────────────────────

  toggleEliteTeam(): void {
  // TODO: implement elite team toggle
}

  openEliteTeamModal(content: TemplateRef<void>): void {
    this.eliteTeamSelectionBeforeOpen = new Set(this.assignedUserIds)
    this.eliteTeamApplied = false
    const ref = this.modalService.open(content, {
      size: 'lg',
      centered: true,
      windowClass: 'exec-upsert-modal-window',
      backdropClass: 'exec-upsert-modal-backdrop',
    })
    ref.result.finally(() => {
      if (!this.eliteTeamApplied) {
        this.assignedUserIds = new Set(this.eliteTeamSelectionBeforeOpen)
      }
      this.eliteTeamSelectionBeforeOpen.clear()
    })
  }

applyEliteTeamSelection(modal: NgbModalRef): void {
  this.eliteTeamApplied = true
  modal.close()
  this.toastr.success('Team selection updated.', 'Team')
}

  // ─── Save / Delete ─────────────────────────────────────────────────────────

  saveProject(): void {
    if (this.selectedProject && !this.canEditProject) {
      this.toastr.warning("Acces refuse: vous n'avez pas l'action Edit Project.", 'Permission')
      return
    }
    if (!this.selectedProject && !this.canCreateProject) {
      this.toastr.warning("Acces refuse: vous n'avez pas l'action Create Project.", 'Permission')
      return
    }
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
      startDate: this.normalizeDateForApi(this.projectForm.value.startDate),
      endDate: this.normalizeDateForApi(this.projectForm.value.endDate),
      milestoneDate: this.normalizeDateForApi(this.projectForm.value.milestoneDate),
      status: this.projectForm.value.status || 'draft',
      assignedUsers: Array.from(this.assignedUserIds),
    }

    const req$ = this.selectedProject
      ? this.adminService.updateProject(this.selectedProject._id, payload)
      : this.adminService.createProject(payload)

    req$.subscribe({
      next: () => {
        const wasEditing = !!this.selectedProject
        this.submitting = false
        this.error = ''
        this.toastr.success('This action was completed successfully.', wasEditing ? 'Edited' : 'Created')
        if (!wasEditing) this.onNewProject()
        this.loadProjects()
      },
      error: (err) => {
        this.submitting = false
        this.error = err?.error?.message || 'Unable to save project'
      },
    })
  }

  deleteProject(project: AppProject): void {
    if (!this.canDeleteProject) {
      this.toastr.warning("Acces refuse: vous n'avez pas l'action Delete Project.", 'Permission')
      return
    }
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

  // ─── View Modal ─────────────────────────────────────────────────────────────

  openProjectViewModal(project: AppProject): void {
    this.viewProject = project
    const ref = this.modalService.open(this.viewProjectModal, {
      size: 'lg',
      centered: true,
      windowClass: 'exec-upsert-modal-window',
      backdropClass: 'exec-upsert-modal-backdrop',
    })
    ref.result.finally(() => {
      this.viewProject = null
    })
  }

  // ─── Edit Modal ─────────────────────────────────────────────────────────────

  openEditProjectModal(
  project: AppProject,
  content: TemplateRef<HTMLElement>
): void {
    if (!this.canEditProject) {
      this.toastr.warning("Acces refuse: vous n'avez pas l'action Edit Project.", 'Permission')
      return
    }
    this.editingProjectId = project._id
    this.editAssignedUserIds = new Set((project.assignedUsers || []).map((u) => u._id))
    this.editProjectForm.reset({
      title: project.title || '',
      description: project.description || '',
      startDate: this.toDateInput(project.startDate),
      endDate: this.toDateInput(project.endDate),
      milestoneDate: this.toDateInput(project.milestoneDate),
      status: project.status || 'draft',
    })
    this.modalService.open(content, {
      size: 'lg',
      centered: true,
      windowClass: 'exec-upsert-modal-window',
      backdropClass: 'exec-upsert-modal-backdrop',
    })
  }

  saveEditedProject(modal: NgbModalRef): void {
    if (!this.canEditProject) {
      this.toastr.warning("Acces refuse: vous n'avez pas l'action Edit Project.", 'Permission')
      return
    }
    if (!this.editingProjectId) return
    if (
  this.editProjectForm.invalid ||
  this.hasInvalidEditEndDate() ||
  this.hasInvalidEditMilestoneDate()
) {
      this.editProjectForm.markAllAsTouched()
      if (this.hasInvalidEditDateOrder()) {
        this.error = 'Please verify dates: end and milestone dates must be on or after start date.'
      }
      return
    }
    const trimmedTitle = String(this.editProjectForm.value.title || '').trim()
    if (!trimmedTitle) {
      this.editProjectForm.controls.title.markAsTouched()
      return
    }

    this.editSubmitting = true
    const payload = {
      title: trimmedTitle,
      description: String(this.editProjectForm.value.description || '').trim(),
      startDate: this.normalizeDateForApi(this.editProjectForm.value.startDate),
      endDate: this.normalizeDateForApi(this.editProjectForm.value.endDate),
      milestoneDate: this.normalizeDateForApi(this.editProjectForm.value.milestoneDate),
      status: this.editProjectForm.value.status || 'draft',
      assignedUsers: Array.from(this.editAssignedUserIds),
    }

    this.adminService.updateProject(this.editingProjectId, payload).subscribe({
      next: () => {
        this.editSubmitting = false
        this.toastr.success('This action was completed successfully.', 'Edited')
        modal.close()
        this.loadProjects()
      },
      error: (err) => {
        this.editSubmitting = false
        this.error = err?.error?.message || 'Unable to save project'
      },
    })
  }

  // ─── Edit Team ──────────────────────────────────────────────────────────────

  isEditAssigned(userId: string): boolean {
    return this.editAssignedUserIds.has(userId)
  }

  toggleEditAssignUser(userId: string, checked: boolean): void {
    if (checked) this.editAssignedUserIds.add(userId)
    else this.editAssignedUserIds.delete(userId)
  }

  onEditAssignUserChange(userId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false
    this.toggleEditAssignUser(userId, checked)
  }

  toggleEditEliteTeamDropdown(): void {
    this.editEliteTeamOpen = !this.editEliteTeamOpen
  }

  get todayDate(): string {
  return new Date().toISOString().split('T')[0]
}

  toggleEditAll(checked: boolean): void {
    if (checked) {
      this.editAssignedUserIds = new Set(this.users.map((u) => u._id))
      return
    }
    this.editAssignedUserIds.clear()
  }

  onEditAllChange(event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false
    this.toggleEditAll(checked)
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null
    if (!target?.closest('.edit-elite-dropdown')) {
      this.editEliteTeamOpen = false
    }
  }

  // ─── Date helpers ───────────────────────────────────────────────────────────

  private setControlError(
    control: AbstractControl | null,
    key: string,
    present: boolean
  ): void {
    if (!control) return
    const existing = control.errors || {}
    if (present) {
      if (existing[key]) return
      control.setErrors({ ...existing, [key]: true })
      return
    }
    if (!existing[key]) return
    const { [key]: _removed, ...rest } = existing
    control.setErrors(Object.keys(rest).length ? rest : null)
  }

private readonly dateOrderValidatorForCreate = (
  group: AbstractControl
): ValidationErrors | null => {

  const start = this.normalizeDateForApi(group.get('startDate')?.value) || ''
  const end = this.normalizeDateForApi(group.get('endDate')?.value) || ''
  const milestone =
    this.normalizeDateForApi(group.get('milestoneDate')?.value) || ''

  const today = new Date().toISOString().split('T')[0]

  const invalidStart = !!(start && start < today)

  const invalidEnd = !!(start && end && end < start)

  const invalidMilestone =
    !!(
      start &&
      end &&
      milestone &&
      (milestone < start || milestone > end)
    )

  this.setControlError(
    group.get('startDate'),
    'beforeToday',
    invalidStart
  )

  this.setControlError(
    group.get('endDate'),
    'beforeStartDate',
    invalidEnd
  )

  this.setControlError(
    group.get('milestoneDate'),
    'invalidMilestoneRange',
    invalidMilestone
  )

  return invalidStart || invalidEnd || invalidMilestone
    ? { dateOrder: true }
    : null
}

  private readonly dateOrderValidatorForEdit = (group: AbstractControl): ValidationErrors | null => {
     const start = this.normalizeDateForApi(group.get('startDate')?.value) || ''
  const end = this.normalizeDateForApi(group.get('endDate')?.value) || ''
  const milestone =
    this.normalizeDateForApi(group.get('milestoneDate')?.value) || ''

  const today = new Date().toISOString().split('T')[0]

  const invalidStart = !!(start && start < today)

  const invalidEnd = !!(start && end && end < start)

  const invalidMilestone =
    !!(
      start &&
      end &&
      milestone &&
      (milestone < start || milestone > end)
    )

  this.setControlError(
    group.get('startDate'),
    'beforeToday',
    invalidStart
  )

  this.setControlError(
    group.get('endDate'),
    'beforeStartDate',
    invalidEnd
  )

  this.setControlError(
    group.get('milestoneDate'),
    'invalidMilestoneRange',
    invalidMilestone
  )

  return invalidStart || invalidEnd || invalidMilestone
    ? { dateOrder: true }
    : null
  }

  hasInvalidDateOrder(): boolean {
    const start = this.normalizeDateForApi(this.projectForm.value.startDate) || ''
    const end = this.normalizeDateForApi(this.projectForm.value.endDate) || ''
    const milestone = this.normalizeDateForApi(this.projectForm.value.milestoneDate) || ''
    if (start && end && end < start) return true
    if (start && milestone && milestone < start) return true
    return false
  }

  hasInvalidEditDateOrder(): boolean {
    const start = this.editProjectForm.value.startDate || ''
    const end = this.editProjectForm.value.endDate || ''
    const milestone = this.editProjectForm.value.milestoneDate || ''
    if (start && end && end < start) return true
    if (start && milestone && milestone < start) return true
    return false
  }

  hasInvalidEditEndDate(): boolean {
  const start = this.editProjectForm.value.startDate || ''
  const end = this.editProjectForm.value.endDate || ''

  return !!(start && end && end < start)
}

hasInvalidEditMilestoneDate(): boolean {
  const start = this.editProjectForm.value.startDate || ''
  const milestone = this.editProjectForm.value.milestoneDate || ''

  return !!(start && milestone && milestone < start)
}

  private toDateInput(value?: string | null): string {
    if (!value) return ''
    return String(value).slice(0, 10)
  }

  private normalizeDateForApi(value: unknown): string | null {
    if (!value) return null
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
    }
    const raw = String(value).trim()
    if (!raw) return null
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
    const dt = new Date(raw)
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10)
  }

  // ─── Avatar helpers ─────────────────────────────────────────────────────────

  resolveAvatarUrl(picture?: string): string {
    const raw = String(picture || '').trim()
    if (!raw) return this.defaultAvatar
    if (this.isAbsoluteHttpUrl(raw)) return raw
    if (raw.startsWith('/')) return this.api.toAbsoluteUrl(raw)
    return raw
  }

  private isAbsoluteHttpUrl(value: string): boolean {
    try {
      const u = new URL(value)
      return u.protocol === 'http:' || u.protocol === 'https:'
    } catch {
      return false
    }
  }

  onAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement | null
    if (!img) return
    img.src = this.defaultAvatar
  }

  // ─── Navigation ─────────────────────────────────────────────────────────────

  createTestPlanForProject(project: AppProject): void {
    this.router.navigate(['/test-plan'], {
      queryParams: { projectId: project._id, projectName: project.title },
    })
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

 private async loadCurrentUserContext(): Promise<void> {
  const current = await firstValueFrom(
    this.store.select(getUser).pipe(take(1))
  )

  const user = current as { id?: string; _id?: string; email?: string }

  this.currentUserId = String(user?.id || user?._id || '').trim()
  this.currentUserEmail = String(user?.email || '').trim().toLowerCase()
}

  private isCurrentUser(user: AppUser): boolean {
    const userId = String(user?._id || '').trim()
    const userEmail = String(user?.email || '').trim().toLowerCase()
    const idMatch = userId.length > 0 && userId === this.currentUserId
    const emailMatch = userEmail.length > 0 && userEmail === this.currentUserEmail
    return idMatch || emailMatch
  }

  private validDateValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value || '').trim()

  if (!value) {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return { invalidDate: true }
  }

  return null
}
}
