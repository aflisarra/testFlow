import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component, inject } from '@angular/core'
import { InvoicesData, type InvoiceType } from '../data'
import { CommonModule, DatePipe } from '@angular/common'
import type { Observable } from 'rxjs'
import { TableService } from '@/app/core/services/table.service'
import { NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [
    PageTitleComponent,
    DatePipe,
    CommonModule,
    NgbPaginationModule,
    FormsModule,
    RouterLink,
  ],
  templateUrl: './invoices.component.html',
  styles: ``,
})
export class InvoicesComponent {
  invoices$: Observable<InvoiceType[]>
  total$: Observable<number>

  public tableService = inject(TableService<InvoiceType>)

  constructor() {
    this.invoices$ = this.tableService.items$
    this.total$ = this.tableService.total$
  }

  ngOnInit(): void {
    this.tableService.setItems(InvoicesData, 10)
  }
}
