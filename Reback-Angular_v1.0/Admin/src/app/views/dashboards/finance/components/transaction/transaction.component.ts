import { Component, inject } from '@angular/core'
import { transactionList, type TransactionType } from '../../data'
import { CommonModule } from '@angular/common'
import type { Observable } from 'rxjs'
import { TableService } from '@/app/core/services/table.service'
import { NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'finance-transaction',
  standalone: true,
  imports: [CommonModule, NgbPaginationModule],
  templateUrl: './transaction.component.html',
  styles: ``,
})
export class TransactionComponent {
  transaction$: Observable<TransactionType[]>
  total$: Observable<number>

  public tableService = inject(TableService<TransactionType>)

  constructor() {
    this.transaction$ = this.tableService.items$
    this.total$ = this.tableService.total$
  }

  ngOnInit(): void {
    this.tableService.setItems(transactionList, 10)
  }
}
