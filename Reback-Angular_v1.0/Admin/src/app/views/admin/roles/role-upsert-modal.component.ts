import { CommonModule } from '@angular/common'
import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import {
  AdminManagementService,
  AppAction,
  AppRole,
} from '@/app/core/services/admin-management.service'
import { map, type Observable } from 'rxjs'

@Component({
  selector: 'app-role-upsert-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './role-upsert-modal.component.html',
  styleUrls: ['./role-upsert-modal.component.css'],
})
export class RoleUpsertModalComponent implements OnInit, OnChanges, OnDestroy {
  private fb = inject(FormBuilder)
  private adminService = inject(AdminManagementService)
  private el = inject(ElementRef)
  private activeModal = inject(NgbActiveModal, { optional: true })

  @Input() role: AppRole | null = null
  @Input() actions: AppAction[] = []
  @Input() inlineMode = false
  @Output() saved = new EventEmitter<boolean>()
  @Output() cancelled = new EventEmitter<void>()

  submitting = false
  error = ''
  submitted = false
  actionsOpen = false

  actionGroups: Array<{ key: string; label: string; actions: AppAction[] }> = []
  private enabledGroups = new Map<string, boolean>()

  roleForm = this.fb.group({
    name: ['', [Validators.required, Validators.pattern(/\S+/)]],
    description: ['', [Validators.pattern(/^$|\S+/)]],
    actions: [[] as number[]],
  })

  ngOnInit(): void {
    if (this.role) {
      this.roleForm.patchValue({
        name: this.role.name,
        description: this.role.description,
        actions: this.role.actions || [],
      })
    }
    this.rebuildActionGroups()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['actions']) {
      this.rebuildActionGroups()
    }
  }

  ngOnDestroy(): void {
    if (!this.activeModal) return
    const appRoot = document.querySelector('app-root')
    if (appRoot) appRoot.removeAttribute('aria-hidden')
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement
    if (!target.closest('.exec-actions-dropdown')) {
      this.actionsOpen = false
    }
  }

  get selectedCount(): number {
    return (this.roleForm.value.actions || []).length
  }

  get allSelected(): boolean {
    const total = this.actions.length
    if (total === 0) return false
    return this.selectedCount === total
  }

  getActionById(id: number): AppAction | undefined {
    return this.actions.find((a) => a._id === id)
  }

  toggleAll(checked: boolean): void {
    if (checked) {
      for (const group of this.actionGroups) this.enabledGroups.set(group.key, true)
      this.roleForm.patchValue({ actions: (this.actions || []).map((a) => a._id) })
      return
    }
    for (const group of this.actionGroups) this.enabledGroups.set(group.key, false)
    this.roleForm.patchValue({ actions: [] })
  }

  isGroupEnabled(groupKey: string): boolean {
    return this.enabledGroups.get(groupKey) ?? false
  }

  toggleGroup(groupKey: string, checked: boolean): void {
    this.enabledGroups.set(groupKey, checked)
    const group = this.actionGroups.find((g) => g.key === groupKey)
    if (!group) return

    const selected = new Set(this.roleForm.value.actions || [])
    if (checked) {
      for (const action of group.actions) selected.add(action._id)
      this.roleForm.patchValue({ actions: [...selected] })
      return
    }

    const groupIds = new Set(group.actions.map((a) => a._id))
    const next = [...selected].filter((id) => !groupIds.has(id))
    this.roleForm.patchValue({ actions: next })
  }

  onToggleAction(actionId: number, checked: boolean): void {
    const selected = [...(this.roleForm.value.actions || [])]
    const exists = selected.includes(actionId)

    if (checked && !exists) selected.push(actionId)
    if (!checked && exists) selected.splice(selected.indexOf(actionId), 1)

    this.roleForm.patchValue({ actions: selected })
  }

  isActionChecked(actionId: number): boolean {
    return (this.roleForm.value.actions || []).includes(actionId)
  }

  formatActionName(name?: string): string {
    const clean = String(name || '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()

    if (!clean) return ''
    return clean.charAt(0).toUpperCase() + clean.slice(1)
  }

  private rebuildActionGroups(): void {
    const grouped = new Map<string, AppAction[]>()
    for (const action of this.actions || []) {
      const key = this.getGroupKey(action)
      const list = grouped.get(key) || []
      list.push(action)
      grouped.set(key, list)
    }

    const groups = [...grouped.entries()].map(([key, groupActions]) => ({
      key,
      label: this.getGroupLabel(key),
      actions: [...groupActions].sort((a, b) => a.name.localeCompare(b.name)),
    }))

    const order = ['manage_roles', 'manage_users', 'dashboard', 'other']
    groups.sort((a, b) => {
      const ai = order.indexOf(a.key)
      const bi = order.indexOf(b.key)
      const ax = ai === -1 ? 999 : ai
      const bx = bi === -1 ? 999 : bi
      if (ax !== bx) return ax - bx
      return a.label.localeCompare(b.label)
    })

    this.actionGroups = groups

    const selected = new Set(this.roleForm.value.actions || [])
    for (const group of groups) {
      if (this.enabledGroups.has(group.key)) continue
      const anySelected = group.actions.some((a) => selected.has(a._id))
      this.enabledGroups.set(group.key, anySelected)
    }
  }

  private getGroupKey(action: AppAction): string {
    const name = (action.name || '').toLowerCase()
    const path = (action.path || '').toLowerCase()

    if (path.includes('/roles') || name.includes('role')) return 'manage_roles'
    if (path.includes('/users') || name.includes('user')) return 'manage_users'
    if (name === 'dashboard' || path === '/dashboard') return 'dashboard'
    return 'other'
  }

  private getGroupLabel(groupKey: string): string {
    switch (groupKey) {
      case 'manage_roles': return 'Manage role'
      case 'manage_users': return 'Manage user'
      case 'dashboard': return 'Dashboard'
      default: return 'Other actions'
    }
  }

  save(): void {
    this.submitted = true

    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched()
      return
    }

    if ((this.roleForm.value.actions || []).length === 0) {
      this.error = 'Please select at least one action.'
      return
    }

    this.submitting = true
    this.error = ''

    const payload = {
      name: String(this.roleForm.value.name || '').trim(),
      description: String(this.roleForm.value.description || '').trim(),
      actions: this.roleForm.value.actions || [],
    }

    const request$: Observable<unknown> = this.role
      ? this.adminService.updateRole(this.role._id, payload).pipe(map(() => true))
      : this.adminService.createRole(payload).pipe(map(() => true))

    request$.subscribe({
      next: () => {
        this.submitting = false
        this.saved.emit(true)
        if (this.inlineMode) {
          this.roleForm.reset({ name: '', description: '', actions: [] })
          this.error = ''
          this.submitted = false
          this.actionsOpen = false
          for (const group of this.actionGroups) this.enabledGroups.set(group.key, false)
        }
        this.activeModal?.close(true)
      },
      error: (err: unknown) => {
        this.submitting = false
        this.error = (err as any)?.error?.message || 'Unable to save role'
      },
    })
  }

  onCancel(): void {
    if (this.inlineMode) {
      this.roleForm.reset({ name: '', description: '', actions: [] })
      this.error = ''
      this.submitted = false
      this.actionsOpen = false
      for (const group of this.actionGroups) this.enabledGroups.set(group.key, false)
      this.cancelled.emit()
      return
    }
    this.cancelled.emit()
    this.activeModal?.dismiss(false)
  }
}
