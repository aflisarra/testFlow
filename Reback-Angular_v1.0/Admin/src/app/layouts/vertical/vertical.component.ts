import { Component, HostListener, inject, Renderer2, DestroyRef, OnInit } from '@angular/core'
import { SidebarComponent } from '../sidebar/sidebar.component'
import { TopbarComponent } from '../topbar/topbar.component'
import { RouterModule } from '@angular/router'
import { Store } from '@ngrx/store'
import { changesidebarsize } from '@store/layout/layout-action'
import { getSidebarsize } from '@store/layout/layout-selector'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'

@Component({
  selector: 'app-vertical',
  standalone: true,
  imports: [SidebarComponent, TopbarComponent, RouterModule],
  template: `
    <div class="wrapper">
      <app-topbar
        (mobileMenuButtonClicked)="onToggleMobileMenu()"
      ></app-topbar>
      <app-sidebar></app-sidebar>

      <div class="page-content">
        <div class="container-xxl">
          <router-outlet></router-outlet>
        </div>
      </div>
    </div>
  `,
  styles: ``,
})
export class VerticalComponent implements OnInit {
  private store = inject(Store)
  private renderer = inject(Renderer2)
  private destroyRef = inject(DestroyRef)

  ngOnInit(): void {
    this.onResize()
  }

  @HostListener('window:resize')
  onResize(): void {
    const isMobile = document.documentElement.clientWidth <= 1140

    this.store.dispatch(
      changesidebarsize({ size: isMobile ? 'hidden' : 'default' })
    )

    if (!isMobile) {
      document.documentElement.classList.remove('sidebar-enable')
      const backdrop = document.querySelector('.offcanvas-backdrop')
      if (backdrop) this.renderer.removeChild(document.body, backdrop)
    }

    this.store
      .select(getSidebarsize)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((size: string) => {
        this.renderer.setAttribute(
          document.documentElement,
          'data-sidenav-size',
          size
        )
      })
  }

  onToggleMobileMenu(): void {
    const size = document.documentElement.getAttribute('data-menu-size') || ''

    document.documentElement.classList.toggle('sidebar-enable')

    if (size !== 'hidden') {
      this.store.dispatch(
        changesidebarsize({
          size: document.documentElement.classList.contains('sidebar-enable')
            ? 'condensed'
            : 'default',
        })
      )
    } else {
      this.showBackdrop()
    }
  }

  showBackdrop(): void {
    const backdrop = this.renderer.createElement('div')

    this.renderer.addClass(backdrop, 'offcanvas-backdrop')
    this.renderer.addClass(backdrop, 'fade')
    this.renderer.addClass(backdrop, 'show')

    this.renderer.appendChild(document.body, backdrop)
    this.renderer.setStyle(document.body, 'overflow', 'hidden')

    if (window.innerWidth > 1040) {
      this.renderer.setStyle(document.body, 'paddingRight', '15px')
    }

    this.renderer.listen(backdrop, 'click', () => {
      document.documentElement.classList.remove('sidebar-enable')
      this.renderer.removeChild(document.body, backdrop)
      this.renderer.setStyle(document.body, 'overflow', null)
      this.renderer.setStyle(document.body, 'paddingRight', null)
    })
  }
}
