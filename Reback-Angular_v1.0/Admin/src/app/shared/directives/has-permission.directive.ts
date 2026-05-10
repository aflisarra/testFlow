import { Directive, Input, TemplateRef, ViewContainerRef, inject, OnDestroy } from '@angular/core'
import { Store } from '@ngrx/store'
import { Subscription } from 'rxjs'

import { getUser } from '@/app/store/authentication/authentication.selector'

type PermissionInput = number | number[] | null | undefined

@Directive({
  selector: '[hasPermission]',
  standalone: true,
})
export class HasPermissionDirective implements OnDestroy {
  private templateRef = inject(TemplateRef<unknown>)
  private viewContainerRef = inject(ViewContainerRef)
  private store = inject(Store)
  private sub: Subscription | null = null

  private requiredIds: number[] = []
  private hasView = false
  private userActions: number[] = []

  constructor() {
    this.sub = this.store.select(getUser).subscribe((user) => {
      this.userActions = Array.isArray((user as { actions?: unknown })?.actions)
        ? ((user as { actions?: number[] }).actions as number[])
        : []
      this.updateView(this.userActions)
    })
  }

  @Input()
  set hasPermission(value: PermissionInput) {
    this.requiredIds = Array.isArray(value)
      ? value.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
      : (typeof value === 'number' && Number.isFinite(value) ? [value] : [])

    // Re-evaluate synchronously using the latest cached user actions.
    this.updateView(this.userActions)
  }

  private updateView(userActions: number[]) {
    const ok =
      this.requiredIds.length === 0 || this.requiredIds.some((id) => userActions.includes(id))

    if (ok && !this.hasView) {
      this.viewContainerRef.createEmbeddedView(this.templateRef)
      this.hasView = true
      return
    }

    if (!ok && this.hasView) {
      this.viewContainerRef.clear()
      this.hasView = false
    }
  }

  ngOnDestroy(): void {
    if (this.sub) this.sub.unsubscribe()
    this.sub = null
  }
}
