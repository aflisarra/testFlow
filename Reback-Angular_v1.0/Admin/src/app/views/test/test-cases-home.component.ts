import { CommonModule } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { Store } from '@ngrx/store'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'
import { ToastrService } from 'ngx-toastr'

import { AuthenticationService } from '@/app/core/services/auth.service'
import { jwt_decode } from '@/app/core/utils/jwt-decode'
import { getUser } from '@/app/store/authentication/authentication.selector'

import {
  TestLabService,
  type TestCaseDto,
  type TestPlanDto,
  type TestSuiteDto,
} from '@/app/core/services/testlab.service'

@Component({
  selector: 'app-test-cases-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './test-cases-home.component.html',
  styleUrl: './test-cases-home.component.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TestCasesHomeComponent {
  private store = inject(Store)
  private authService = inject(AuthenticationService)
  private testLabService = inject(TestLabService)
  private router = inject(Router)
  private route = inject(ActivatedRoute)
  private toastr = inject(ToastrService)

  loading = false
  generating = false
  errorMessage = ''

  suites: TestSuiteDto[] = []

  plans: TestPlanDto[] = []
  testCasesByPlan: Record<string, TestCaseDto[]> = {}
  expandedPlans: Record<string, boolean> = {}

  expandedSuites: Record<string, boolean> = {}
  suitePlans: Record<string, TestPlanDto[]> = {}
  loadingSuitePlans: Record<string, boolean> = {}

  testSuiteId = ''
  selectedPlanId = ''

  get generatedCount(): number {
    return this.plans.filter((p) => (this.testCasesByPlan[p.id]?.length || 0) > 0).length
  }

  get progressPercent(): number {
    if (!this.plans.length) return 0
    return (this.generatedCount / this.plans.length) * 100
  }

  get currentPlanNumber(): number {
    if (!this.plans.length) return 0
    const current = this.currentPlanPreview
    if (!current) return 0
    const idx = this.plans.findIndex((p) => p.id === current.id)
    return idx >= 0 ? idx + 1 : 1
  }

  get currentPlanPreview(): TestPlanDto | null {
    if (!this.plans.length) return null
    if (this.selectedPlanId) {
      const selected = this.plans.find((p) => p.id === this.selectedPlanId)
      if (selected) return selected
    }
    const pending = this.plans.find((p) => (this.testCasesByPlan[p.id]?.length || 0) === 0)
    return pending || this.plans[0]
  }

  get currentPlanCases(): TestCaseDto[] {
    const plan = this.currentPlanPreview
    if (!plan) return []
    return this.testCasesByPlan[plan.id] || []
  }

  togglePlan(planId: string) {
    this.expandedPlans[planId] = !this.expandedPlans[planId]
    this.selectedPlanId = planId
  }

  async toggleSuite(suite: TestSuiteDto) {
    const suiteId = suite._id
    if (!suiteId) return

    this.expandedSuites[suiteId] = !this.expandedSuites[suiteId]

    if (this.expandedSuites[suiteId] && !this.suitePlans[suiteId] && !this.loadingSuitePlans[suiteId]) {
      this.loadingSuitePlans[suiteId] = true
      try {
        const resp = await firstValueFrom(this.testLabService.getTestPlans(suiteId))
        this.suitePlans[suiteId] = resp?.testPlans || []
      } catch (err) {
        console.error('Erreur chargement plans suite', err)
      } finally {
        this.loadingSuitePlans[suiteId] = false
      }
    }
  }

  async ngOnInit() {
    this.testSuiteId =
      String(this.route.snapshot.paramMap.get('id') || '').trim() ||
      String(this.route.snapshot.queryParamMap.get('suiteId') || '').trim()
    const requestedSuiteId = String(this.route.snapshot.queryParamMap.get('suiteId') || '').trim()

    const state = history.state as { plans?: TestPlanDto[] }
    this.plans = state?.plans || []

    if (this.plans.length > 0) {
      this.selectedPlanId = this.plans[0].id
      this.expandedPlans[this.plans[0].id] = true
      return
    }

    await this.loadSuites()
    if (requestedSuiteId) {
      const target = this.suites.find((s) => String(s._id || '').trim() === requestedSuiteId)
      if (target && !this.expandedSuites[requestedSuiteId]) {
        await this.toggleSuite(target)
      }
    }
  }

  async loadSuites() {
    this.loading = true
    this.errorMessage = ''

    try {
      const user = await firstValueFrom(this.store.select(getUser).pipe(take(1)))

      let userId = String((user as any)?.id || (user as any)?._id || '').trim()
      const token = String((user as any)?.token || this.authService.session || '').trim()

      if (!userId && token) {
        userId = this.resolveUserIdFromToken(token)
      }

      if (!userId) {
        this.errorMessage = 'Session expirée. Reconnectez-vous.'
        return
      }

      this.suites = await firstValueFrom(this.testLabService.getTestSuitesByUser(userId))
    } catch (err: unknown) {
      this.errorMessage =
        (err as any)?.error?.message ||
        (err as any)?.message ||
        'Unable to load test suites'
    } finally {
      this.loading = false
    }
  }

  async onGenerateCases(plan: TestPlanDto, regenerate = false) {
    if (!this.testSuiteId) return

    this.generating = true
    this.errorMessage = ''
    this.selectedPlanId = plan.id

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
      this.toastr.success(
        regenerate ? `Test cases regenerated for ${plan.id}` : `Test cases generated for ${plan.id}`,
        'AI'
      )
    } catch (err: unknown) {
      this.errorMessage = (err as any)?.error?.message || 'Unable to generate test cases'
    } finally {
      this.generating = false
    }
  }

  onDeleteTestCase(planId: string, testCaseId: string) {
    this.testCasesByPlan[planId] = (this.testCasesByPlan[planId] || []).filter((tc) => tc.id !== testCaseId)
  }

  openSuite(suite: TestSuiteDto) {
    const id = String(suite?._id || '').trim()
    if (!id) return

    void this.router.navigate(['/test-cases', id])
  }

  private resolveUserIdFromToken(token: string): string {
    try {
      const decoded = jwt_decode<Record<string, unknown>>(token)
      const userLike = (decoded?.['user'] as Record<string, unknown>) || decoded || {}

      return String(userLike['userId'] || userLike['id'] || userLike['_id'] || userLike['sub'] || '').trim()
    } catch {
      return ''
    }
  }

}
