import { inject } from '@angular/core'
import { RedirectCommand, Router, type CanActivateFn, type UrlTree } from '@angular/router'
import { Store } from '@ngrx/store'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'

import { getUser } from '@/app/store/authentication/authentication.selector'

import type { UserWithActions } from '@/app/interfaces/authorization.interface'

function toInt(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function requireAnyAction(required: (number | string)[]): CanActivateFn {
  return async (_route, state) => {
    const store = inject(Store)
    const router = inject(Router)

    const user = await firstValueFrom(store.select(getUser).pipe(take(1)))

    const actions = Array.isArray((user as UserWithActions)?.actions)
      ? (user as UserWithActions).actions!
      : []

    const requiredIds = required
      .map((x) => (typeof x === 'string' ? toInt(x) : x))
      .filter((x): x is number => typeof x === 'number' && Number.isFinite(x))

    const ok =
      requiredIds.length === 0 || requiredIds.some((id) => actions.includes(id))

    if (ok) return true

    const urlTree: UrlTree = router.createUrlTree(['/unauthorized'], {
      queryParams: { from: state.url },
    })

    return new RedirectCommand(urlTree, { skipLocationChange: true })
  }
}
