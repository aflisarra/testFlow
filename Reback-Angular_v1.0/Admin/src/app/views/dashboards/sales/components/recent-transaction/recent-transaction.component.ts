import { Component } from '@angular/core'
import { TransactionsList } from '../../data'
import { CommonModule } from '@angular/common'

@Component({
  selector: 'sales-recent-transaction',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './recent-transaction.component.html',
  styles: ``,
})
export class RecentTransactionComponent {
  transactionList = TransactionsList.slice(0, 5)
}
