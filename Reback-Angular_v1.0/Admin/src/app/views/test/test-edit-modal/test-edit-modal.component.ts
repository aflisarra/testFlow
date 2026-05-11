import type { TestCaseDto } from '@/app/core/services/testlab.service'
import { CommonModule } from '@angular/common'
import { Component, Input, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-test-edit-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './test-edit-modal.component.html',
  styleUrls: ['./test-edit-modal.component.css'],
})
export class TestEditModalComponent {
  @Input({ required: true }) testCase!: TestCaseDto

  activeModal = inject(NgbActiveModal)

  get stepsText(): string {
    return (this.testCase?.steps || []).join('\n')
  }

  set stepsText(value: string) {
    const steps = String(value || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    this.testCase = { ...this.testCase, steps }
  }

  onCancel(): void {
    this.activeModal.dismiss()
  }

  onSave(): void {
    const updated: TestCaseDto = {
      ...this.testCase,
      title: String(this.testCase?.title || '').trim(),
      expected_result: String(this.testCase?.expected_result || '').trim(),
      steps: Array.isArray(this.testCase?.steps) ? this.testCase.steps : [],
    }
    this.activeModal.close(updated)
  }
}
