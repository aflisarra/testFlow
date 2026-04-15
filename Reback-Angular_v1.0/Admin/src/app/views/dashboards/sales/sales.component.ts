import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component } from '@angular/core'
import { OverviewComponent } from './components/overview/overview.component'
import { SalesByCategoryComponent } from './components/sales-by-category/sales-by-category.component'
import { NewAccountsComponent } from './components/new-accounts/new-accounts.component'
import { RecentTransactionComponent } from './components/recent-transaction/recent-transaction.component'
import { RecentOrdersComponent } from './components/recent-orders/recent-orders.component'
import { StateCardComponent } from '@/app/components/state-card/state-card.component'

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [
    PageTitleComponent,
    StateCardComponent,
    OverviewComponent,
    SalesByCategoryComponent,
    NewAccountsComponent,
    RecentTransactionComponent,
    RecentOrdersComponent,
  ],
  templateUrl: './sales.component.html',
  styles: ``,
})
export class SalesComponent {}
