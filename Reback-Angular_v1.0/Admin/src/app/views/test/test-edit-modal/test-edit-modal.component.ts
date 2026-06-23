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

  get testDataText(): string {
    const value = this.testCase?.test_data
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (Array.isArray(value)) return value.map((v) => String(v)).join('\n')

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
      return entries.map(([key, val]) => `${key}: ${String(val)}`).join('\n')
    }

    return String(value)
  }

  private parseTestDataLines(value: string): string[] {
    return String(value || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  set testDataText(value: string) {
    const lines = this.parseTestDataLines(value)
    console.log('[TestEditModal] parsed test_data lines', {
      raw: value,
      lines,
      count: lines.length,
    })
    this.testCase = {
      ...this.testCase,
      // Keep each credential/value as a separate array entry so the
      // backend and AI fallback can consume them in order.
      test_data: lines,
    }
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
      test_data: Array.isArray(this.testCase?.test_data)
        ? this.testCase.test_data
        : this.parseTestDataLines(this.testDataText),
    }
    console.log('[TestEditModal] saving test case', {
      id: updated?.id,
      test_data: updated?.test_data,
    })
    this.activeModal.close(updated)
  }
}
