import { CommonModule } from '@angular/common'
import { Component, OnInit, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog'
import { CKEditorModule } from '@ckeditor/ckeditor5-angular'
import ClassicEditor from '@ckeditor/ckeditor5-build-classic'
import { firstValueFrom } from 'rxjs'

import { TestLabService } from '@/app/core/services/testlab.service'

export interface SpecEditorDialogData {
  testSuiteId: string
  suiteName: string
}

@Component({
  selector: 'app-spec-editor-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, CKEditorModule],
  templateUrl: './spec-editor-dialog.component.html',
  styleUrls: ['./spec-editor-dialog.component.css'],
})
export class SpecEditorDialogComponent implements OnInit {
  private testLabService = inject(TestLabService)
  private dialogRef = inject(MatDialogRef<SpecEditorDialogComponent>)
  readonly data = inject<SpecEditorDialogData>(MAT_DIALOG_DATA)

  readonly Editor = ClassicEditor
  loading = true
  saving = false
  errorMessage = ''
  fileName = ''
  htmlContent = ''
  editorConfig = {
    placeholder: 'Edit the specification here...',
    toolbar: [
      'heading',
      '|',
      'bold',
      'italic',
      'link',
      'bulletedList',
      'numberedList',
      '|',
      'undo',
      'redo',
    ],
  }

  ngOnInit(): void {
    void this.loadContent()
  }

  private async loadContent(): Promise<void> {
    this.loading = true
    this.errorMessage = ''
    try {
      const resp = await firstValueFrom(this.testLabService.getSpecificationContent(this.data.testSuiteId))
      this.fileName = resp?.fileName || ''
      this.htmlContent = String(resp?.content || '')
      if (!this.htmlContent.trim()) {
        this.errorMessage = 'Specification content is empty on the server.'
      }
    } catch (err: unknown) {
      const httpErr = err as { error?: { message?: string }; message?: string }
      this.errorMessage = httpErr?.error?.message || httpErr?.message || 'Unable to load specification content'
    } finally {
      this.loading = false
    }
  }

  cancel(): void {
    if (this.saving) return
    this.dialogRef.close(false)
  }

  async save(): Promise<void> {
    if (this.saving) return
    this.saving = true
    this.errorMessage = ''
    try {
      const resp = await firstValueFrom(
        this.testLabService.updateSpecificationContent(this.data.testSuiteId, this.htmlContent)
      )
      this.dialogRef.close(resp)
    } catch (err: unknown) {
      const httpErr = err as { error?: { message?: string }; message?: string }
      this.errorMessage = httpErr?.error?.message || httpErr?.message || 'Unable to save specification content'
    } finally {
      this.saving = false
    }
  }
}