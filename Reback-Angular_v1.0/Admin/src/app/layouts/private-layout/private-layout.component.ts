import { Component, DestroyRef, inject, OnInit } from '@angular/core'
import { Store } from '@ngrx/store'
import { VerticalComponent } from '../vertical/vertical.component'
import type { LayoutState } from '@/app/store/layout/layout-reducers'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'

@Component({
  selector: 'app-private-layout',
  standalone: true,
  imports: [VerticalComponent],
  template: ` <app-vertical></app-vertical> `,
  styles: ``,
})
export class PrivateLayoutComponent implements OnInit {
  private store = inject(Store)
  private destroyRef = inject(DestroyRef)

  ngOnInit(): void {
    this.store.select('layout').pipe(takeUntilDestroyed(this.destroyRef)).subscribe((data: LayoutState) => {
      const menuSize = data?.MENU_SIZE || 'default'

      document.documentElement.setAttribute('data-bs-theme', 'light')
      document.documentElement.setAttribute('data-menu-color', 'light')
      document.documentElement.setAttribute('data-topbar-color', 'light')
      document.documentElement.setAttribute('data-menu-size', menuSize)
    })
  }
}
