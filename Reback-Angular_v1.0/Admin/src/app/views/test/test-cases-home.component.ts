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

  plans: TestPlanDto[] = []
  planStatuses: Record<string, PlanExecutionStatus> = {}
  testCasesByPlan: Record<string, TestCaseDto[]> = {}
  expandedPlans: Record<string, boolean> = {}

  expandedSuites: Record<string, boolean> = {}
  suitePlans: Record<string, TestPlanDto[]> = {}
  loadingSuitePlans: Record<string, boolean> = {}

  testSuiteId = ''
  selectedPlanId = ''

  private generationSubscription: Subscription | null = null

  get generatedCount(): number {
    return this.plans.filter((p) => this.getPlanStatus(p.id) === 'completed').length
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
    const pending = this.plans.find((p) => this.getPlanStatus(p.id) !== 'completed')
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
        this.initializePlanStatuses(this.suitePlans[suiteId])
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
    this.initializePlanStatuses(this.plans)

    if (this.testSuiteId) {
      await this.loadPlansForSuite(this.testSuiteId)
    } else {
      await this.loadSuites()
    }
    if (requestedSuiteId) {
      const target = this.suites.find((s) => String(s._id || '').trim() === requestedSuiteId)
      if (target) {
        await this.onOpenSuiteCard(target)
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
        this.errorMessage = 'Session expired. Please sign in again.'
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

  onGenerateCases(plan: TestPlanDto, regenerate = false) {
    if (!this.testSuiteId || this.generating) return

    this.generating = true
    this.generatingPlanId = plan.id
    this.errorMessage = ''
    this.selectedPlanId = plan.id
    this.expandedPlans[plan.id] = true
    this.planStatuses[plan.id] = 'generating'
    if (regenerate) {
      this.testCasesByPlan[plan.id] = []
    }

    this.generationSubscription = this.testLabService
      .generateTestCases({
        testSuiteId: this.testSuiteId,
        planId: plan.id,
        planTitle: plan.title,
        planDescription: plan.description,
        regenerate,
      })
      .subscribe({
        next: (resp) => {
          this.testCasesByPlan[plan.id] = resp?.testCases || []
          this.planStatuses[plan.id] = (resp?.testCases || []).length ? 'completed' : 'incomplete'
          this.toastr.success(
            regenerate ? `Test cases regenerated for ${plan.id}` : `Test cases generated for ${plan.id}`,
            'AI'
          )
        },
        error: (err: unknown) => {
          this.planStatuses[plan.id] = 'incomplete'
          this.errorMessage = (err as any)?.error?.message || 'Unable to generate test cases'
        },
        complete: () => {
          this.generating = false
          this.generatingPlanId = ''
          this.generationSubscription = null
        },
      })
  }

  onStopGeneration() {
    if (!this.generating || !this.generationSubscription) return
    const planId = this.generatingPlanId

    this.generationSubscription.unsubscribe()
    this.generationSubscription = null
    this.generating = false
    this.generatingPlanId = ''

    if (planId) {
      this.planStatuses[planId] = 'incomplete'
      this.toastr.warning(`Generation stopped for ${planId}. Status is now incomplete.`, 'Stopped')
    }
  }

  onStopAllGeneration() {
    this.onStopGeneration()
  }

  onSaveSession() {
    if (!this.testSuiteId || !this.plans.length) return

    const normalizedPlanStatuses: Record<string, PlanExecutionStatus> = { ...this.planStatuses }
    for (const plan of this.plans) {
      const status = this.getPlanStatus(plan.id)
      normalizedPlanStatuses[plan.id] = status === 'generating' ? 'incomplete' : status
    }

    const suiteStatus: SuiteSessionStatus = this.plans.every((p) => normalizedPlanStatuses[p.id] === 'completed')
      ? 'complete'
      : 'incomplete'

    const testCasesByPlan = this.plans.map((p) => ({
      planId: p.id,
      planTitle: p.title,
      testCases: this.testCasesByPlan[p.id] || [],
    }))

    this.testLabService.saveSuiteSession(this.testSuiteId, {
      suiteStatus,
      planStatuses: normalizedPlanStatuses,
      testCasesByPlan,
    }).subscribe({
      next: () => this.toastr.success('Session saved successfully.', 'Save'),
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to save session', 'Save'),
    })
  }

  onDeleteTestCase(planId: string, testCaseId: string) {
    this.testCasesByPlan[planId] = (this.testCasesByPlan[planId] || []).filter((tc) => tc.id !== testCaseId)
    if (!this.testCasesByPlan[planId]?.length && this.planStatuses[planId] === 'completed') {
      this.planStatuses[planId] = 'incomplete'
    }
  }

  openSuite(suite: TestSuiteDto) {
    const id = String(suite?._id || '').trim()
    if (!id) return

    void this.router.navigate(['/test-cases', id])
  }

  async onOpenSuiteCard(suite: TestSuiteDto) {
    const suiteId = String(suite?._id || '').trim()
    if (!suiteId) return

    this.testSuiteId = suiteId
    await this.router.navigate(['/test-cases'], { queryParams: { suiteId } })
    await this.loadPlansForSuite(suiteId)
  }

  getSuiteCardStatus(suite: TestSuiteDto): 'Complete' | 'Incomplete' {
    return suite?.sessionStatus === 'complete' ? 'Complete' : 'Incomplete'
  }

  getPlanStatus(planId: string): PlanExecutionStatus {
    if (this.planStatuses[planId]) return this.planStatuses[planId]
    if ((this.testCasesByPlan[planId] || []).length > 0) return 'completed'
    return 'pending'
  }

  getCompletionLabel(planId: string): 'Complete' | 'Incomplete' {
    return this.getPlanStatus(planId) === 'completed' ? 'Complete' : 'Incomplete'
  }

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
      const persistedStatuses = Array.isArray(resp?.planStatuses) ? resp.planStatuses : []
      for (const row of persistedStatuses) {
        if (!row?.planId) continue
        this.planStatuses[row.planId] = String(row.status || 'pending') as PlanExecutionStatus
      }
      for (const p of this.plans) {
        if ((this.testCasesByPlan[p.id] || []).length > 0 && !this.planStatuses[p.id]) {
          this.planStatuses[p.id] = 'completed'
        }
      }

      const requestedPlanId = String(this.route.snapshot.queryParamMap.get('planId') || '').trim()
      const defaultPlanId =
        requestedPlanId && this.plans.some((p) => p.id === requestedPlanId)
          ? requestedPlanId
          : (this.plans[0]?.id || '')
      if (defaultPlanId) {
        this.selectedPlanId = defaultPlanId
        this.expandedPlans[defaultPlanId] = true
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
    } catch {
      return ''
    }
  }
}

