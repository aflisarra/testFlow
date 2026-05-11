import { CommonModule } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA, Input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import type { TestCasesValidationComponent } from './list-test.component'

@Component({
  selector: 'app-test-suite-details',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './test-suite-details.component.html',
  styleUrls: ['./list-test.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TestSuiteDetailsComponent {
  @Input({ required: true }) vm!: TestCasesValidationComponent
}
