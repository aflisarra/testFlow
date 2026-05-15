import { CommonModule } from '@angular/common'
import { CUSTOM_ELEMENTS_SCHEMA, Component, Input, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './confirm-modal.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ConfirmModalComponent {
  @Input() title = 'Confirm'
  @Input() message = 'Are you sure you want to delete'
  @Input() entityName = ''
  @Input() details = ''
  @Input() confirmText = 'Confirm'
  @Input() cancelText = 'Cancel'
  @Input() confirmButtonClass = 'btn-brand'
  @Input() icon = 'iconamoon:trash-duotone';
  @Input() showCancel = true
  @Input() selectLabel = ''
  @Input() selectPlaceholder = '-- choose role --'
  @Input() selectOptions: { value: string; label: string }[] = []
  @Input() selectedValue = ''
  @Input() requireSelection = false

  activeModal = inject(NgbActiveModal)

  get hasSelect(): boolean {
    return this.selectOptions.length > 0
  }

  get confirmDisabled(): boolean {
    return this.requireSelection && !this.selectedValue
  }

  confirm(): void {
    this.activeModal.close(this.hasSelect ? this.selectedValue : true)
  }
}
