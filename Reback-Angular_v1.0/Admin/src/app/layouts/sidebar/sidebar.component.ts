import { CUSTOM_ELEMENTS_SCHEMA, Component, DestroyRef, inject, OnInit, AfterViewInit } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { SimplebarAngularModule } from 'simplebar-angular'
import { NavigationEnd, Router, RouterModule } from '@angular/router'
import {
  NgbCollapse,
  NgbCollapseModule,
  NgbTooltipModule,
} from '@ng-bootstrap/ng-bootstrap'
import { CommonModule } from '@angular/common'
import { findAllParent, findMenuItem } from '../../helpers/utils'
import { LogoBoxComponent } from '@/app/components/logo-box.component'
import { MENU, type MenuItem } from '@/app/common/menu-meta'
import { changesidebarsize } from '@/app/store/layout/layout-action'
import { Store } from '@ngrx/store'
import { getSidebarsize } from '@/app/store/layout/layout-selector'
import { basePath } from '@/app/common/constants'
import { getUser } from '@/app/store/authentication/authentication.selector'

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    SimplebarAngularModule,
    RouterModule,
    NgbCollapseModule,
    CommonModule,
    NgbTooltipModule,
    LogoBoxComponent,
  ],
  templateUrl: './sidebar.component.html',
  styles: ``,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SidebarComponent implements OnInit, AfterViewInit {
  menuItems: MenuItem[] = []
  activeMenuItems: string[] = []

  store = inject(Store)
  private destroyRef = inject(DestroyRef)
  router = inject(Router)

  trimmedURL = this.router.url.replaceAll(
    basePath !== '' ? basePath + '/' : '',
    '/'
  )

  ngOnInit(): void {
    this.initMenu()

    this.router.events
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event instanceof NavigationEnd) {
          this.trimmedURL = this.router.url.replaceAll(
            basePath !== '' ? basePath + '/' : '',
            '/'
          )

          this._activateMenu()
          setTimeout(() => this.scrollToActive(), 200)
        }
      })
  }

  initMenu(): void {
    this.store
      .select(getUser)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user: { actions?: number[] } | null) => {
        const actionIds = user?.actions ?? []
        this.menuItems = this.buildMenuForActions(actionIds)
      })
  }

  ngAfterViewInit(): void {
    setTimeout(() => this._activateMenu())
    setTimeout(() => this.scrollToActive(), 200)
  }

  scrollToActive(): void {
    const activatedItem = document.querySelector('.nav-item li a.active')

    if (activatedItem) {
      const simplebarContent = document.querySelector(
        '.main-nav .simplebar-content-wrapper'
      ) as HTMLElement | null

      if (simplebarContent) {
        const activatedItemRect = activatedItem.getBoundingClientRect()
        const simplebarContentRect = simplebarContent.getBoundingClientRect()

        const activatedItemOffsetTop =
          activatedItemRect.top + simplebarContent.scrollTop

        const centerOffset =
          activatedItemOffsetTop -
          simplebarContentRect.top -
          simplebarContent.clientHeight / 2 +
          activatedItemRect.height / 2

        this.scrollTo(simplebarContent, centerOffset, 600)
      }
    }
  }

  easeInOutQuad(t: number, b: number, c: number, d: number): number {
    t /= d / 2

    if (t < 1) return (c / 2) * t * t + b

    t--

    return (-c / 2) * (t * (t - 2) - 1) + b
  }

  scrollTo(element: HTMLElement, to: number, duration: number): void {
    const start = element.scrollTop
    const change = to - start
    const increment = 20
    let currentTime = 0

    const animateScroll = (): void => {
      currentTime += increment

      const val = this.easeInOutQuad(currentTime, start, change, duration)

      element.scrollTop = val

      if (currentTime < duration) {
        setTimeout(animateScroll, increment)
      }
    }

    animateScroll()
  }

  _activateMenu(): void {
    const div = document.querySelector('.navbar-nav')

    let matchingMenuItem: Element | null = null

    if (div) {
      const items = div.getElementsByClassName('nav-link-ref')

      for (const item of Array.from(items)) {
        const link = item as HTMLAnchorElement

        if (
          this.trimmedURL === link.pathname ||
          (this.trimmedURL.startsWith('/invoice/') &&
            link.pathname === '/invoice/RB6985') ||
          (this.trimmedURL.startsWith('/ecommerce/product/') &&
            link.pathname === '/ecommerce/product/1')
        ) {
          matchingMenuItem = link
          break
        }
      }

      if (matchingMenuItem) {
        const mid = matchingMenuItem.getAttribute('aria-controls') ?? ''
        const activeMt = findMenuItem(this.menuItems, mid)

        if (activeMt?.key) {
          const matchingObjs = [
            activeMt.key,
            ...findAllParent(this.menuItems, activeMt),
          ]

          this.activeMenuItems = matchingObjs

          this.menuItems.forEach((menu) => {
            menu.collapsed = !matchingObjs.includes(menu.key ?? '')
          })
        }
      }
    }
  }

  hasSubmenu(menu: MenuItem): boolean {
    return !!menu.subMenu?.length
  }

  toggleMenuItem(menuItem: MenuItem, collapse: NgbCollapse): void {
    collapse.toggle()

    if (!menuItem.collapsed && menuItem.key) {
      const openMenuItems = [
        menuItem.key,
        ...findAllParent(this.menuItems, menuItem),
      ]

      this.menuItems.forEach((menu) => {
        if (!openMenuItems.includes(menu.key ?? '')) {
          menu.collapsed = true
        }
      })
    }
  }

  changeSidebarSize(): void {
    let size =
      document.documentElement.getAttribute('data-menu-size') ?? 'sm-hover'

    size = size === 'sm-hover' ? 'sm-hover-active' : 'sm-hover'

    this.store.dispatch(changesidebarsize({ size }))

    this.store.select(getSidebarsize).subscribe((value: string) => {
      document.documentElement.setAttribute('data-menu-size', value)
    })
  }

  private buildMenuForActions(actionIds: number[]): MenuItem[] {
    const clonedMenu = this.cloneMenu(MENU)

    if (actionIds.length === 0) {
      return clonedMenu
    }

    const ids = new Set(
      actionIds.map((x) => Number(x)).filter((x) => Number.isFinite(x))
    )

    const canManageRoles = ids.has(8)
    const canManageUsers = ids.has(10) || ids.has(4)
    const canListProjects = ids.has(11)

    const usersMenu = clonedMenu.find((m) => m.key === 'users')

    if (usersMenu?.subMenu) {
      usersMenu.subMenu = usersMenu.subMenu.filter((child) => {
        if (child.link === '/admin/roles') return canManageRoles
        if (child.link === '/admin/users') return canManageUsers
        return true
      })
    }

    const projectMenu = clonedMenu.find((m) =>
      m.subMenu?.some((c) => c.link === '/project')
    )

    if (projectMenu?.subMenu) {
      projectMenu.subMenu = projectMenu.subMenu.filter((child) => {
        if (child.link === '/project') return canListProjects
        return true
      })
    }

    return clonedMenu.filter(
      (m) => !m.subMenu || m.subMenu.length > 0 || m.isTitle
    )
  }

  private cloneMenu(menu: MenuItem[]): MenuItem[] {
    return menu.map((item) => this.cloneMenuItem(item))
  }

  private cloneMenuItem(item: MenuItem): MenuItem {
    return {
      ...item,
      subMenu: item.subMenu?.map((child) => this.cloneMenuItem(child)),
    }
  }
}
