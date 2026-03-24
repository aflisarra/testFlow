import { Component } from '@angular/core'
import { accountData } from '../../data'
import { CommonModule } from '@angular/common'

@Component({
  selector: 'sales-new-accounts',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './new-accounts.component.html',
  styles: ``,
})
export class NewAccountsComponent {
  accountList = accountData
}
