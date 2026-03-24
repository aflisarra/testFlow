import { CommonModule } from '@angular/common'
import { CUSTOM_ELEMENTS_SCHEMA, Component, Input } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-modal.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ConfirmModalComponent {
  @Input() title = 'Confirm'
  @Input() message = 'Are you sure?'
  @Input() entityName = ''
  @Input() details = ''
  @Input() confirmText = 'Confirm'
  @Input() cancelText = 'Cancel'
  @Input() confirmButtonClass = 'btn-brand'
  @Input() icon = 'iconamoon:attention-circle-fill'

  constructor(public activeModal: NgbActiveModal) {}
}
