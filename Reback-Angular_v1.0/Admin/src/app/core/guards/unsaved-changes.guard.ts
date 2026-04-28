import { type CanDeactivateFn } from '@angular/router'

export type CanDeactivateComponent =
  | {
      canDeactivate: () => boolean | Promise<boolean>
    }
  | any

export const unsavedChangesGuard: CanDeactivateFn<CanDeactivateComponent> = (component) => {
  if (!component || typeof component.canDeactivate !== 'function') return true
  return component.canDeactivate()
}

