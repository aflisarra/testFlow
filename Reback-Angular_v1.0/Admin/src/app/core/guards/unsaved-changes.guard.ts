import { type CanDeactivateFn } from '@angular/router'

import type { CanDeactivateComponent } from '@/app/interfaces/route-guards.interface'

export const unsavedChangesGuard: CanDeactivateFn<CanDeactivateComponent> = (
  component
) => {
  if (!component?.canDeactivate) return true
  return component.canDeactivate()
}
