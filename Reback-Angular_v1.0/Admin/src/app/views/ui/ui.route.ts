import { Route } from '@angular/router'
import { AccordionsComponent } from './accordions/accordions.component'
import { AlertsComponent } from './alerts/alerts.component'
import { AvatarsComponent } from './avatars/avatars.component'
import { BreadcrumbComponent } from './breadcrumb/breadcrumb.component'
import { ButtonsComponent } from './buttons/buttons.component'
import { CardsComponent } from './cards/cards.component'
import { CarouselComponent } from './carousel/carousel.component'
import { DropdownsComponent } from './dropdowns/dropdowns.component'
import { ListGroupComponent } from './list-group/list-group.component'
import { ModalsComponent } from './modals/modals.component'
import { TabsComponent } from './tabs/tabs.component'
import { OffcanvasComponent } from './offcanvas/offcanvas.component'
import { PaginationComponent } from './pagination/pagination.component'
import { PlaceholdersComponent } from './placeholders/placeholders.component'
import { PopoversComponent } from './popovers/popovers.component'
import { ProgressComponent } from './progress/progress.component'
import { ScrollspyComponent } from './scrollspy/scrollspy.component'
import { SpinnersComponent } from './spinners/spinners.component'
import { ToastsComponent } from './toasts/toasts.component'
import { TooltipsComponent } from './tooltips/tooltips.component'
import { BadgesComponent } from './badges/badges.component'
import { CollapseComponent } from './collapse/collapse.component'

export const UI_ROUTES: Route[] = [
  {
    path: 'accordions',
    component: AccordionsComponent,
    data: { title: 'Accordion' },
  },
  {
    path: 'alerts',
    component: AlertsComponent,
    data: { title: 'Alerts' },
  },
  {
    path: 'avatars',
    component: AvatarsComponent,
    data: { title: 'Avatar' },
  },
  {
    path: 'badges',
    component: BadgesComponent,
    data: { title: 'Badges' },
  },
  {
    path: 'breadcrumb',
    component: BreadcrumbComponent,
    data: { title: 'Breadcrumb' },
  },
  {
    path: 'buttons',
    component: ButtonsComponent,
    data: { title: 'Buttons' },
  },
  {
    path: 'cards',
    component: CardsComponent,
    data: { title: 'Card' },
  },
  {
    path: 'carousel',
    component: CarouselComponent,
    data: { title: 'Carousel' },
  },
  {
    path: 'collapse',
    component: CollapseComponent,
    data: { title: 'Collapse' },
  },
  {
    path: 'dropdowns',
    component: DropdownsComponent,
    data: { title: 'Dropdown' },
  },
  {
    path: 'list-group',
    component: ListGroupComponent,
    data: { title: 'List Group' },
  },
  {
    path: 'modals',
    component: ModalsComponent,
    data: { title: 'Modal' },
  },
  {
    path: 'tabs',
    component: TabsComponent,
    data: { title: 'Tabs' },
  },
  {
    path: 'offcanvas',
    component: OffcanvasComponent,
    data: { title: 'Offcanvas' },
  },
  {
    path: 'pagination',
    component: PaginationComponent,
    data: { title: 'Pagination' },
  },
  {
    path: 'placeholders',
    component: PlaceholdersComponent,
    data: { title: 'Placeholders' },
  },
  {
    path: 'popovers',
    component: PopoversComponent,
    data: { title: 'Popovers' },
  },
  {
    path: 'progress',
    component: ProgressComponent,
    data: { title: 'Progress' },
  },
  {
    path: 'scrollspy',
    component: ScrollspyComponent,
    data: { title: 'Scrollspy' },
  },
  {
    path: 'spinners',
    component: SpinnersComponent,
    data: { title: 'Spinners' },
  },
  {
    path: 'toasts',
    component: ToastsComponent,
    data: { title: 'Toasts' },
  },
  {
    path: 'tooltips',
    component: TooltipsComponent,
    data: { title: 'Tooltips' },
  },
]
