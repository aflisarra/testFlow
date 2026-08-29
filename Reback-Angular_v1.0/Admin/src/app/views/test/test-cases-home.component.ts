import { CommonModule } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA, HostListener, inject, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { Store } from '@ngrx/store'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom, Subscription } from 'rxjs'
import { take } from 'rxjs/operators'

import { ApiService } from '@/app/core/services/api.service'
import { AuthenticationService } from '@/app/core/services/auth.service'
import { ProjectsStateService } from '@/app/core/services/projects-state.service'
import { jwt_decode } from '@/app/core/utils/jwt-decode'
import type { AppProject } from '@/app/interfaces/admin-management.interface'
import { getUser } from '@/app/store/authentication/authentication.selector'
import type { PlanValidationStatus, SuiteSessionStatus } from '@/app/views/test/models/status.types'
import { getErrorMessage } from '@/app/views/test/utils/error.utils'

import {
  TestLabService,
  type TestCaseDto,
  type TestCasesByPlanDto,
  type TestPlanDto,
  type TestSuiteDto,
} from '@/app/core/services/testlab.service'

// ── Type unique pour les previews d'utilisateur ───────────────────────
interface UserPreview {
  id: string
  name?: string
  picture?: string
}

@Component({
  selector: 'app-test-cases-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './test-cases-home.component.html',
  styleUrls: ['./test-cases-home.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TestCasesHomeComponent implements OnInit {
  private store = inject(Store)
  private authService = inject(AuthenticationService)
  private testLabService = inject(TestLabService)
  private projectsState = inject(ProjectsStateService)
  private apiService = inject(ApiService)
  private router = inject(Router)
  private route = inject(ActivatedRoute)
  private toastr = inject(ToastrService)

  loading = false
  generating = false
  generatingPlanId = ''
  errorMessage = ''
  currentSuiteName = ''

  readonly AVATAR_MAX = 4

  suites: TestSuiteDto[] = []
  expandedSuites: Record<string, boolean> = {}
  suitePlans: Record<string, TestPlanDto[]> = {}
  loadingSuitePlans: Record<string, boolean> = {}

  projects: AppProject[] = []
  private acceptedProjectIds = new Set<string>()
  selectedProjectId = ''
  projectFilterId = ''
  loadingProjects = false

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
  /** Full plan cases used for saving; modalCases can be a subset when editing a single test case */
  modalAllCases: TestCaseDto[] = []
  pendingNewCase: TestCaseDto | null = null
  editingSingleCase = false
  editingCaseIds: Record<string, boolean> = {}
  private modalSubscription: Subscription | null = null

  // Unsaved changes protection
  hasUnsavedChanges = false
  private dirtyPlans: Record<string, boolean> = {}
  private dirtySuite = false
  unsavedModalOpen = false
  private unsavedResolve: ((ok: boolean) => void) | null = null
  private pendingAction: (() => void) | null = null
  unsavedSaving = false
  generationGuardModalOpen = false
  generationStopping = false
  private generationGuardResolve: ((ok: boolean) => void) | null = null
  private allowGenerationNavigation = false
  private pendingBrowserReload = false
  private activeCaseGenerationRequestId = ''


abandonModalOpen = false
selectedAbandonPlanId = ''
selectedAbandonCaseId = ''
confirmAbandonModalOpen = false
  livePlanId = ''
  liveCases: TestCaseDto[] = []
  focusedLiveCaseId = ''

  private generationSubscription: Subscription | null = null

  // ── Auteurs par plan ─────────────────────────────────────────────────
  // picture est toujours string | undefined ici (jamais null)
  planAuthors: Record<string, { name?: string; picture?: string }> = {}
  currentUserPreview: UserPreview | null = null

  // ── Getters ──────────────────────────────────────────────────────────

  get selectedProjectTitle(): string {
    const id = String(this.projectFilterId || '').trim()
    if (!id) return ''
    return String(this.projects.find(p => p._id === id)?.title || '').trim()
  }

  get filteredSuites(): TestSuiteDto[] {
    const projectId = String(this.projectFilterId || '').trim()
    return this.suites.filter((suite) =>
      this.isSuiteFromAcceptedProject(suite) &&
      (!projectId || this.getSuiteProjectId(suite) === projectId)
    )
  }

  get canEditGenerateForSelectedProject(): boolean {
    return Boolean(this.selectedProjectId || this.testSuiteId)
  }

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

  getCompletionLabel(planId: string): 'Completed' | 'Incomplete' {
    return this.getPlanStatus(planId) === 'confirmed' ? 'Completed' : 'Incomplete'
  }

  getSuiteCardStatus(suite: TestSuiteDto): 'Completed' | 'Incomplete' {
    return this.isSuiteValidated(suite) ? 'Completed' : 'Incomplete'
  }

  getLastActorBubble(suite: TestSuiteDto): string {
    const name = String(suite?.lastActionBy?.name || '').trim()
    if (!name) return ''
    return name.slice(0, 1).toUpperCase()
  }

  get livePlan(): TestPlanDto | null {
    return this.allPlans.find(p => p.id === this.livePlanId) || null
  }

  get visibleLiveCases(): TestCaseDto[] {
    const cases = this.liveCases || []
    const focusedId = String(this.focusedLiveCaseId || '').trim()
    if (!focusedId) return cases
    return cases.filter((tc) => String(tc?.id || '').trim() === focusedId)
  }

  /**
   * Auteur du plan actif dans le panneau droit.
   * Renvoie null si ni name ni picture → pas de bulle vide.
   */
  get livePlanAuthor(): { name?: string; picture?: string } | null {
    if (!this.livePlanId) return null
    const a = this.planAuthors[this.livePlanId]
    if (!a || (!a.name && !a.picture)) return null
    return a
  }

  /**
   * Stack d'avatars pour le header — tous les auteurs distincts des plans.
   */
  get teamPreview(): { visible: UserPreview[]; overflow: number } {
    const map = new Map<string, UserPreview>()

    for (const plan of this.allPlans) {
      const author = this.planAuthors[plan.id]
      if (!author) continue
      const key = author.name || author.picture
      if (!key || map.has(key)) continue
      map.set(key, { id: key, name: author.name, picture: author.picture })
    }

    const users = Array.from(map.values())
    return {
      visible: users.slice(0, this.AVATAR_MAX),
      overflow: Math.max(0, users.length - this.AVATAR_MAX),
    }
  }

  // ── Helpers utilisateurs ──────────────────────────────────────────────

  /**
   * Détermine l'auteur à afficher pour un test case.
   * Priorité:
   * 1) testCase.createdBy
   * 2) planAuthors[planId]
   * Retourne null si aucune donnée exploitable (ni name ni picture).
   */
  getTestCaseAuthor(testCase: TestCaseDto, planId: string): UserPreview | null {
    const fromCase = this.buildUserPreview((testCase as { createdBy?: unknown })?.createdBy)
    if (fromCase) return fromCase

    const normalizedPlanId = String(planId || '').trim()
    if (!normalizedPlanId) return null

    const author = this.planAuthors[normalizedPlanId]
    if (!author || (!author.name && !author.picture)) return null
    return {
      id: `${normalizedPlanId}:${author.name || author.picture || 'unknown'}`,
      name: author.name,
      picture: author.picture,
    }
  }

  /**
   * Wrapper template: 0 ou 1 élément pour @for.
   */
  getTestCaseAuthorUsers(testCase: TestCaseDto, planId: string): UserPreview[] {
    const author = this.getTestCaseAuthor(testCase, planId)
    return author ? [author] : []
  }

  /**
   * Utilisateurs pour la barre "N test cases générés".
   * Priorité 1 : createdBy du premier test case.
   * Priorité 2 : planAuthors[livePlanId].
   */
  getLiveCasesUsers(): UserPreview[] {
    const first = this.liveCases?.[0]
    if (first?.createdBy) {
      const preview = this.buildUserPreview(first.createdBy as unknown)
      if (preview) return [preview]
    }

    const author = this.livePlanId ? this.planAuthors[this.livePlanId] : null
    if (author?.name || author?.picture) {
      return [{
        id: author!.name || author!.picture || 'unknown',
        name: author!.name,
        picture: author!.picture,
      }]
    }

    return []
  }

  /** Initiales à partir d'un nom (1 ou 2 lettres) */
  getInitials(name?: string): string {
    if (!name) return '?'
    return name
      .trim()
      .split(/\s+/)
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  /**
   * Gestion erreur image avatar :
   * - Tente le fallback SVG ; si absent, masque l'img (les initiales restent visibles).
   */
  onAvatarImgError(event: Event): void {
    const img = event.target as HTMLImageElement
    if (!img) return
    img.src = '/assets/images/users/default-user.svg'
  }

  resolveAvatarUrl(picture?: string): string {
    const raw = String(picture || '').trim()
    if (!raw) return ''
    return this.apiService.toAbsoluteUrl(raw)
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async ngOnInit() {
    this.testSuiteId =
      String(this.route.snapshot.paramMap.get('id') || '').trim() ||
      String(this.route.snapshot.queryParamMap.get('suiteId') || '').trim()
    this.currentSuiteName = String(this.route.snapshot.queryParamMap.get('suiteName') || '').trim()
    this.hydrateCurrentUserPreview()

    await this.loadProjects()

    const state = history.state as { plans?: TestPlanDto[] }
    this.plans = state?.plans || []
    this.initializePlanStatuses(this.plans)

    await this.loadSuites()
    if (this.testSuiteId) {
      await this.loadPlansForSuite(this.testSuiteId)
      this.expandedSuites[this.testSuiteId] = true
    }
  }

  async loadProjects() {
    this.loadingProjects = true
    try {
      // Load all projects then filter to projects accessible by current user (owner or assigned user).
      await this.projectsState.refresh(false)
      const all = await firstValueFrom(this.projectsState.projects$.pipe(take(1)))

      this.projects = Array.isArray(all) ? all : []
      this.acceptedProjectIds = new Set(this.projects.map((p) => String(p?._id || '').trim()).filter(Boolean))

      // Pré-sélection: si on a déjà un projet dans la suite courante
      const fromSuite = (this.suites || []).find(s => String(s?._id || '').trim() === String(this.testSuiteId || '').trim())
      const suiteProject = fromSuite?.projectId
      const projectId = String(typeof suiteProject === 'object' ? suiteProject?._id : suiteProject ?? '').trim()
      if (projectId && !this.projectFilterId) this.projectFilterId = projectId
    } catch {
      // Best-effort: keep projects empty if API fails
      this.projects = []
      this.acceptedProjectIds = new Set<string>()
    } finally {
      this.loadingProjects = false
    }
  }

  onProjectFilterChange(): void {
    this.projectFilterId = String(this.projectFilterId || '').trim()
    if (!this.projectFilterId) {
      this.selectedProjectId = ''
      this.selectedPlanId = ''
      this.livePlanId = ''
      this.liveCases = []
      this.focusedLiveCaseId = ''
      return
    }
    this.selectedProjectId = this.projectFilterId
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
      let userId = String(user?.id ?? user?._id ?? '').trim()
      const token = String(user?.token || this.authService.session || '').trim()
      if (!userId && token) userId = this.resolveUserIdFromToken(token)
      if (!userId) { this.errorMessage = 'Session expired.'; return }
      const suites = await firstValueFrom(this.testLabService.getTestSuitesByUser(userId))
      this.suites = (Array.isArray(suites) ? suites : [])
        .filter((suite) => this.isSuiteFromAcceptedProject(suite))
    } catch (err: unknown) {
      this.errorMessage = getErrorMessage(err, 'Unable to load test suites')
    } finally {
      this.loading = false
    }
  }

  async toggleSuite(suite: TestSuiteDto) {
    const suiteId = suite._id
    if (!suiteId) return

    const nextSuiteId = String(suiteId).trim()
    const currentSuiteId = String(this.testSuiteId || '').trim()

    // If user has unsaved changes, confirm before switching suites.
    if (this.hasUnsavedChanges && currentSuiteId && currentSuiteId !== nextSuiteId) {
      this.pendingAction = () => { void this.toggleSuite(suite) }
      void this.openUnsavedModal()
      return
    }

    // Keep a selected suite context so "Validate & Save" knows which suite to persist to.
    this.testSuiteId = nextSuiteId
    this.focusedLiveCaseId = ''

    // Always refresh the header/breadcrumb suite name on selection
    const suiteName = this.getSuiteDisplayName(suite)
    if (suiteName) this.currentSuiteName = suiteName

    // Keep project selector in sync with the suite's projectId (string or populated object)
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
        this.extractAuthorsFromBlocks(resp?.testCasesByPlan || [])
        this.applyCaseAuthorFallback(this.suitePlans[suiteId])
      } catch (err) {
        console.error('Error loading plans', err)
      } finally {
        this.loadingSuitePlans[suiteId] = false
      }
    }
  }

  togglePlan(planId: string) {
    if (!this.testSuiteId) {
      const inferred = this.resolveSuiteIdForPlan(planId)
      if (inferred) this.testSuiteId = inferred
    }
    this.expandedPlans[planId] = !this.expandedPlans[planId]
    this.selectedPlanId = planId
    if (this.expandedPlans[planId] && (this.testCasesByPlan[planId] || []).length) {
      this.livePlanId = planId
      this.liveCases = this.testCasesByPlan[planId]
    }
  }

  selectPlanForLive(planId: string) {
    if (!this.testSuiteId) {
      const inferred = this.resolveSuiteIdForPlan(planId)
      if (inferred) this.testSuiteId = inferred
    }
    this.livePlanId = planId
    this.liveCases = this.testCasesByPlan[planId] || []
    this.focusedLiveCaseId = ''
  }

  focusLiveCase(caseId: string, event?: Event): void {
    event?.stopPropagation()
    this.focusedLiveCaseId = String(caseId || '').trim()
  }

  formatTestData(value: unknown): string {
    if (value === null || value === undefined) return '—'
    if (typeof value === 'string') {
      const trimmed = value.trim()
      return trimmed || '—'
    }

    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  clearFocusedLiveCase(): void {
    this.focusedLiveCaseId = ''
  }

  openEditCase(caseId: string, event: Event) {
    event.stopPropagation()
    const plan = this.livePlan
    if (!plan) return
    if (!this.testSuiteId) {
      const inferred = this.resolveSuiteIdForPlan(plan.id)
      if (inferred) this.testSuiteId = inferred
    }
    this.modalPlan = plan
    this.modalAllCases = [...(this.testCasesByPlan[plan.id] || [])]

    const normalizedId = String(caseId || '').trim()
    const picked =
      normalizedId
        ? this.modalAllCases.find((tc) => String(tc?.id || '').trim() === normalizedId) || null
        : null

    this.editingSingleCase = Boolean(picked)
    this.modalCases = picked ? [picked] : [...this.modalAllCases]
    this.modalGenerating = false
    this.modalOpen = true
    this.editingCaseIds = {}
    if (normalizedId) this.editingCaseIds[normalizedId] = true
  }

  // ── Modal ─────────────────────────────────────────────────────────────

  openModal(plan: TestPlanDto, event: Event) {
    if (!this.canEditGenerateForSelectedProject) {
      this.toastr.warning('You must accept this project before editing or generating test cases.', 'Project Access')
      return
    }
    event.stopPropagation()
    if (!this.testSuiteId) {
      const inferred = this.resolveSuiteIdForPlan(plan.id)
      if (inferred) this.testSuiteId = inferred
    }
    this.modalPlan = plan
    this.editingSingleCase = false
    this.modalAllCases = [...(this.testCasesByPlan[plan.id] || [])]
    this.modalCases = [...this.modalAllCases]
    this.modalGenerating = false
    this.modalOpen = true
  }

  private resolveSuiteIdForPlan(planId: string): string {
    const wanted = String(planId || '').trim()
    if (!wanted) return ''

    // If the current suite context already exists, keep it.
    const current = String(this.testSuiteId || '').trim()
    if (current) return current

    // Infer from the suite tree cache (suitePlans).
    for (const [suiteId, plans] of Object.entries(this.suitePlans)) {
      if ((plans || []).some((p) => String(p?.id || '').trim() === wanted)) {
        return String(suiteId).trim()
      }
    }
    return ''
  }

  onRegeneratePlan(plan: TestPlanDto, event: Event, suiteId?: string) {
    if (!this.canEditGenerateForSelectedProject) {
      this.toastr.warning('You must accept this project before regenerating test cases.', 'Project Access')
      return
    }
    event.stopPropagation()
    if (suiteId) this.testSuiteId = suiteId
    this.openModal(plan, event)
    this.onModalGenerate(true)
  }

  closeModal() {
    if (this.modalGenerating) {
      this.pendingBrowserReload = false
      void this.openGenerationGuardModal()
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
        (this.testCasesByPlan[this.modalPlan.id] || []).length > 0
          ? 'reviewing'
          : 'pending'
    }
  }

  this.modalOpen = false
  this.modalPlan = null
  this.modalCases = []
  this.modalAllCases = []
  this.editingSingleCase = false
  this.editingCaseIds = {}

  // AJOUTER
  this.pendingNewCase = null
}

  onModalGenerate(regenerate = false) {
    if (!this.canEditGenerateForSelectedProject) {
      this.toastr.warning('You must accept this project before generating test cases.', 'Project Access')
      return
    }
    const plan = this.modalPlan
    if (!plan || !this.testSuiteId || this.modalGenerating) return

    const requestId = this.newGenerationRequestId()
    this.activeCaseGenerationRequestId = requestId
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
      generationRequestId: requestId,
    }).subscribe({
      next: (resp) => {
        const generatedCases = this.applyCurrentUserAsAuthorIfMissing(resp?.testCases || [], plan.id)
        this.modalCases = generatedCases
        this.modalAllCases = [...generatedCases]
        this.editingSingleCase = false
        this.liveCases = [...generatedCases]
        this.testCasesByPlan[plan.id] = [...generatedCases]
        this.planStatuses[plan.id] = this.modalCases.length ? 'reviewing' : 'pending'

        // Auteur : extrait depuis le premier test case retourné
        const first = this.modalCases[0]
        const fromCase = first ? this.buildUserPreview(first.createdBy) : null
        if (fromCase && (fromCase.name || fromCase.picture)) {
          this.planAuthors[plan.id] = { name: fromCase.name, picture: fromCase.picture }
        } else {
          // Fallback : si l'API ne renvoie pas createdBy.name/picture,
          // on utilise l'utilisateur connecté comme auteur du plan.
          this.seedPlanAuthorFromCurrentUser(plan.id)
        }

        this.setPlanDirty(plan.id, true)
        this.refreshUnsavedFlag()
        this.toastr.success(
          `Test cases ${regenerate ? 'regenerated' : 'generated'} for ${plan.id}`,
          'Generation'
        )
      },
      error: (err: unknown) => {
        this.planStatuses[plan.id] = 'pending'
        this.errorMessage = getErrorMessage(err, 'Unable to generate test cases')
        this.modalGenerating = false
        this.activeCaseGenerationRequestId = ''
      },
      complete: () => {
        this.modalGenerating = false
        this.modalSubscription = null
        this.activeCaseGenerationRequestId = ''
      },
    })
  }

  private seedPlanAuthorFromCurrentUser(planId: string): void {
    const normalizedPlanId = String(planId || '').trim()
    if (!normalizedPlanId) return

    const existing = this.planAuthors[normalizedPlanId]
    if (existing?.name || existing?.picture) return
    if (this.currentUserPreview) {
      this.planAuthors[normalizedPlanId] = {
        name: this.currentUserPreview.name,
        picture: this.currentUserPreview.picture,
      }
      return
    }

    this.store.select(getUser).pipe(take(1)).subscribe({
      next: (user) => {
        const preview = this.buildUserPreview(user as unknown)
        if (!preview) return
        this.planAuthors[normalizedPlanId] = { name: preview.name, picture: preview.picture }
      },
      error: () => {
        // no-op
      },
    })
  }

  onModalValidate() {
    if (!this.canEditGenerateForSelectedProject) {
      this.toastr.warning('You must accept this project before editing or generating test cases.', 'Project Access')
      return
    }
    const plan = this.modalPlan
    if (!plan) return
    // Nouveau test case manuel
if (this.pendingNewCase) {
  const alreadyExists = this.modalAllCases.some(
    tc => tc.id === this.pendingNewCase?.id
  )

  if (!alreadyExists) {
    this.modalAllCases = [
      ...this.modalAllCases,
      this.pendingNewCase,
    ]
  }

  this.pendingNewCase = null
}
    if (!this.testSuiteId) {
      this.toastr.error('Missing test suite id. Please open a test suite before saving.', 'Save')
      return
    }
    const casesToSave = this.editingSingleCase ? this.modalAllCases : this.modalCases
    if (!casesToSave.length) {
      this.toastr.warning('Generate test cases first before validation.', 'Validation')
      return
    }

    const normalizedCasesToSave = this.ensureCasesHaveAuthor(plan.id, casesToSave)
    const testCasesByPlan = [{
      planId: plan.id,
      planTitle: plan.title,
      testCases: normalizedCasesToSave,
    }]

    const normalizedStatuses: Record<string, PlanValidationStatus> = { ...this.planStatuses }
    normalizedStatuses[plan.id] = 'confirmed'

    const suiteStatus: SuiteSessionStatus = this.computeSuiteSessionStatus(normalizedStatuses)

    this.testLabService.saveSuiteSession(this.testSuiteId, {
      sessionKind: 'validation',
      suiteStatus,
      planStatuses: normalizedStatuses,
      testCasesByPlan,
    }).subscribe({
      next: () => {
        this.testCasesByPlan[plan.id] = [...normalizedCasesToSave]
        this.liveCases = [...normalizedCasesToSave]
        this.planStatuses[plan.id] = 'confirmed'
        this.setPlanDirty(plan.id, false)
        this.refreshUnsavedFlag()
        this.toastr.success(this.editingSingleCase ? 'Test case saved successfully.' : `Plan ${plan.id} saved successfully.`, 'Saved')
        this.closeModal()
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to save', 'Save'),
    })
  }

  onModalDeleteCase(caseId: string) {
    if (
  this.pendingNewCase &&
  this.pendingNewCase.id === caseId
) {
  this.pendingNewCase = null
  this.closeModal()
  return
}
    const normalizedId = String(caseId || '').trim()
    if (!normalizedId) return

    this.modalAllCases = this.modalAllCases.filter((tc) => String(tc?.id || '').trim() !== normalizedId)
    this.modalCases = this.modalCases.filter((tc) => String(tc?.id || '').trim() !== normalizedId)

    if (this.modalPlan) {
      this.testCasesByPlan[this.modalPlan.id] = [...this.modalAllCases]
      this.liveCases = [...this.modalAllCases]
      this.setPlanDirty(this.modalPlan.id, true)
    }
    this.refreshUnsavedFlag()
  }

  isEditingCase(caseId: string): boolean {
    return Boolean(this.editingCaseIds[String(caseId || '').trim()])
  }

  toggleEditCase(caseId: string, event?: Event) {
    event?.stopPropagation()
    const normalizedId = String(caseId || '').trim()
    if (!normalizedId) return
    this.editingCaseIds[normalizedId] = !this.editingCaseIds[normalizedId]
  }

  onEditCaseTitle(caseId: string, value: string) {
    this.updateModalCase(caseId, (tc) => ({ ...tc, title: String(value || '') }))
  }

  onEditCaseExpected(caseId: string, value: string) {
    this.updateModalCase(caseId, (tc) => ({ ...tc, expected_result: String(value || '') }))
  }

  onEditCaseStepExpected(caseId: string, stepIndex: number, value: string) {
    const normalizedId = String(caseId || '').trim()
    if (!normalizedId || stepIndex < 0) {
      return
    }

    this.updateModalCase(normalizedId, (tc) => {
      const steps = Array.isArray(tc.steps) ? tc.steps : []
      const currentDetails = Array.isArray(tc.stepDetails) ? tc.stepDetails : []
      const stepDetails = [...currentDetails]
      const existingDetail = stepDetails[stepIndex] || {}

      stepDetails[stepIndex] = {
        ...existingDetail,
        step: String(existingDetail.step || steps[stepIndex] || '').trim(),
        expected_result: String(value || ''),
      }

      return {
        ...tc,
        stepDetails,
      }
    })
  }

  getTestDataText(testCase: TestCaseDto): string {
    const value = testCase?.test_data
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (Array.isArray(value)) return value.map((v) => String(v)).join('\n')
    if (typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .map(([key, val]) => `${key}: ${String(val)}`)
        .join('\n')
    }
    return String(value)
  }

  getStepExpectedResult(testCase: TestCaseDto, index: number): string {
    const detail = Array.isArray(testCase?.stepDetails) ? testCase.stepDetails[index] : null
    return String(
      detail?.expected_result ||
      detail?.actual_result ||
      testCase?.expected_result ||
      ''
    ).trim()
  }

  private parseTestDataLines(value: string): string[] {
    return String(value || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  private syncStepDetailsWithSteps(tc: TestCaseDto, nextSteps: string[]): TestCaseDto {
    const currentDetails = Array.isArray(tc.stepDetails) ? tc.stepDetails : []
    const stepDetails = nextSteps.map((step, index) => {
      const existingDetail = currentDetails[index] || {}
      return {
        ...existingDetail,
        step: String(step || existingDetail.step || '').trim(),
        expected_result: String(
          existingDetail.expected_result ||
          tc.expected_result ||
          ''
        ).trim(),
      }
    })

    return {
      ...tc,
      steps: nextSteps,
      stepDetails,
    }
  }

  onEditCaseTestData(caseId: string, value: string) {
    const test_data = this.parseTestDataLines(value)
    console.log('[TestCasesHome] edit test_data', {
      caseId,
      raw: value,
      test_data,
      count: test_data.length,
    })
    this.updateModalCase(caseId, (tc) => ({ ...tc, test_data }))
  }

  onEditCaseSteps(caseId: string, value: string) {
    const steps = String(value || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    this.updateModalCase(caseId, (tc) => this.syncStepDetailsWithSteps(tc, steps))
  }

  private updateModalCase(caseId: string, updater: (tc: TestCaseDto) => TestCaseDto) {
    const normalizedId = String(caseId || '').trim()
    if (!normalizedId) return

    if (this.pendingNewCase && this.pendingNewCase.id === normalizedId) {
      this.pendingNewCase = this.attachCurrentUserAuthor(updater(this.pendingNewCase))
      this.modalCases = [this.pendingNewCase]
      return
    }

    const allIdx = this.modalAllCases.findIndex((tc) => String(tc?.id || '').trim() === normalizedId)
    if (allIdx < 0) return

    const updated = this.attachCurrentUserAuthor(updater(this.modalAllCases[allIdx]))
    this.modalAllCases = [
      ...this.modalAllCases.slice(0, allIdx),
      updated,
      ...this.modalAllCases.slice(allIdx + 1),
    ]

    // Keep the modal view in sync (subset or full)
    if (this.editingSingleCase) {
      this.modalCases = [updated]
    } else {
      this.modalCases = [...this.modalAllCases]
    }

    if (this.modalPlan) {
      this.testCasesByPlan[this.modalPlan.id] = [...this.modalAllCases]
      this.liveCases = [...this.modalAllCases]
      this.setPlanDirty(this.modalPlan.id, true)
    }
    this.refreshUnsavedFlag()
  }

  // ── Save All ──────────────────────────────────────────────────────────

  onSaveAll() {
    if (!this.testSuiteId) return
    if (!this.canEditGenerateForSelectedProject) {
      this.toastr.warning('You must accept this project before saving.', 'Project Access')
      return
    }

    const normalizedStatuses: Record<string, PlanValidationStatus> = {}
    for (const plan of this.allPlans) {
      normalizedStatuses[plan.id] = this.getPlanStatus(plan.id)
    }

    const suiteStatus: SuiteSessionStatus = this.computeSuiteSessionStatus(normalizedStatuses)

    const testCasesByPlan = this.allPlans.map(p => ({
      planId: p.id,
      planTitle: p.title,
      testCases: this.ensureCasesHaveAuthor(p.id, this.testCasesByPlan[p.id] || []),
    }))

    this.testLabService.saveSuiteSession(this.testSuiteId, {
      sessionKind: 'validation',
      suiteStatus,
      planStatuses: normalizedStatuses,
      testCasesByPlan,
    }).subscribe({
      next: () => {
        this.dirtyPlans = {}
        this.dirtySuite = false
        this.refreshUnsavedFlag()
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

  getPlanValidationLabel(planId: string): 'Completed' | 'Incomplete' | 'Generating...' {
    const status = this.getPlanStatus(planId)
    if (status === 'generating') return 'Generating...'
    return status === 'confirmed' ? 'Completed' : 'Incomplete'
  }

  private isSuiteValidated(suite: TestSuiteDto): boolean {
    const status = String(suite?.status || '').toLowerCase().trim()
    const validation = String(suite?.validationStatus || '').toLowerCase().trim()
    return status === 'completed' || status === 'validated' || validation === 'completed' || validation === 'validated'
  }

  // ── Unsaved changes modal ─────────────────────────────────────────────

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.isGenerationInProgress()) {
      event.preventDefault()
      event.returnValue = 'Generation in progress.'
      return
    }
    if (!this.hasUnsavedChanges) return
    event.preventDefault()
    event.returnValue = 'You have unsaved changes.'
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    if (!this.isGenerationInProgress()) return
    const key = String(event.key || '').toLowerCase()
    const wantsReload = key === 'f5' || ((event.ctrlKey || event.metaKey) && key === 'r')
    if (!wantsReload) return
    event.preventDefault()
    if (this.generationGuardModalOpen) return
    this.pendingBrowserReload = true
    void this.openGenerationGuardModal()
  }

  canDeactivate(): boolean | Promise<boolean> {
    if (this.allowGenerationNavigation) {
      this.allowGenerationNavigation = false
      return true
    }
    if (this.isGenerationInProgress()) return this.openGenerationGuardModal()
    if (!this.hasUnsavedChanges) return true
    return this.openUnsavedModal()
  }

  onGenerationGuardYes(): void {
    const shouldReload = this.pendingBrowserReload
    this.pendingBrowserReload = false
    this.allowGenerationNavigation = true
    this.closeGenerationGuardModal(true)
    if (shouldReload) {
      setTimeout(() => window.location.reload(), 0)
    }
  }

  async onGenerationGuardNo(): Promise<void> {
    if (this.generationStopping) return
    this.generationStopping = true
    const shouldReload = this.pendingBrowserReload
    try {
      this.pendingBrowserReload = false
      this.allowGenerationNavigation = true
      this.closeGenerationGuardModal(true)
      await this.stopCaseGenerationFlow()
      if (shouldReload) {
        setTimeout(() => window.location.reload(), 0)
      }
    } finally {
      this.generationStopping = false
    }
  }

  private setPlanDirty(planId: string, dirty = true) {
    const normalizedPlanId = String(planId || '').trim()
    if (!normalizedPlanId) return
    if (dirty) this.dirtyPlans[normalizedPlanId] = true
    else delete this.dirtyPlans[normalizedPlanId]

    // Any plan change implies the suite has unsaved changes too.
    if (dirty) this.dirtySuite = true
    this.refreshUnsavedFlag()
  }

  private setSuiteDirty(dirty = true) {
    this.dirtySuite = !!dirty
    this.refreshUnsavedFlag()
  }

  private refreshUnsavedFlag() {
    this.hasUnsavedChanges = this.dirtySuite || Object.values(this.dirtyPlans).some(Boolean)
  }

  private openUnsavedModal(): Promise<boolean> {
    this.unsavedModalOpen = true
    return new Promise<boolean>((resolve) => {
      this.unsavedResolve = resolve
    })
  }

  private isGenerationInProgress(): boolean {
    return this.modalGenerating || this.generating
  }

  private openGenerationGuardModal(): Promise<boolean> {
    this.generationGuardModalOpen = true
    return new Promise<boolean>((resolve) => {
      this.generationGuardResolve = resolve
    })
  }

  private closeGenerationGuardModal(allowed: boolean): void {
    this.generationGuardModalOpen = false
    this.generationGuardResolve?.(allowed)
    this.generationGuardResolve = null
  }

  private async stopCaseGenerationFlow(): Promise<void> {
    const plan = this.modalPlan
    const planId = String(plan?.id || this.livePlanId || '').trim()
    const suiteId = String(this.testSuiteId || '').trim()

    this.modalSubscription?.unsubscribe()
    this.modalSubscription = null
    this.generationSubscription?.unsubscribe()
    this.generationSubscription = null
    this.modalGenerating = false
    this.generating = false
    if (planId && this.planStatuses[planId] === 'generating') {
      this.planStatuses[planId] = 'pending'
    }

    // Remove the UI blocking overlay immediately, then cancel the backend
    // generation in the background so the page is never left blurred.
    this.closeModalForce()

    try {
      await firstValueFrom(this.testLabService.cancelGeneration({
        testSuiteId: suiteId || undefined,
        planId: planId || undefined,
        scope: 'cases',
        requestId: this.activeCaseGenerationRequestId || undefined,
      }))
      this.toastr.info('Generation stopped.', 'Generation')
    } catch {
      this.toastr.info('Generation stopped on UI. Backend cancellation endpoint unavailable.', 'Generation')
    } finally {
      this.activeCaseGenerationRequestId = ''
    }
  }

  private newGenerationRequestId(): string {
    const rand = Math.random().toString(36).slice(2, 10)
    return `cases-${Date.now()}-${rand}`
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
    this.dirtyPlans = {}
    this.dirtySuite = false
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

    const suiteStatus: SuiteSessionStatus = this.computeSuiteSessionStatus(normalizedStatuses)

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
        this.dirtyPlans = {}
        this.dirtySuite = false
        this.refreshUnsavedFlag()
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

  // ── Private helpers ───────────────────────────────────────────────────

  private initializePlanStatuses(plans: TestPlanDto[]) {
    for (const plan of plans || []) {
      if (!this.planStatuses[plan.id]) {
        this.planStatuses[plan.id] = 'pending'
      }
    }
  }

  private computeSuiteSessionStatus(statuses: Record<string, PlanValidationStatus>): SuiteSessionStatus {
    void statuses
    if (!this.allPlans.length) return 'incomplete'
    const allHaveCases = this.allPlans.every(
      (p) => (this.testCasesByPlan[p.id] || []).length > 0
    )
    return allHaveCases ? 'completed' : 'incomplete'
  }

  /**
   * Construit un UserPreview depuis n'importe quel objet user-like.
   * Normalise null → undefined pour picture.
   */
  private buildUserPreview(user?: unknown | null): UserPreview | null {
    if (!user) return null

    const root = user as Record<string, unknown>
    const nestedUser =
      root['user'] && typeof root['user'] === 'object'
        ? (root['user'] as Record<string, unknown>)
        : null
    const u = nestedUser || root

    const name =
      String(u['name'] || u['nom'] || u['username'] || u['firstName'] || '').trim() || undefined

    const pictureRaw =
      (u['picture'] ?? u['avatar'] ?? undefined) as string | undefined
    const picture = this.resolveAvatarUrl(pictureRaw)

    if (!name && !picture) return null

    return {
      id: String(u['userId'] || u['_id'] || u['id'] || root['userId'] || root['_id'] || root['id'] || name || 'unknown'),
      name,
      picture: picture || undefined,
    }
  }

  private hydrateCurrentUserPreview(): void {
    this.store.select(getUser).pipe(take(1)).subscribe({
      next: (user) => {
        this.currentUserPreview = this.buildUserPreview(user as unknown)
      },
      error: () => {
        this.currentUserPreview = null
      },
    })
  }

  private attachCurrentUserAuthor(testCase: TestCaseDto): TestCaseDto {
    const current = this.currentUserPreview
    if (!current) return testCase
    return {
      ...testCase,
      createdBy: {
        userId: current.id,
        name: current.name,
        picture: current.picture,
      },
    } as TestCaseDto
  }

  private applyCurrentUserAsAuthorIfMissing(cases: TestCaseDto[], planId: string): TestCaseDto[] {
    const preview = this.currentUserPreview
    if (preview?.name || preview?.picture) {
      this.planAuthors[String(planId || '').trim()] = {
        name: preview?.name,
        picture: preview?.picture,
      }
    }

    return (cases || []).map((tc) => {
      const existing = this.buildUserPreview((tc as { createdBy?: unknown })?.createdBy)
      if (existing?.name || existing?.picture) return tc
      return this.attachCurrentUserAuthor(tc)
    })
  }

  private ensureCasesHaveAuthor(planId: string, cases: TestCaseDto[]): TestCaseDto[] {
    const author = this.planAuthors[String(planId || '').trim()]
    if (!author?.name && !author?.picture) return cases
    return (cases || []).map((tc) => {
      const hasAuthor = Boolean((tc as { createdBy?: unknown })?.createdBy)
      if (hasAuthor) return tc
      return {
        ...tc,
        createdBy: {
          name: author.name,
          picture: author.picture,
        },
      } as TestCaseDto
    })
  }

  /**
   * Extrait les auteurs depuis les blocs testCasesByPlan (données serveur).
   */
  private extractAuthorsFromBlocks(blocks: TestCasesByPlanDto[]) {
    for (const block of blocks || []) {
      const planId = String((block as { planId?: unknown })?.planId || '').trim()
      if (!planId || this.planAuthors[planId]) continue

      const raw = block as unknown as Record<string, unknown>
      const author =
        raw['generatedBy'] || raw['author'] || raw['createdBy']
      if (!author) continue

      const preview = this.buildUserPreview(author)
      if (preview) {
        this.planAuthors[planId] = {
          name: preview.name,
          picture: preview.picture,
        }
      }
    }
  }

  /**
   * Pour chaque plan ayant des test cases mais sans auteur connu,
   * tente d'extraire l'auteur depuis le premier test case.
   */
  private applyCaseAuthorFallback(plans: TestPlanDto[]) {
    for (const plan of plans || []) {
      if (this.planAuthors[plan.id]) continue

      const first = (this.testCasesByPlan[plan.id] || [])[0]
      if (!first) continue

      const preview = this.buildUserPreview((first as { createdBy?: unknown })?.createdBy)
      if (preview) {
        this.planAuthors[plan.id] = {
          name: preview.name,
          picture: preview.picture || undefined,
        }
      }
    }
  }

  private getSuiteDisplayName(suite?: unknown): string {
    const source = (suite || {}) as Record<string, unknown>
    return String(
      source['nametest'] ??
        source['nom'] ??
        source['name'] ??
        source['suiteName'] ??
        source['testSuiteName'] ??
        source['projectTitle'] ??
        ''
    ).trim()
  }

  private async loadPlansForSuite(testSuiteId: string) {
    this.loading = true
    this.errorMessage = ''
    try {
      const resp = await firstValueFrom(this.testLabService.getTestPlans(testSuiteId))
      this.plans = resp?.testPlans || []
      try {
        const suiteDetail = await firstValueFrom(this.testLabService.getTestSuiteById(testSuiteId))
      const suiteProject = suiteDetail?.projectId
      const projectId = String(typeof suiteProject === 'object' ? suiteProject?._id : suiteProject ?? '').trim()
      if (projectId) this.selectedProjectId = projectId
      if (projectId && !this.projectFilterId) this.projectFilterId = projectId
      } catch {
        // best effort for project preselection
      }

      // Always refresh the suite name when switching suites.
      // Also tolerate _id/id type mismatches (string vs ObjectId-like).
      const suiteId = String(testSuiteId || '').trim()
      const matched = this.suites.find(s => {
        const id = String(s?._id ?? '').trim()
        return !!suiteId && !!id && id === suiteId
      })
      let suiteName = this.getSuiteDisplayName(matched) || this.getSuiteDisplayName(resp)
      if (!suiteName) {
        try {
          const suiteDetail = await firstValueFrom(this.testLabService.getTestSuiteById(testSuiteId))
          suiteName = this.getSuiteDisplayName(suiteDetail)
        } catch {
          suiteName = ''
        }
      }
      if (suiteName) this.currentSuiteName = suiteName
      else if (!this.currentSuiteName) this.currentSuiteName = 'Suite sans nom'

      this.testCasesByPlan = {}
      for (const block of resp?.testCasesByPlan || []) {
        if (block?.planId) this.testCasesByPlan[block.planId] = block?.testCases || []
      }
      this.initializePlanStatuses(this.plans)

      const rows = Array.isArray(resp?.validationPlanStatuses)
        ? resp.validationPlanStatuses
        : (Array.isArray(resp?.planStatuses) ? resp.planStatuses : [])

      for (const row of rows) {
        const planId = String(row?.planId || '').trim()
        const status = String(row?.status || '').toLowerCase().trim()
        if (!planId) continue
        if (
          status === 'pending' || status === 'generating' ||
          status === 'reviewing' || status === 'confirmed'
        ) {
          this.planStatuses[planId] = status as PlanValidationStatus
        }
      }

      this.extractAuthorsFromBlocks(resp?.testCasesByPlan || [])

      for (const p of this.plans) {
        if ((this.testCasesByPlan[p.id] || []).length > 0 && !this.planStatuses[p.id]) {
          this.planStatuses[p.id] = 'reviewing'
        }
      }

      this.applyCaseAuthorFallback(this.plans)

      if (this.plans[0]) {
        this.selectedPlanId = this.plans[0].id
        this.livePlanId = this.plans[0].id
        this.liveCases = this.testCasesByPlan[this.plans[0].id] || []
        this.focusedLiveCaseId = ''
      }
    } catch (err: unknown) {
      this.errorMessage = getErrorMessage(err, 'Unable to load test plans')
    } finally {
      this.loading = false
    }
  }

  private resolveUserIdFromToken(token: string): string {
    try {
      const decoded = jwt_decode<Record<string, unknown>>(token)
      const userLike = (decoded?.['user'] as Record<string, unknown>) || decoded || {}
      return String(
        userLike['userId'] || userLike['id'] || userLike['_id'] || userLike['sub'] || ''
      ).trim()
    } catch { return '' }
  }

  private getSuiteProjectId(suite: TestSuiteDto | null | undefined): string {
    if (!suite) return ''
    const raw = suite.projectId
    if (!raw) return ''
    if (typeof raw === 'string') return String(raw).trim()
    return String(raw?._id || '').trim()
  }

  private isSuiteFromAcceptedProject(suite: TestSuiteDto | null | undefined): boolean {
    const projectId = this.getSuiteProjectId(suite)
    // The API marks suites that the user cannot open with canOpen=false.
    // Do not render those entries: users should never reach an access-denied page.
    return Boolean(projectId) && suite?.canOpen !== false && this.acceptedProjectIds.has(projectId)
  }

  getSuiteProjectTitle(suite: TestSuiteDto): string {
    const fromSuite = String(suite?.projectTitle || '').trim()
    if (fromSuite) return fromSuite

    const project = suite?.projectId
    if (project && typeof project === 'object') {
      const title = String(project.title || '').trim()
      if (title) return title
    }

    const projectId = this.getSuiteProjectId(suite)
    return String(this.projects.find((item) => item._id === projectId)?.title || '—').trim()
  }


openManualAddCase(plan: TestPlanDto, event?: Event): void {
  event?.stopPropagation()

  if (!this.canEditGenerateForSelectedProject) {
    this.toastr.warning(
      'You must accept this project before adding test cases.',
      'Project Access'
    )
    return
  }

  if (!this.testSuiteId) {
    const inferred = this.resolveSuiteIdForPlan(plan.id)
    if (inferred) {
      this.testSuiteId = inferred
    }
  }

  const existing = this.testCasesByPlan[plan.id] || []

  this.pendingNewCase = {
    id: `TC-${existing.length + 1}`,
    title: '',
    steps: [],
    stepDetails: [],
    expected_result: '',
    test_data: [],
    preconditions: [],
    requirements: [],
  } as TestCaseDto

  this.modalPlan = plan

  // IMPORTANT :
  // On ne l'ajoute PAS encore dans la liste
  this.modalAllCases = [...existing]

  // On affiche seulement le brouillon dans le modal
  this.modalCases = [this.pendingNewCase]

  this.editingSingleCase = true
  this.modalGenerating = false
  this.modalOpen = true

  this.editingCaseIds = {
    [this.pendingNewCase.id]: true,
  }
}

onAddStep(caseId: string): void {
  this.updateModalCase(caseId, (tc) => {
    const steps = [...(tc.steps || []), '']
    return this.syncStepDetailsWithSteps(tc, steps)
  })
}

onRemoveStep(caseId: string, index: number): void {
  this.updateModalCase(caseId, (tc) => {
    const steps = (tc.steps || []).filter((_, i) => i !== index)
    return this.syncStepDetailsWithSteps(tc, steps)
  })
}

onEditSingleStep(caseId: string, index: number, value: string): void {
  this.updateModalCase(caseId, (tc) => {
    const steps = [...(tc.steps || [])]
    steps[index] = value
    return this.syncStepDetailsWithSteps(tc, steps)
  })
}

draggedStepIndex: number | null = null;
draggedStepCaseId: string | null = null;

onStepDragStart(event: DragEvent, caseId: string, index: number): void {
  this.draggedStepCaseId = caseId;
  this.draggedStepIndex = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }
}

onStepDragOver(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

onStepDrop(event: DragEvent, caseId: string, targetIndex: number): void {
  event.preventDefault();
  if (
    this.draggedStepCaseId === caseId &&
    this.draggedStepIndex !== null &&
    this.draggedStepIndex !== targetIndex
  ) {
    this.onReorderStep(caseId, this.draggedStepIndex, targetIndex);
  }
  this.draggedStepIndex = null;
  this.draggedStepCaseId = null;
}

onReorderStep(caseId: string, fromIndex: number, toIndex: number): void {
  this.updateModalCase(caseId, (tc) => {
    const steps = [...(tc.steps || [])]
    const details = [...(tc.stepDetails || [])]
    if (fromIndex < 0 || fromIndex >= steps.length) return tc
    if (toIndex < 0 || toIndex >= steps.length) return tc

    const [movedStep] = steps.splice(fromIndex, 1)
    steps.splice(toIndex, 0, movedStep)

    if (details.length) {
      const [movedDetail] = details.splice(fromIndex, 1)
      if (movedDetail) details.splice(toIndex, 0, movedDetail)
    }

    return {
      ...tc,
      steps,
      stepDetails: details,
    }
  })
}
openAbandonModal(): void {
this.selectedAbandonPlanId = ''
this.selectedAbandonCaseId = ''
this.abandonModalOpen = true
}
get abandonCases(): TestCaseDto[] {
  if (!this.selectedAbandonPlanId) {
    return []
  }

  return this.testCasesByPlan[this.selectedAbandonPlanId] || []
}
openConfirmAbandon(): void {
  if (
    !this.selectedAbandonPlanId ||
    !this.selectedAbandonCaseId
  ) {
    this.toastr.warning('Select a test plan and test case')
    return
  }

  this.confirmAbandonModalOpen = true
}
confirmAbandon(): void {
  const planId = this.selectedAbandonPlanId
  const caseId = this.selectedAbandonCaseId

  const testCase = (this.testCasesByPlan[planId] || []).find(tc => tc.id === caseId)
  if (!testCase) {
    this.toastr.error('Test case not found')
    return
  }

  // Utilise le vrai Mongo _id pour l'appel API, pas le champ "id" affiché (TC-1, TC-2...)
  //const mongoId = (testCase as any)._id || testCase.id
  const mongoId = (testCase as TestCaseDto & { _id?: string })._id || testCase.id

  this.testLabService.deleteTestCase(mongoId).subscribe({
    next: () => {
      this.testCasesByPlan[planId] =
        (this.testCasesByPlan[planId] || []).filter(tc => tc.id !== caseId)

      if (this.livePlanId === planId) {
        this.liveCases = [...this.testCasesByPlan[planId]]
      }

      this.setPlanDirty(planId, true)

      this.confirmAbandonModalOpen = false
      this.abandonModalOpen = false

      this.toastr.success('Test case abandoned successfully')
    },
    error: (err) => {
      this.toastr.error(err?.error?.message || 'Unable to abandon test case')
    },
  })
}

}
