import { CommonModule } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { Store } from '@ngrx/store'
import { Subscription, firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'
import { ToastrService } from 'ngx-toastr'
import { HostListener } from '@angular/core'

import { AuthenticationService } from '@/app/core/services/auth.service'
import { jwt_decode } from '@/app/core/utils/jwt-decode'
import { getUser } from '@/app/store/authentication/authentication.selector'

import {
  TestLabService,
  type TestCaseDto,
  type TestPlanDto,
  type TestSuiteDto,
} from '@/app/core/services/testlab.service'

type PlanValidationStatus = 'pending' | 'generating' | 'reviewing' | 'confirmed'
type SuiteSessionStatus = 'validated' | 'invalid'

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
  currentSuiteName = ''

  suites: TestSuiteDto[] = []
  expandedSuites: Record<string, boolean> = {}
  suitePlans: Record<string, TestPlanDto[]> = {}
  loadingSuitePlans: Record<string, boolean> = {}

  plans: TestPlanDto[] = []
  planStatuses: Record<string, PlanValidationStatus> = {}
  testCasesByPlan: Record<string, TestCaseDto[]> = {}
  expandedPlans: Record<string, boolean> = {}

  testSuiteId = ''
  selectedPlanId = ''

  modalOpen = false
  modalPlan: TestPlanDto | null = null
  modalGenerating = false
  modalCases: TestCaseDto[] = []
  private modalSubscription: Subscription | null = null

  // Unsaved changes protection
  hasUnsavedChanges = false
  unsavedModalOpen = false
  private unsavedResolve: ((ok: boolean) => void) | null = null
  private pendingAction: (() => void) | null = null
  unsavedSaving = false

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

  getPlanStatus(planId: string): PlanValidationStatus {
    const current = this.planStatuses[planId]
    if (current === 'generating') return 'generating'
    if (current === 'confirmed') return 'confirmed'
    return (this.testCasesByPlan[planId] || []).length > 0 ? 'reviewing' : 'pending'
  }

  getCompletionLabel(planId: string): 'Validated' | 'Not validated' {
    return this.getPlanStatus(planId) === 'confirmed' ? 'Validated' : 'Not validated'
  }

  getSuiteCardStatus(suite: TestSuiteDto): 'Validated' | 'Not validated' {
    return this.isSuiteValidated(suite) ? 'Validated' : 'Not validated'
  }

  get livePlan(): TestPlanDto | null {
    return this.allPlans.find(p => p.id === this.livePlanId) || null
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async ngOnInit() {
    this.testSuiteId =
      String(this.route.snapshot.paramMap.get('id') || '').trim() ||
      String(this.route.snapshot.queryParamMap.get('suiteId') || '').trim()
    this.currentSuiteName = String(this.route.snapshot.queryParamMap.get('suiteName') || '').trim()

    const state = history.state as { plans?: TestPlanDto[] }
    this.plans = state?.plans || []
    this.initializePlanStatuses(this.plans)

    if (this.testSuiteId) {
      await this.loadPlansForSuite(this.testSuiteId)
    } else {
      await this.loadSuites()
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────

  onBackToSuites() {
    if (this.hasUnsavedChanges) {
      this.pendingAction = () => this.onBackToSuites()
      void this.openUnsavedModal()
      return
    }
    this.testSuiteId = ''
    this.plans = []
    this.planStatuses = {}
    this.testCasesByPlan = {}
    this.expandedPlans = {}
    this.livePlanId = ''
    this.liveCases = []
    this.selectedPlanId = ''
    this.currentSuiteName = ''
    void this.router.navigate(['/test-cases'])
    void this.loadSuites()
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

  onRegeneratePlan(plan: TestPlanDto, event: Event, suiteId?: string) {
    event.stopPropagation()
    if (suiteId) this.testSuiteId = suiteId
    this.openModal(plan, event)
    this.onModalGenerate(true)
  }

  closeModal() {
    // Closing the generation modal while having unsaved generated changes should warn
    if (this.hasUnsavedChanges && this.modalOpen && !this.modalGenerating) {
      this.pendingAction = () => this.closeModalForce()
      void this.openUnsavedModal()
      return
    }
    this.closeModalForce()
  }

  private closeModalForce() {
    if (this.modalGenerating) {
      this.modalSubscription?.unsubscribe()
      this.modalSubscription = null
      this.modalGenerating = false
      if (this.modalPlan) {
        this.planStatuses[this.modalPlan.id] =
          (this.testCasesByPlan[this.modalPlan.id] || []).length > 0 ? 'reviewing' : 'pending'
      }
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
        this.planStatuses[plan.id] = this.modalCases.length ? 'reviewing' : 'pending'
        this.refreshUnsavedFlag()
        this.toastr.success(`Test cases ${regenerate ? 'regenerated' : 'generated'} for ${plan.id}`, 'Generation')
      },
      error: (err: unknown) => {
        this.planStatuses[plan.id] = 'pending'
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
    if (!this.modalCases.length) {
      this.toastr.warning('Generate test cases first before validation.', 'Validation')
      return
    }

    const testCasesByPlan = [{
      planId: plan.id,
      planTitle: plan.title,
      testCases: this.modalCases,
    }]

    const normalizedStatuses: Record<string, PlanValidationStatus> = { ...this.planStatuses }
    normalizedStatuses[plan.id] = 'confirmed'

    const suiteStatus: SuiteSessionStatus = this.allPlans.length > 0 && this.allPlans.every(
      p => (normalizedStatuses[p.id] || this.getPlanStatus(p.id)) === 'confirmed'
    ) ? 'validated' : 'invalid'

    this.testLabService.saveSuiteSession(this.testSuiteId, {
      sessionKind: 'validation',
      suiteStatus,
      planStatuses: normalizedStatuses,
      testCasesByPlan,
    }).subscribe({
      next: () => {
        this.testCasesByPlan[plan.id] = [...this.modalCases]
        this.planStatuses[plan.id] = 'confirmed'
        this.refreshUnsavedFlag()
        this.toastr.success(`Plan ${plan.id} saved successfully.`, 'Saved')
        this.closeModal()
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to save', 'Save'),
    })
  }

  onModalDeleteCase(caseId: string) {
    this.modalCases = this.modalCases.filter(tc => tc.id !== caseId)
    this.liveCases = [...this.modalCases]
    this.refreshUnsavedFlag()
  }

  // ── Save All ──────────────────────────────────────────────────────────

  onSaveAll() {
    if (!this.testSuiteId) return

    const normalizedStatuses: Record<string, PlanValidationStatus> = {}
    for (const plan of this.allPlans) {
      normalizedStatuses[plan.id] = this.getPlanStatus(plan.id)
    }

    const suiteStatus: SuiteSessionStatus = this.allPlans.length > 0 && this.allPlans.every(
      p => normalizedStatuses[p.id] === 'confirmed'
    ) ? 'validated' : 'invalid'

    const testCasesByPlan = this.allPlans.map(p => ({
      planId: p.id,
      planTitle: p.title,
      testCases: this.testCasesByPlan[p.id] || [],
    }))

    this.testLabService.saveSuiteSession(this.testSuiteId, {
      sessionKind: 'validation',
      suiteStatus,
      planStatuses: normalizedStatuses,
      testCasesByPlan,
    }).subscribe({
      next: () => {
        this.hasUnsavedChanges = false
        this.toastr.success('All test cases saved.', 'Save')
      },
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

  getPlanValidationLabel(planId: string): 'Validated' | 'Not validated' | 'Generating...' {
    const status = this.getPlanStatus(planId)
    if (status === 'generating') return 'Generating...'
    return status === 'confirmed' ? 'Validated' : 'Not validated'
  }

  private isSuiteValidated(suite: TestSuiteDto): boolean {
    return (
      String(suite?.status || '').toLowerCase().trim() === 'validated' ||
      String(suite?.validationStatus || '').toLowerCase().trim() === 'validated'
    )
  }

  // ── Unsaved changes modal ─────────────────────────────────────────────

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (!this.hasUnsavedChanges) return
    event.preventDefault()
    // Most browsers ignore custom text; setting returnValue triggers the prompt.
    event.returnValue = 'You have unsaved changes.'
  }

  canDeactivate(): boolean | Promise<boolean> {
    if (!this.hasUnsavedChanges) return true
    return this.openUnsavedModal()
  }

  private refreshUnsavedFlag() {
    // "reviewing" = generated/modified but not saved
    const anyReviewing = this.allPlans.some((p) => this.getPlanStatus(p.id) === 'reviewing')
    const modalDirty = this.modalOpen && !this.modalGenerating && this.modalCases.length > 0 && this.modalPlan
      ? this.getPlanStatus(this.modalPlan.id) === 'reviewing'
      : false
    this.hasUnsavedChanges = Boolean(anyReviewing || modalDirty)
  }

  private openUnsavedModal(): Promise<boolean> {
    this.unsavedModalOpen = true
    return new Promise<boolean>((resolve) => {
      this.unsavedResolve = resolve
    })
  }

  onUnsavedCancel() {
    this.unsavedModalOpen = false
    this.pendingAction = null
    this.unsavedResolve?.(false)
    this.unsavedResolve = null
  }

  onUnsavedLeaveWithoutSaving() {
    this.unsavedModalOpen = false
    const action = this.pendingAction
    this.pendingAction = null
    this.hasUnsavedChanges = false
    this.unsavedResolve?.(true)
    this.unsavedResolve = null
    action?.()
  }

  onUnsavedSaveAndContinue() {
    if (!this.testSuiteId || this.unsavedSaving) return
    this.unsavedSaving = true

    const normalizedStatuses: Record<string, PlanValidationStatus> = {}
    for (const plan of this.allPlans) {
      normalizedStatuses[plan.id] = this.getPlanStatus(plan.id)
    }

    const suiteStatus: SuiteSessionStatus = this.allPlans.length > 0 && this.allPlans.every(
      p => normalizedStatuses[p.id] === 'confirmed'
    ) ? 'validated' : 'invalid'

    const testCasesByPlan = this.allPlans.map(p => ({
      planId: p.id,
      planTitle: p.title,
      testCases: this.testCasesByPlan[p.id] || [],
    }))

    this.testLabService.saveSuiteSession(this.testSuiteId, {
      sessionKind: 'validation',
      suiteStatus,
      planStatuses: normalizedStatuses,
      testCasesByPlan,
    }).subscribe({
      next: () => {
        this.unsavedSaving = false
        this.unsavedModalOpen = false
        this.hasUnsavedChanges = false
        const action = this.pendingAction
        this.pendingAction = null
        this.unsavedResolve?.(true)
        this.unsavedResolve = null
        action?.()
      },
      error: (err) => {
        this.unsavedSaving = false
        this.toastr.error(err?.error?.message || 'Unable to save', 'Save')
      },
    })
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

      const matched = this.suites.find(s => s._id === testSuiteId)
      this.currentSuiteName =
        this.currentSuiteName ||
        matched?.nametest ||
        matched?.nom ||
        'Suite sans nom'

      this.testCasesByPlan = {}
      for (const block of resp?.testCasesByPlan || []) {
        if (block?.planId) this.testCasesByPlan[block.planId] = block?.testCases || []
      }
      this.initializePlanStatuses(this.plans)

      const rows = Array.isArray(resp?.validationPlanStatuses)
        ? resp.validationPlanStatuses
        : (Array.isArray(resp?.planStatuses) ? resp.planStatuses : [])
      for (const row of rows) {
        const planId = String((row as any)?.planId || '').trim()
        const status = String((row as any)?.status || '').toLowerCase().trim()
        if (!planId) continue
        if (status === 'pending' || status === 'generating' || status === 'reviewing' || status === 'confirmed') {
          this.planStatuses[planId] = status as PlanValidationStatus
        }
      }
      for (const p of this.plans) {
        if ((this.testCasesByPlan[p.id] || []).length > 0 && !this.planStatuses[p.id]) {
          this.planStatuses[p.id] = 'reviewing'
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
