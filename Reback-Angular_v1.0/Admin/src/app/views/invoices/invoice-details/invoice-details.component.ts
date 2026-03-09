import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component, inject, type OnInit } from '@angular/core'
import { InvoiceDetailsProduct, InvoicesData, type InvoiceType } from '../data'
import { ActivatedRoute, Router } from '@angular/router'

@Component({
  selector: 'app-invoice-details',
  standalone: true,
  imports: [PageTitleComponent],
  templateUrl: './invoice-details.component.html',
  styles: ``,
})
export class InvoiceDetailsComponent implements OnInit {
  invoiceDetail!: InvoiceType
  productList = InvoiceDetailsProduct
  subTotal: number = 0
  discountPrice: number = 0
  totalAmount: number = 0

  private router = inject(ActivatedRoute)

  ngOnInit(): void {
    let invoiceId: string | null
    this.router.paramMap.subscribe((params) => {
      invoiceId = params.get('id')
    })

    InvoicesData.forEach((invoice) => {
      if (invoice.invoice_number == invoiceId) {
        this.invoiceDetail = invoice
      }
    })

    this.productList.forEach((item) => {
      this.subTotal += item.qty * item.price
    })

    this.discountPrice = this.subTotal * 0.1
    this.totalAmount = this.subTotal - this.discountPrice
  }
}
