import { Component, inject } from '@angular/core'
import { ordersList, type OrderType } from '../../data'
import { CommonModule } from '@angular/common'
import { NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap'
import type { Observable } from 'rxjs'
import { TableService } from '@/app/core/services/table.service'
import { RouterLink } from '@angular/router'

@Component({
  selector: 'sales-recent-orders',
  standalone: true,
  imports: [CommonModule, NgbPaginationModule, RouterLink],
  templateUrl: './recent-orders.component.html',
  styles: ``,
})
export class RecentOrdersComponent {
  order$: Observable<OrderType[]>
  total$: Observable<number>

  public tableService = inject(TableService<OrderType>)

  constructor() {
    this.order$ = this.tableService.items$
    this.total$ = this.tableService.total$
  }

  ngOnInit(): void {
    this.tableService.setItems(ordersList, 5)
  }
}
