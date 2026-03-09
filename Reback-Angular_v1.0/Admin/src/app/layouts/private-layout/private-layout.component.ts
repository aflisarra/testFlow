import { Component, inject } from '@angular/core'
import { Store } from '@ngrx/store'
import { VerticalComponent } from '../vertical/vertical.component'

@Component({
  selector: 'app-private-layout',
  standalone: true,
  imports: [VerticalComponent],
  template: ` <app-vertical></app-vertical> `,
  styles: ``,
})
export class PrivateLayoutComponent {
  layoutType: any

  private store = inject(Store)

  ngOnInit(): void {
    this.store.select('layout').subscribe((data) => {
      this.layoutType = data.LAYOUT
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
