import { CommonModule } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { Store } from '@ngrx/store'
import { Subscription, firstValueFrom } from 'rxjs'
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

type PlanExecutionStatus = 'pending' | 'generating' | 'completed' | 'incomplete'
type SuiteSessionStatus = 'complete' | 'incomplete'

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
  generatingPlanId = ''
  errorMessage = ''

  suites: TestSuiteDto[] = []
  expandedSuites: Record<string, boolean> = {}
  suitePlans: Record<string, TestPlanDto[]> = {}
  loadingSuitePlans: Record<string, boolean> = {}

  plans: TestPlanDto[] = []
  planStatuses: Record<string, PlanExecutionStatus> = {}
  testCasesByPlan: Record<string, TestCaseDto[]> = {}
  expandedPlans: Record<string, boolean> = {}

  testSuiteId = ''
  selectedPlanId = ''

  // Modal state
  modalOpen = false
  modalPlan: TestPlanDto | null = null
  modalGenerating = false
  modalCases: TestCaseDto[] = []
  private modalSubscription: Subscription | null = null

  // Right panel live cases
  livePlanId = ''
  liveCases: TestCaseDto[] = []

  private generationSubscription: Subscription | null = null

  // ── Getters ──────────────────────────────────────────────────────────

  get allPlans(): TestPlanDto[] {
    if (this.plans.length) return this.plans
    const all: TestPlanDto[] = []
    for (const plans of Object.values(this.suitePlans)) all.push(...plans)
    return all
  }

  getPlanStatus(planId: string): PlanExecutionStatus {
    if (this.planStatuses[planId]) return this.planStatuses[planId]
    if ((this.testCasesByPlan[planId] || []).length > 0) return 'completed'
    return 'pending'
  }

  getCompletionLabel(planId: string): 'Complete' | 'Incomplete' {
    return this.getPlanStatus(planId) === 'completed' ? 'Complete' : 'Incomplete'
  }

  getSuiteCardStatus(suite: TestSuiteDto): 'Complete' | 'Incomplete' {
    return suite?.sessionStatus === 'complete' ? 'Complete' : 'Incomplete'
  }

  get livePlan(): TestPlanDto | null {
    return this.allPlans.find(p => p.id === this.livePlanId) || null
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async ngOnInit() {
    this.testSuiteId =
      String(this.route.snapshot.paramMap.get('id') || '').trim() ||
      String(this.route.snapshot.queryParamMap.get('suiteId') || '').trim()

    const state = history.state as { plans?: TestPlanDto[] }
    this.plans = state?.plans || []
    this.initializePlanStatuses(this.plans)

    if (this.testSuiteId) {
      await this.loadPlansForSuite(this.testSuiteId)
    } else {
      await this.loadSuites()
    }
  }

  // ── Suite tree ────────────────────────────────────────────────────────

  async loadSuites() {
    this.loading = true
    this.errorMessage = ''
    try {
      const user = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
      let userId = String((user as any)?.id || (user as any)?._id || '').trim()
      const token = String((user as any)?.token || this.authService.session || '').trim()
      if (!userId && token) userId = this.resolveUserIdFromToken(token)
      if (!userId) { this.errorMessage = 'Session expired.'; return }
      this.suites = await firstValueFrom(this.testLabService.getTestSuitesByUser(userId))
    } catch (err: unknown) {
      this.errorMessage = (err as any)?.error?.message || 'Unable to load test suites'
    } finally {
      this.loading = false
    }
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
        for (const block of resp?.testCasesByPlan || []) {
          if (block?.planId) this.testCasesByPlan[block.planId] = block?.testCases || []
        }
        this.initializePlanStatuses(this.suitePlans[suiteId])
      } catch (err) {
        console.error('Error loading plans', err)
      } finally {
        this.loadingSuitePlans[suiteId] = false
      }
    }
  }

  togglePlan(planId: string) {
    this.expandedPlans[planId] = !this.expandedPlans[planId]
    this.selectedPlanId = planId
    if (this.expandedPlans[planId] && (this.testCasesByPlan[planId] || []).length) {
      this.livePlanId = planId
      this.liveCases = this.testCasesByPlan[planId]
    }
  }

  selectPlanForLive(planId: string) {
    this.livePlanId = planId
    this.liveCases = this.testCasesByPlan[planId] || []
  }

  // ── Modal ─────────────────────────────────────────────────────────────

  openModal(plan: TestPlanDto, event: Event) {
    event.stopPropagation()
    this.modalPlan = plan
    this.modalCases = [...(this.testCasesByPlan[plan.id] || [])]
    this.modalGenerating = false
    this.modalOpen = true
  }

  closeModal() {
    if (this.modalGenerating) {
      this.modalSubscription?.unsubscribe()
      this.modalSubscription = null
      this.modalGenerating = false
      if (this.modalPlan) this.planStatuses[this.modalPlan.id] = 'incomplete'
    }
    this.modalOpen = false
    this.modalPlan = null
    this.modalCases = []
  }

  onModalGenerate(regenerate = false) {
    const plan = this.modalPlan
    if (!plan || !this.testSuiteId || this.modalGenerating) return

    this.modalGenerating = true
    this.modalCases = []
    this.planStatuses[plan.id] = 'generating'
    this.livePlanId = plan.id
    this.liveCases = []

    this.modalSubscription = this.testLabService.generateTestCases({
      testSuiteId: this.testSuiteId,
      planId: plan.id,
      planTitle: plan.title,
      planDescription: plan.description,
      regenerate,
    }).subscribe({
      next: (resp) => {
        this.modalCases = resp?.testCases || []
        this.liveCases = [...this.modalCases]
        this.testCasesByPlan[plan.id] = this.modalCases
        this.planStatuses[plan.id] = this.modalCases.length ? 'completed' : 'incomplete'
        this.toastr.success(`Test cases ${regenerate ? 'regenerated' : 'generated'} for ${plan.id}`, 'AI')
      },
      error: (err: unknown) => {
        this.planStatuses[plan.id] = 'incomplete'
        this.errorMessage = (err as any)?.error?.message || 'Unable to generate test cases'
        this.modalGenerating = false
      },
      complete: () => {
        this.modalGenerating = false
        this.modalSubscription = null
      },
    })
  }

  onModalValidate() {
    const plan = this.modalPlan
    if (!plan || !this.testSuiteId) return

    const testCasesByPlan = [{
      planId: plan.id,
      planTitle: plan.title,
      testCases: this.modalCases,
    }]

    const normalizedStatuses = { ...this.planStatuses }
    normalizedStatuses[plan.id] = 'completed'

    const suiteStatus: SuiteSessionStatus = this.allPlans.every(
      p => (normalizedStatuses[p.id] || this.getPlanStatus(p.id)) === 'completed'
    ) ? 'complete' : 'incomplete'

    this.testLabService.saveSuiteSession(this.testSuiteId, {
      suiteStatus,
      planStatuses: normalizedStatuses,
      testCasesByPlan,
    }).subscribe({
      next: () => {
        this.testCasesByPlan[plan.id] = [...this.modalCases]
        this.planStatuses[plan.id] = 'completed'
        this.toastr.success(`Plan ${plan.id} saved successfully.`, 'Saved')
        this.closeModal()
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to save', 'Save'),
    })
  }

  onModalDeleteCase(caseId: string) {
    this.modalCases = this.modalCases.filter(tc => tc.id !== caseId)
    this.liveCases = [...this.modalCases]
  }

  // ── Save All ──────────────────────────────────────────────────────────

  onSaveAll() {
    if (!this.testSuiteId) return

    const normalizedStatuses: Record<string, PlanExecutionStatus> = {}
    for (const plan of this.allPlans) {
      const s = this.getPlanStatus(plan.id)
      normalizedStatuses[plan.id] = s === 'generating' ? 'incomplete' : s
    }

    const suiteStatus: SuiteSessionStatus = this.allPlans.every(
      p => normalizedStatuses[p.id] === 'completed'
    ) ? 'complete' : 'incomplete'

    const testCasesByPlan = this.allPlans.map(p => ({
      planId: p.id,
      planTitle: p.title,
      testCases: this.testCasesByPlan[p.id] || [],
    }))

    this.testLabService.saveSuiteSession(this.testSuiteId, {
      suiteStatus,
      planStatuses: normalizedStatuses,
      testCasesByPlan,
    }).subscribe({
      next: () => this.toastr.success('All test cases saved.', 'Save'),
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to save', 'Save'),
    })
  }

  onRegenerateAll() {
    for (const plan of this.allPlans) {
      this.openModal(plan, new MouseEvent('click'))
      this.onModalGenerate(true)
      break
    }
  }

  // ── Private ───────────────────────────────────────────────────────────

  private initializePlanStatuses(plans: TestPlanDto[]) {
    for (const plan of plans || []) {
      if (!this.planStatuses[plan.id]) {
        this.planStatuses[plan.id] = 'pending'
      }
    }
  }

  private async loadPlansForSuite(testSuiteId: string) {
    this.loading = true
    this.errorMessage = ''
    try {
      const resp = await firstValueFrom(this.testLabService.getTestPlans(testSuiteId))
      this.plans = resp?.testPlans || []
      this.testCasesByPlan = {}
      for (const block of resp?.testCasesByPlan || []) {
        if (block?.planId) this.testCasesByPlan[block.planId] = block?.testCases || []
      }
      this.initializePlanStatuses(this.plans)

      for (const row of Array.isArray(resp?.planStatuses) ? resp.planStatuses : []) {
        if (row?.planId) this.planStatuses[row.planId] = String(row.status || 'pending') as PlanExecutionStatus
      }
      for (const p of this.plans) {
        if ((this.testCasesByPlan[p.id] || []).length > 0 && !this.planStatuses[p.id]) {
          this.planStatuses[p.id] = 'completed'
        }
      }

      if (this.plans[0]) {
        this.selectedPlanId = this.plans[0].id
        this.livePlanId = this.plans[0].id
        this.liveCases = this.testCasesByPlan[this.plans[0].id] || []
      }
    } catch (err: unknown) {
      this.errorMessage = (err as any)?.error?.message || 'Unable to load test plans'
    } finally {
      this.loading = false
    }
  }

  private resolveUserIdFromToken(token: string): string {
    try {
      const decoded = jwt_decode<Record<string, unknown>>(token)
      const userLike = (decoded?.['user'] as Record<string, unknown>) || decoded || {}
      return String(userLike['userId'] || userLike['id'] || userLike['_id'] || userLike['sub'] || '').trim()
    } catch { return '' }
  }
}