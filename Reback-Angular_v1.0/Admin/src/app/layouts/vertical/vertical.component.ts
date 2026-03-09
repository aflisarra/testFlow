import { Component, HostListener, inject, Renderer2 } from '@angular/core'
import { SidebarComponent } from '../sidebar/sidebar.component'
import { TopbarComponent } from '../topbar/topbar.component'
import { FooterComponent } from '../footer/footer.component'
import { RouterModule } from '@angular/router'
import { RightSidebarComponent } from '../right-sidebar/right-sidebar.component'
import { NgbActiveOffcanvas, NgbOffcanvas } from '@ng-bootstrap/ng-bootstrap'
import { Store } from '@ngrx/store'
import { changesidebarsize } from '@store/layout/layout-action'
import { getSidebarsize } from '@store/layout/layout-selector'

@Component({
  selector: 'app-vertical',
  standalone: true,
  imports: [SidebarComponent, TopbarComponent, FooterComponent, RouterModule],
  template: `
    <div class="wrapper">
      <app-topbar
        (settingsButtonClicked)="onSettingsButtonClicked()"
        (mobileMenuButtonClicked)="onToggleMobileMenu()"
      ></app-topbar>
      <app-sidebar></app-sidebar>

      <div class="page-content">
        <!-- Start Content-->
        <div class="container-xxl">
          <router-outlet></router-outlet>
        </div>

        <app-footer></app-footer>
      </div>
    </div>
  `,
  styles: ``,
  providers: [NgbActiveOffcanvas],
})
export class VerticalComponent {
  private offcanvasService = inject(NgbOffcanvas)
  private store = inject(Store)
  private renderer = inject(Renderer2)

  ngOnInit(): void {
    this.onResize()
  }

  @HostListener('window:resize', ['$event'])
  onResize() {
    if (document.documentElement.clientWidth <= 1140) {
      this.store.dispatch(changesidebarsize({ size: 'hidden' }))
    } else {
      this.store.dispatch(changesidebarsize({ size: 'default' }))
      document.documentElement.classList.remove('sidebar-enable')
      const backdrop = document.querySelector('.offcanvas-backdrop')
      if (backdrop) this.renderer.removeChild(document.body, backdrop)
    }
    this.store.select(getSidebarsize).subscribe((size: string) => {
      this.renderer.setAttribute(
        document.documentElement,
        'data-sidenav-size',
        size
      )
    })
  }

  onSettingsButtonClicked() {
    this.offcanvasService.open(RightSidebarComponent, { position: 'end' })
  }

  onToggleMobileMenu() {
    this.store.select(getSidebarsize).subscribe((size: any) => {
      document.documentElement.setAttribute('data-menu-size', size)
    })

    const size = document.documentElement.getAttribute('data-menu-size')

    document.documentElement.classList.toggle('sidebar-enable')
    if (size != 'hidden') {
      if (document.documentElement.classList.contains('sidebar-enable')) {
        this.store.dispatch(changesidebarsize({ size: 'condensed' }))
      } else {
        this.store.dispatch(changesidebarsize({ size: 'default' }))
      }
    } else {
      this.showBackdrop()
    }
  }

  showBackdrop() {
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
