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
      document.documentElement.setAttribute('data-bs-theme', data.LAYOUT_THEME)

      document.documentElement.setAttribute('data-menu-color', data.MENU_COLOR)
      document.documentElement.setAttribute(
        'data-topbar-color',
        data.TOPBAR_COLOR
      )
      document.documentElement.setAttribute('data-menu-size', data.MENU_SIZE)
    })
  }
}
