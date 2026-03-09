import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { StateComponent } from './components/state/state.component'
import { RevenueComponent } from './components/revenue/revenue.component'
import { ExpensesComponent } from './components/expenses/expenses.component'
import { TransactionComponent } from './components/transaction/transaction.component'
import { RevenueSourcesComponent } from './components/revenue-sources/revenue-sources.component'

@Component({
  selector: 'app-finance',
  standalone: true,
  imports: [
    PageTitleComponent,
    StateComponent,
    RevenueComponent,
    ExpensesComponent,
    TransactionComponent,
    RevenueSourcesComponent,
  ],
  templateUrl: './finance.component.html',
  styles: ``,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class FinanceComponent {}
