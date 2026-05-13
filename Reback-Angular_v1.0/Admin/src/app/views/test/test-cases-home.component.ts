import { CommonModule } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { Store } from '@ngrx/store'
import { Subscription, firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'
import { ToastrService } from 'ngx-toastr'
import { HostListener, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { AuthenticationService } from '@/app/core/services/auth.service'
import { jwt_decode } from '@/app/core/utils/jwt-decode'
import { getUser } from '@/app/store/authentication/authentication.selector'
import type { PlanValidationStatus, SuiteSessionStatus } from '@/app/views/test/models/status.types'
import { getErrorMessage } from '@/app/views/test/utils/error.utils'
import { ProjectsStateService } from '@/app/core/services/projects-state.service'
import { ApiService } from '@/app/core/services/api.service'
import type { AppProject } from '@/app/interfaces/admin-management.interface'

import {
  TestLabService,
  type TestCaseDto,
  type TestPlanDto,
  type TestSuiteDto,
  type TestCasesByPlanDto,
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
  selectedProjectId = ''
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

  livePlanId = ''
  liveCases: TestCaseDto[] = []

  private generationSubscription: Subscription | null = null

  // ── Auteurs par plan ─────────────────────────────────────────────────
  // picture est toujours string | undefined ici (jamais null)
  planAuthors: Record<string, { name?: string; picture?: string }> = {}
  currentUserPreview: UserPreview | null = null

  // ── Getters ──────────────────────────────────────────────────────────

  get selectedProjectTitle(): string {
    const id = String(this.selectedProjectId || '').trim()
    if (!id) return ''
    return String(this.projects.find(p => p._id === id)?.title || '').trim()
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

    void this.loadProjects()

    const state = history.state as { plans?: TestPlanDto[] }
    this.plans = state?.plans || []
    this.initializePlanStatuses(this.plans)

    if (this.testSuiteId) {
      await this.loadPlansForSuite(this.testSuiteId)
    } else {
      await this.loadSuites()
    }
  }

  async loadProjects() {
    this.loadingProjects = true
    try {
      // Load all projects then filter to projects accessible by current user (owner or assigned user).
      await this.projectsState.refresh(false)
      const all = await firstValueFrom(this.projectsState.projects$.pipe(take(1)))

      const user = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
      let userId = String(user?.id ?? user?._id ?? '').trim()
      const token = String(user?.token || this.authService.session || '').trim()
      if (!userId && token) userId = this.resolveUserIdFromToken(token)

      this.projects = (Array.isArray(all) ? all : []).filter((p) => {
        if (!userId) return true

        const owner = (p as any)?.ownerId
        const ownerId = String(typeof owner === 'object' ? owner?._id : owner || '').trim()
        if (ownerId && ownerId === userId) return true

        const assigned = Array.isArray((p as any)?.assignedUsers) ? (p as any).assignedUsers : []
        for (const u of assigned) {
          const id = String(typeof u === 'object' ? u?._id : u || '').trim()
          if (id && id === userId) return true
        }
        return false
      })

      // Pré-sélection: si on a déjà un projet dans la suite courante
      const fromSuite = (this.suites || []).find(s => String((s as any)?._id || '').trim() === String(this.testSuiteId || '').trim())
      const projectId = String((fromSuite as any)?.projectId?._id ?? (fromSuite as any)?.projectId ?? '').trim()
      if (projectId) this.selectedProjectId = projectId
    } catch {
      // Best-effort: keep projects empty if API fails
      this.projects = []
    } finally {
      this.loadingProjects = false
    }
  }

  onApplySelectedProject() {
    if (!this.selectedProjectId) return
    if (this.hasUnsavedChanges) {
      this.pendingAction = () => this.onApplySelectedProject()
      void this.openUnsavedModal()
      return
    }
    void this.applySelectedProjectInternal()
  }

  private async applySelectedProjectInternal() {
    this.loading = true
    this.errorMessage = ''
    try {
      const selectedProjectTitle = this.selectedProjectTitle
      if (!this.testSuiteId) {
        this.toastr.warning('Open a test suite first before changing project.', 'Project')
        return
      }

      await firstValueFrom(this.testLabService.setTestSuiteProject(this.testSuiteId, this.selectedProjectId))
      if (selectedProjectTitle) this.currentSuiteName = selectedProjectTitle

      // Reset view state before loading the new suite
      this.plans = []
      this.planStatuses = {}
      this.testCasesByPlan = {}
      this.expandedPlans = {}
      this.livePlanId = ''
      this.liveCases = []
      this.selectedPlanId = ''
      this.dirtyPlans = {}
      this.setSuiteDirty(true)

      await this.loadPlansForSuite(this.testSuiteId)
      void this.router.navigate(['/test-cases'], {
        queryParams: { suiteId: this.testSuiteId, suiteName: this.currentSuiteName },
      })

      if (selectedProjectTitle) {
        this.toastr.success(`Project changed to: ${selectedProjectTitle}`, 'Project')
      } else {
        this.toastr.success('Project changed.', 'Project')
      }
    } catch (err: unknown) {
      this.errorMessage = getErrorMessage(err, 'Unable to load project suite')
    } finally {
      this.loading = false
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
      let userId = String(user?.id ?? user?._id ?? '').trim()
      const token = String(user?.token || this.authService.session || '').trim()
      if (!userId && token) userId = this.resolveUserIdFromToken(token)
      if (!userId) { this.errorMessage = 'Session expired.'; return }
      this.suites = await firstValueFrom(this.testLabService.getTestSuitesByUser(userId))
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

    // Always refresh the header/breadcrumb suite name on selection
    const suiteName = String((suite as any)?.nametest ?? (suite as any)?.nom ?? (suite as any)?.name ?? '').trim()
    if (suiteName) this.currentSuiteName = suiteName

    // Keep project selector in sync with the suite's projectId (string or populated object)
    const suiteProjectId = String((suite as any)?.projectId?._id ?? (suite as any)?.projectId ?? '').trim()
    if (suiteProjectId) this.selectedProjectId = suiteProjectId
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
          (this.testCasesByPlan[this.modalPlan.id] || []).length > 0 ? 'reviewing' : 'pending'
      }
    }
    this.modalOpen = false
    this.modalPlan = null
    this.modalCases = []
    this.modalAllCases = []
    this.editingSingleCase = false
    this.editingCaseIds = {}
  }

  onModalGenerate(regenerate = false) {
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
    const plan = this.modalPlan
    if (!plan) return
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

    const suiteStatus: SuiteSessionStatus = this.allPlans.length > 0 && this.allPlans.every(
      p => (normalizedStatuses[p.id] || this.getPlanStatus(p.id)) === 'confirmed'
    ) ? 'completed' : 'incomplete'

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

  onEditCaseSteps(caseId: string, value: string) {
    const steps = String(value || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    this.updateModalCase(caseId, (tc) => ({ ...tc, steps }))
  }

  private updateModalCase(caseId: string, updater: (tc: TestCaseDto) => TestCaseDto) {
    const normalizedId = String(caseId || '').trim()
    if (!normalizedId) return

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

    const normalizedStatuses: Record<string, PlanValidationStatus> = {}
    for (const plan of this.allPlans) {
      normalizedStatuses[plan.id] = this.getPlanStatus(plan.id)
    }

    const suiteStatus: SuiteSessionStatus = this.allPlans.length > 0 && this.allPlans.every(
      p => normalizedStatuses[p.id] === 'confirmed'
    ) ? 'completed' : 'incomplete'

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
      await this.stopCaseGenerationFlow()
      this.pendingBrowserReload = false
      this.allowGenerationNavigation = true
      this.closeGenerationGuardModal(true)
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
      this.closeModalForce()
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

    const suiteStatus: SuiteSessionStatus = this.allPlans.length > 0 && this.allPlans.every(
      p => normalizedStatuses[p.id] === 'confirmed'
    ) ? 'completed' : 'incomplete'

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

  private async loadPlansForSuite(testSuiteId: string) {
    this.loading = true
    this.errorMessage = ''
    try {
      const resp = await firstValueFrom(this.testLabService.getTestPlans(testSuiteId))
      this.plans = resp?.testPlans || []

      // Always refresh the suite name when switching suites.
      // Also tolerate _id/id type mismatches (string vs ObjectId-like).
      const suiteId = String(testSuiteId || '').trim()
      const matched = this.suites.find(s => {
        const id = String((s as any)?._id ?? (s as any)?.id ?? '').trim()
        return !!suiteId && !!id && id === suiteId
      })
      const suiteName = String(
        (matched as any)?.nametest ??
          (matched as any)?.nom ??
          (matched as any)?.name ??
          (resp as any)?.suiteName ??
          (resp as any)?.testSuiteName ??
          ''
      ).trim()
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
}
