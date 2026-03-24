import { CommonModule } from '@angular/common'
import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { AdminManagementService, AppRole, AppUser } from '@/app/core/services/admin-management.service'
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap'
import { ConfirmModalComponent } from '../shared/confirm-modal.component'
import { UserUpsertModalComponent } from './user-upsert-modal.component'

@Component({
  selector: 'app-all-users',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbModalModule],
  templateUrl: './all-users.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AllUsersComponent implements OnInit {
  private adminService = inject(AdminManagementService)
  private fb = inject(FormBuilder)
  private modalService = inject(NgbModal)

  users: AppUser[] = []
  readonly defaultAvatar = 'assets/images/users/default-user.svg'
  private readonly backendOrigin = 'http://localhost:3000'
  roles: AppRole[] = []
  loading = false
  submitting = false
  error = ''

  createUserForm = this.fb.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    role: ['', [Validators.required]],
    description: [''],
    picture: [null as File | null],
  })

  ngOnInit(): void {
    this.loadRoles()
    this.loadUsers()
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
    this.loading = true
    this.error = ''

    this.adminService.getUsers().subscribe({
      next: (users) => {
        this.users = users
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
        this.createUserForm.reset({
          name: '',
          email: '',
          password: '',
          role: '',
          description: '',
          picture: null,
        })
        this.loadUsers()
      },
      error: (err) => {
        this.submitting = false
        this.error = err?.error?.message || 'Unable to create user'
      },
    })
  }

  onEditUser(user: AppUser) {
    const ref = this.modalService.open(UserUpsertModalComponent, {
      size: 'lg',
      centered: true,
      windowClass: 'exec-upsert-modal-window',
      backdropClass: 'exec-upsert-modal-backdrop',
    })
    ref.componentInstance.user = user
    ref.componentInstance.roles = this.roles

    ref.closed.subscribe(() => this.loadUsers())
  }

  onDeleteUser(user: AppUser) {
    const ref = this.modalService.open(ConfirmModalComponent, {
      centered: true,
      windowClass: 'confirm-modal-window',
      backdropClass: 'confirm-modal-backdrop',
    })
    ref.componentInstance.title = 'Delete user?'
    ref.componentInstance.message = 'This will delete'
    ref.componentInstance.entityName = user.email
    ref.componentInstance.details = 'This action cannot be undone.'
    ref.componentInstance.confirmText = 'Delete'
    ref.componentInstance.cancelText = 'Cancel'

    ref.closed.subscribe(() => {
      this.adminService.deleteUser(user._id).subscribe({
        next: () => this.loadUsers(),
        error: (err) => {
          this.error = err?.error?.message || 'Unable to delete user'
        },
      })
    })
  }
}
