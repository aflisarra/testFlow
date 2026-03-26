import { CommonModule } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import {
  TestLabService,
  type TestCaseDto,
  type TestPlanDto,
} from '@/app/core/services/testlab.service'

@Component({
  selector: 'app-test-cases-validation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './test-cases-validation.component.html',
  styleUrl: './test-cases-validation.component.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TestCasesValidationComponent {
  private route = inject(ActivatedRoute)
  private testLabService = inject(TestLabService)

  loading = false
  errorMessage = ''

  testSuiteId = ''
  testPlans: TestPlanDto[] = []
  selectedPlanId: string | null = null

  generatingCasesPlanId: string | null = null
  testCasesByPlan: Record<string, TestCaseDto[]> = {}

  get selectedPlan(): TestPlanDto | null {
    const id = this.selectedPlanId
    if (!id) return null
    return this.testPlans.find((p) => p.id === id) || null
  }

  get selectedTestCases(): TestCaseDto[] {
    const id = this.selectedPlanId
    if (!id) return []
    return this.testCasesByPlan[id] || []
  }

  async ngOnInit() {
    this.testSuiteId = String(this.route.snapshot.paramMap.get('id') || '').trim()
    if (!this.testSuiteId) {
      this.errorMessage = 'Missing testSuiteId in URL.'
      return
    }
    await this.loadPlans()
  }

  async loadPlans() {
    this.loading = true
    this.errorMessage = ''
    try {
      const resp = await firstValueFrom(this.testLabService.getTestPlans(this.testSuiteId))
      this.testPlans = Array.isArray(resp?.testPlans) ? resp.testPlans : []
      if (!this.testPlans.length) {
        this.errorMessage = 'No test plans found for this TestSuite.'
        return
      }
      this.selectedPlanId = this.testPlans[0].id
      await this.generateTestCases(this.testPlans[0], false)
    } catch (err: unknown) {
      this.errorMessage =
        (err as any)?.error?.message || (err as any)?.message || 'Unable to load test plans'
    } finally {
      this.loading = false
    }
  }

  async onSelectPlan(plan: TestPlanDto) {
    this.selectedPlanId = plan.id
    if (this.testCasesByPlan[plan.id]?.length) return
    await this.generateTestCases(plan, false)
  }

  async onRegenerate(plan: TestPlanDto) {
    await this.generateTestCases(plan, true)
  }

  onDeleteTestCase(planId: string, testCaseId: string) {
    const list = this.testCasesByPlan[planId] || []
    this.testCasesByPlan[planId] = list.filter((tc) => tc.id !== testCaseId)
  }

  private async generateTestCases(plan: TestPlanDto, regenerate: boolean) {
    this.generatingCasesPlanId = plan.id
    this.errorMessage = ''
    try {
      const resp = await firstValueFrom(
        this.testLabService.generateTestCases({
          testSuiteId: this.testSuiteId,
          planId: plan.id,
          planTitle: plan.title,
          planDescription: plan.description,
          regenerate,
        })
      )
      this.testCasesByPlan[plan.id] = resp?.testCases || []
    } catch (err: unknown) {
      this.errorMessage =
        (err as any)?.error?.message || (err as any)?.message || 'Unable to generate test cases'
    } finally {
      this.generatingCasesPlanId = null
    }
  }
}

