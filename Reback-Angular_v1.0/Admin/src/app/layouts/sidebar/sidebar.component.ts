import { CUSTOM_ELEMENTS_SCHEMA, Component, DestroyRef, inject } from '@angular/core'
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
export class SidebarComponent {
  menuItems: MenuItem[] = []
  activeMenuItems: string[] = []

  store = inject(Store)
  private destroyRef = inject(DestroyRef)
  router = inject(Router)
  trimmedURL = this.router.url?.replaceAll(
    basePath !== '' ? basePath + '/' : '',
    '/'
  )

  constructor() {
    this.router.events.forEach((event) => {
      if (event instanceof NavigationEnd) {
        this.trimmedURL = this.router.url?.replaceAll(
          basePath !== '' ? basePath + '/' : '',
          '/'
        )
        this._activateMenu()
        setTimeout(() => {
          this.scrollToActive()
        }, 200)
      }
    })
  }

  ngOnInit(): void {
    this.initMenu()
  }

  initMenu(): void {
    this.store
      .select(getUser)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        const actionIds = (user?.actions || []) as number[]
        this.menuItems = this.buildMenuForActions(actionIds)
      })
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this._activateMenu()
    })
    setTimeout(() => {
      this.scrollToActive()
    }, 200)
  }

  scrollToActive(): void {
    const activatedItem = document.querySelector('.nav-item li a.active')
    if (activatedItem) {
      const simplebarContent = document.querySelector(
        '.main-nav .simplebar-content-wrapper'
      )
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

  scrollTo(element: Element, to: number, duration: number): void {
    const start = element.scrollTop
    const change = to - start
    const increment = 20
    let currentTime = 0

    const animateScroll = () => {
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

    let matchingMenuItem = null

    if (div) {
      let items: any = div.getElementsByClassName('nav-link-ref')
      for (let i = 0; i < items.length; ++i) {
        if (
          this.trimmedURL === items[i].pathname ||
          (this.trimmedURL.startsWith('/invoice/') &&
            items[i].pathname === '/invoice/RB6985') ||
          (this.trimmedURL.startsWith('/ecommerce/product/') &&
            items[i].pathname === '/ecommerce/product/1')
        ) {
          matchingMenuItem = items[i]
          break
        }
      }

      if (matchingMenuItem) {
        const mid = matchingMenuItem.getAttribute('aria-controls')
        const activeMt = findMenuItem(this.menuItems, mid)

        if (activeMt) {
          const matchingObjs = [
            activeMt['key'],
            ...findAllParent(this.menuItems, activeMt),
          ]

          this.activeMenuItems = matchingObjs
          this.menuItems.forEach((menu: MenuItem) => {
            menu.collapsed = !matchingObjs.includes(menu.key!)
          })
        }
      }
    }
  }

  /**
   * Returns true or false if given menu item has child or not
   * @param item menuItem
   */
  hasSubmenu(menu: MenuItem): boolean {
    return menu.subMenu ? true : false
  }

  /**
   * toggles open menu
   * @param menuItem clicked menuitem
   * @param collapse collpase instance
   */
  toggleMenuItem(menuItem: MenuItem, collapse: NgbCollapse): void {
    collapse.toggle()
    let openMenuItems: string[]
    if (!menuItem.collapsed) {
      openMenuItems = [
        menuItem['key'],
        ...findAllParent(this.menuItems, menuItem),
      ]
      this.menuItems.forEach((menu: MenuItem) => {
        if (!openMenuItems.includes(menu.key!)) {
          menu.collapsed = true
        }
      })
    }
  }

  changeSidebarSize() {
    let size = document.documentElement.getAttribute('data-menu-size')
    if (size == 'sm-hover') {
      size = 'sm-hover-active'
    } else {
      size = 'sm-hover'
    }
    this.store.dispatch(changesidebarsize({ size }))
    this.store.select(getSidebarsize).subscribe((size) => {
      document.documentElement.setAttribute('data-menu-size', size)
    })
  }

  private buildMenuForActions(actionIds: number[]): MenuItem[] {
    const clonedMenu = this.cloneMenu(MENU)
    if (!actionIds || actionIds.length === 0) return clonedMenu

    const ids = new Set(
      (actionIds || [])
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x))
    )

    // Map UI pages to backend action IDs (seed.actions.js)
    const roleActionIds = new Set([6, 7, 8, 9])
    const userActionIds = new Set([10, 2, 3, 4, 5])
    const projectActionIds = new Set([11, 12, 13, 14, 15, 16])

    const usersMenu = clonedMenu.find((m) => m.key === 'users')
    if (usersMenu?.subMenu?.length) {
      usersMenu.subMenu = (usersMenu.subMenu as MenuItem[]).filter((child) => {
        if (child.link === '/admin/roles') {
          return [...roleActionIds].some((id) => ids.has(id))
        }
        if (child.link === '/admin/users') {
          return [...userActionIds].some((id) => ids.has(id))
        }
        return true
      })
    }

    const projectMenu = clonedMenu.find((m) =>
      Array.isArray(m.subMenu) && (m.subMenu as MenuItem[]).some((c) => c.link === '/project')
    )
    if (projectMenu?.subMenu?.length) {
      projectMenu.subMenu = (projectMenu.subMenu as MenuItem[]).filter((child) => {
        if (child.link === '/project') {
          return [...projectActionIds].some((id) => ids.has(id))
        }
        return true
      })
    }

    return clonedMenu.filter((m) => !m.subMenu || (m.subMenu as MenuItem[]).length > 0 || m.isTitle)
  }

  private cloneMenu(menu: MenuItem[]): MenuItem[] {
    return (menu || []).map((item) => this.cloneMenuItem(item))
  }

  private cloneMenuItem(item: MenuItem): MenuItem {
    return {
      ...item,
      subMenu: Array.isArray(item.subMenu)
        ? (item.subMenu as MenuItem[]).map((child) => this.cloneMenuItem(child))
        : item.subMenu,
    }
  }
}
