import type { TestPlanDto } from '@/app/core/services/testlab.service'
import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, Output } from '@angular/core'

@Component({
  selector: 'app-plan-edit-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './plan-edit-modal.component.html',
  styleUrl: './plan-edit-modal.component.css',
})
export class PlanEditModalComponent {
  @Input() isOpen = false
  @Input() draft: TestPlanDto | null = null
  @Input() mode: 'edit' | 'add' = 'edit'

  @Output() closeModal = new EventEmitter<void>()
  @Output() saveModal = new EventEmitter<void>()
  @Output() fieldChange = new EventEmitter<{ field: keyof TestPlanDto; value: string }>()

  onFieldInput(field: keyof TestPlanDto, event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
    this.fieldChange.emit({ field, value: target?.value ?? '' })
  }

  onClose(): void {
    this.closeModal.emit()
  }

  onSave(): void {
    this.saveModal.emit()
  }
}