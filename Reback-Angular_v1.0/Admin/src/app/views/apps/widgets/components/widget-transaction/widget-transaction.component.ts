import { TransactionsList } from '@/app/views/dashboards/sales/data'
import { CommonModule } from '@angular/common'
import { Component } from '@angular/core'
import { SimplebarAngularModule } from 'simplebar-angular'

@Component({
  selector: 'widget-transaction',
  standalone: true,
  imports: [SimplebarAngularModule, CommonModule],
  templateUrl: './widget-transaction.component.html',
  styles: ``,
})
export class WidgetTransactionComponent {
  transactions = TransactionsList
}
