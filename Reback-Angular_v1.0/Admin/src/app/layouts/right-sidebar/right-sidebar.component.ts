import { Component, inject, OnInit } from '@angular/core'
import { NgbActiveOffcanvas } from '@ng-bootstrap/ng-bootstrap'
import { Store } from '@ngrx/store'
import { SimplebarAngularModule } from 'simplebar-angular'
import {
  changemenucolor,
  changesidebarsize,
  changetheme,
  changetopbarcolor,
  resetState,
} from '../../store/layout/layout-action'
import {
  getLayoutColor,
  getMenucolor,
  getSidebarsize,
  getTopbarcolor,
} from '../../store/layout/layout-selector'

import type { LayoutState } from '@/app/interfaces/layout.interface'

@Component({
  selector: 'app-right-sidebar',
  standalone: true,
  imports: [SimplebarAngularModule],
  templateUrl: './right-sidebar.component.html',
  styles: ``,
})
export class RightSidebarComponent implements OnInit {
  public isRightSidebarOpen = false

  offcanvas = inject(NgbActiveOffcanvas)
  store = inject(Store)

  color = ''
  topbar = ''
  menucolor = ''
  sidebarsize = ''

  ngOnInit(): void {
    this.store.select('layout').subscribe((data: LayoutState) => {
      this.color = data.LAYOUT_THEME ?? ''
      this.topbar = data.TOPBAR_COLOR ?? ''
      this.menucolor = data.MENU_COLOR ?? ''
      this.sidebarsize = data.MENU_SIZE ?? ''
    })
  }

  changeLayoutColor(color: string): void {
    this.store.dispatch(changetheme({ color }))

    this.store.select(getLayoutColor).subscribe((value: string) => {
      document.documentElement.setAttribute('data-bs-theme', value)
    })
  }

  changeTopbar(topbar: string): void {
    this.store.dispatch(changetopbarcolor({ topbar }))

    this.store.select(getTopbarcolor).subscribe((value: string) => {
      document.documentElement.setAttribute('data-topbar-color', value)
    })
  }

  changeMenu(menu: string): void {
    this.store.dispatch(changemenucolor({ menu }))

    this.store.select(getMenucolor).subscribe((value: string) => {
      document.documentElement.setAttribute('data-menu-color', value)
    })
  }

  changeSize(size: string): void {
    this.store.dispatch(changesidebarsize({ size }))

    this.store.select(getSidebarsize).subscribe((value: string) => {
      document.documentElement.setAttribute('data-menu-size', value)
    })
  }

  reset(): void {
    this.store.dispatch(resetState())
  }
}
