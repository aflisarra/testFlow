import { CommonModule } from '@angular/common'
import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { AdminManagementService, AppRole, AppUser } from '@/app/core/services/admin-management.service'
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap'
import { ConfirmModalComponent } from '../shared/confirm-modal.component'
import { UserUpsertModalComponent } from './user-upsert-modal.component'
import { Store } from '@ngrx/store'
import { getUser } from '@/app/store/authentication/authentication.selector'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'
import { ToastrService } from 'ngx-toastr'
import { Router } from '@angular/router'

@Component({
  selector: 'app-all-users',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbModalModule],
  templateUrl: './all-users.component.html',
  styleUrls: ['./all-users.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AllUsersComponent implements OnInit {
  private adminService = inject(AdminManagementService)
  private fb = inject(FormBuilder)
  private modalService = inject(NgbModal)
  private store = inject(Store)
  private toastr = inject(ToastrService)
  private router = inject(Router)

  users: AppUser[] = []
  readonly defaultAvatar = 'assets/images/users/default-user.svg'
  private readonly backendOrigin = 'http://localhost:3000'
  roles: AppRole[] = []
  loading = false
  submitting = false
  createSubmitted = false
  error = ''
  permissionAlert = ''
  private currentUserId = ''
  private currentUserEmail = ''

  private readonly ACTION_ADD_USER = 2
  private readonly ACTION_EDIT_USER = 3
  private readonly ACTION_VIEW_USER = 4
  private readonly ACTION_DELETE_USER = 5

  createUserForm = this.fb.group({
    name: ['', [Validators.required, Validators.pattern(/\S+/)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    role: ['', [Validators.required, Validators.pattern(/\S+/)]],
    description: [''],
    picture: [null as File | null],
  })

  canAddUser = false
  canEditUser = false
  canDeleteUser = false
  canViewUsers = false
  readonly usersPerPage = 7
  currentUserPage = 1

  async ngOnInit(): Promise<void> {
    this.clearCreateUserCredentials()
    await this.initPermissions()
    this.loadRoles()
    if (this.canViewUsers) {
      this.loadUsers()
    } else {
      this.notifyPermissionDenied("Acces refuse: vous n'avez pas l'action View User.")
      await this.router.navigate(['/unauthorized'], { replaceUrl: true })
    }
  }

  private clearCreateUserCredentials(): void {
    this.createUserForm.patchValue(
      { email: '', password: '' },
      { emitEvent: false }
    )
  }

  private async initPermissions() {
    const user = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
    this.currentUserId = String((user as any)?.id || (user as any)?._id || '').trim()
    this.currentUserEmail = String((user as any)?.email || '').trim().toLowerCase()
    const actions = Array.isArray((user as any)?.actions) ? (user as any).actions : []
    this.canAddUser = actions.includes(this.ACTION_ADD_USER)
    this.canEditUser = actions.includes(this.ACTION_EDIT_USER)
    this.canDeleteUser = actions.includes(this.ACTION_DELETE_USER)
    this.canViewUsers = actions.includes(this.ACTION_VIEW_USER)
  }

  loadRoles(): void {
    this.adminService.getRoles().subscribe({
      next: (roles) => {
        this.roles = roles || []
      },
      error: () => {
        this.roles = []
      },
    })
  }

  loadUsers(): void {
    if (!this.canViewUsers) {
      this.notifyPermissionDenied("Acces refuse: vous n'avez pas l'action View User.")
      this.users = []
      return
    }

    this.loading = true
    this.error = ''

    this.adminService.getUsers().subscribe({
      next: (users) => {
        this.users = (users || []).filter((u) => !this.isCurrentUser(u))
        this.clampUserPage()
        this.loading = false
      },
      error: (err) => {
        this.error = err?.error?.message || 'Unable to load users'
        this.loading = false
      },
    })
  }

  onPictureSelected(event: Event) {
    const input = event.target as HTMLInputElement | null
    const file = input?.files?.[0] || null
    this.createUserForm.patchValue({ picture: file })
  }

  onAvatarError(event: Event) {
    const img = event.target as HTMLImageElement | null
    if (!img) return
    img.src = this.defaultAvatar
  }

  resolveAvatarUrl(picture?: string): string {
    const raw = String(picture || '').trim()
    if (!raw) return this.defaultAvatar
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
    if (raw.startsWith('/')) return `${this.backendOrigin}${raw}`
    return raw
  }

  submitCreateUser(): void {
    this.createSubmitted = true

    if (!this.canAddUser) {
      this.notifyPermissionDenied('Action non autorisee: Add User.')
      return
    }

    if (this.createUserForm.invalid) {
      this.createUserForm.markAllAsTouched()
      return
    }

    this.submitting = true
    const payload = {
      name: String(this.createUserForm.value.name || '').trim(),
      email: String(this.createUserForm.value.email || '').trim(),
      password: String(this.createUserForm.value.password || ''),
      role: String(this.createUserForm.value.role || '').trim(),
      description: String(this.createUserForm.value.description || '').trim() || undefined,
      picture: this.createUserForm.value.picture || null,
    }

    this.adminService.createUser(payload).subscribe({
      next: () => {
        this.submitting = false
        this.createSubmitted = false
        this.createUserForm.reset({
          name: '',
          email: '',
          password: '',
          role: '',
          description: '',
          picture: null,
        })
        this.showActionSuccess('created')
        this.loadUsers()
      },
      error: (err) => {
        this.submitting = false
        this.error = err?.error?.message || 'Unable to create user'
      },
    })
  }

  onEditUser(user: AppUser) {
    if (!this.canEditUser) {
      this.notifyPermissionDenied('Action non autorisee: Edit User.')
      return
    }

    const ref = this.modalService.open(UserUpsertModalComponent, {
      size: 'lg',
      centered: true,
      windowClass: 'exec-upsert-modal-window',
      backdropClass: 'exec-upsert-modal-backdrop',
    })
    ref.componentInstance.user = user
    ref.componentInstance.roles = this.roles

    ref.closed.subscribe((updated) => {
      if (updated) {
        this.showActionSuccess('edited')
      }
      this.loadUsers()
    })
  }

  onDeleteUser(user: AppUser) {
    if (!this.canDeleteUser) {
      this.notifyPermissionDenied('Action non autorisee: Delete User.')
      return
    }

    const ref = this.modalService.open(ConfirmModalComponent, {
      centered: true,
      windowClass: 'confirm-modal-window',
      backdropClass: 'confirm-modal-backdrop',
    })
    ref.componentInstance.title = 'Delete user ?'
    //ref.componentInstance.message = 'This will delete'
    ref.componentInstance.entityName = user.email
    //ref.componentInstance.details = 'This action cannot be undone.'
    ref.componentInstance.confirmText = 'Delete'
    ref.componentInstance.cancelText = 'Cancel'

    ref.closed.subscribe(() => {
      this.adminService.deleteUser(user._id).subscribe({
        next: () => {
          this.showActionSuccess('deleted')
          this.loadUsers()
        },
        error: (err) => {
          this.error = err?.error?.message || 'Unable to delete user'
        },
      })
    })
  }

  private notifyPermissionDenied(message: string) {
    this.permissionAlert = message
    this.toastr.warning(message, 'Permission')
  }

  private showActionSuccess(action: 'created' | 'edited' | 'deleted') {
    const title = action.charAt(0).toUpperCase() + action.slice(1)
    this.toastr.success('This action was completed successfully.', title)
  }

  private isCurrentUser(user: AppUser): boolean {
    const idMatch = String(user?._id || '').trim() !== '' && String(user?._id || '').trim() === this.currentUserId
    const emailMatch =
      String(user?.email || '').trim().toLowerCase() !== '' &&
      String(user?.email || '').trim().toLowerCase() === this.currentUserEmail
    return idMatch || emailMatch
  }

  get totalUserPages(): number {
    return Math.max(1, Math.ceil(this.users.length / this.usersPerPage))
  }

  get paginatedUsers(): AppUser[] {
    const start = (this.currentUserPage - 1) * this.usersPerPage
    return this.users.slice(start, start + this.usersPerPage)
  }

  get usersRangeStart(): number {
    if (this.users.length === 0) return 0
    return (this.currentUserPage - 1) * this.usersPerPage + 1
  }

  get usersRangeEnd(): number {
    return Math.min(this.currentUserPage * this.usersPerPage, this.users.length)
  }

  onPrevUsersPage(): void {
    if (this.currentUserPage > 1) this.currentUserPage--
  }

  onNextUsersPage(): void {
    if (this.currentUserPage < this.totalUserPages) this.currentUserPage++
  }

  private clampUserPage(): void {
    if (this.currentUserPage < 1) this.currentUserPage = 1
    if (this.currentUserPage > this.totalUserPages) this.currentUserPage = this.totalUserPages
  }
}
