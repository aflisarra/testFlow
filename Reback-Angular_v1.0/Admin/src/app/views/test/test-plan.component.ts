import { AuthenticationService } from '@/app/core/services/auth.service'
import {
  TestLabService,
  type TestCaseDto,
  type TestPlanDto,
} from '@/app/core/services/testlab.service'
import { jwt_decode } from '@/app/core/utils/jwt-decode'
import { getUser } from '@/app/store/authentication/authentication.selector'
import { CommonModule } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core'
import { Router } from '@angular/router'
import { Store } from '@ngrx/store'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'
import { ToastrService } from 'ngx-toastr'

// Statuts possibles pour chaque plan dans le flux séquentiel
export type PlanStatus = 'pending' | 'generating' | 'reviewing' | 'confirmed'

@Component({
  selector: 'app-test-suite-configuration',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './test-plan.component.html',
  styleUrl: './test-plan.component.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TestSuiteConfigurationComponent {
  private store = inject(Store)
  private testLabService = inject(TestLabService)
  private authService = inject(AuthenticationService)
  private router = inject(Router)
  private toastr = inject(ToastrService)

  styleConfig = ''
  nameTest = ''
  uploadedFileName = ''
  selectedFile: File | null = null

  generatingPlans = false
  errorMessage = ''

  currentTestSuiteId = ''
  testPlans: TestPlanDto[] = []
  testCasesByPlan: Record<string, TestCaseDto[]> = {}

  // ─── Flux séquentiel ───────────────────────────────────────────────────────
  /** Index du plan actuellement affiché/traité (0-based). -1 = pas encore démarré */
  currentPlanIndex = -1

  /** Statut de chaque plan : pending → generating → reviewing → confirmed */
  planStatuses: Record<string, PlanStatus> = {}

  /** True pendant la génération des test cases du plan courant */
  generatingCases = false

  /** True pendant la navigation finale vers /test-cases */
  finishing = false
  plansValidated = false
  sessionSaved = false

  // ──────────────────────────────────────────────────────────────────────────

  // ─── Getters utilitaires ──────────────────────────────────────────────────

  get currentPlan(): TestPlanDto | null {
    if (this.currentPlanIndex < 0 || this.currentPlanIndex >= this.testPlans.length) return null
    return this.testPlans[this.currentPlanIndex]
  }

  get currentTestCases(): TestCaseDto[] {
    const plan = this.currentPlan
    if (!plan) return []
    return this.testCasesByPlan[plan.id] || []
  }

  get isLastPlan(): boolean {
    return this.currentPlanIndex === this.testPlans.length - 1
  }

  get allPlansConfirmed(): boolean {
    return (
      this.testPlans.length > 0 &&
      this.testPlans.every((p) => this.planStatuses[p.id] === 'confirmed')
    )
  }

  /** Nombre de plans confirmés */
  get confirmedCount(): number {
    return this.testPlans.filter((p) => this.planStatuses[p.id] === 'confirmed').length
  }

  // ──────────────────────────────────────────────────────────────────────────

  // 🔹 Style config
  onStyleConfigChange(value: string) {
    this.styleConfig = value
  }

  onNameTestChange(value: string) {
    this.nameTest = value
  }

  // 🔹 Sélection de fichier
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement | null
    const file = input?.files?.[0] || null
    this.selectedFile = file
    this.uploadedFileName = file?.name || ''
  }

  // 🔹 Bouton "Generate Plan"
  onGeneratePlan() {
    void this.generatePlans()
  }

  onValidatePlans() {
    if (!this.testPlans.length) return
    this.testPlans.forEach((p) => {
      this.planStatuses[p.id] = 'confirmed'
    })
    this.plansValidated = true
    this.toastr.success('Test plans validated successfully.', 'Validation')
  }

  async onSaveSession(): Promise<boolean> {
    if (!this.testPlans.length || !this.currentTestSuiteId) return false
    const suiteStatus = this.allPlansConfirmed ? 'complete' : 'incomplete'
    try {
      await firstValueFrom(
        this.testLabService.saveSuiteSession(this.currentTestSuiteId, {
          suiteStatus,
          planStatuses: this.planStatuses,
        })
      )
      this.sessionSaved = true
      return true
    } catch (err: any) {
      this.toastr.error(err?.error?.message || 'Unable to save session', 'Save')
      return false
    }
  }

  async onValidateAndGoToCases() {
    if (!this.testPlans.length) {
      this.toastr.warning('Generate at least one test plan first.', 'Validation')
      return
    }
    if (!this.plansValidated) {
      this.onValidatePlans()
    }
    if (this.currentTestSuiteId && !this.sessionSaved) {
      const saved = await this.onSaveSession()
      if (!saved) {
        this.toastr.warning('Session not saved. Redirecting to test cases anyway.', 'Save')
      }
    }

    this.finishing = true
    try {
      await this.router.navigate(['/test-cases'], {
        queryParams: this.currentTestSuiteId ? { suiteId: this.currentTestSuiteId } : undefined,
        state: { plans: this.testPlans },
      })
    } finally {
      this.finishing = false
    }
  }

  // 🔹 Annuler / reset complet
  onCancelPlans() {
    this.errorMessage = ''
    this.generatingPlans = false
    this.generatingCases = false
    this.finishing = false
    this.nameTest = ''

    this.currentTestSuiteId = ''
    this.testPlans = []
    this.testCasesByPlan = {}
    this.currentPlanIndex = -1
    this.planStatuses = {}
    this.plansValidated = false
    this.sessionSaved = false
  }

  // 🔹 Régénérer tous les plans depuis le début
  onRegeneratePlans() {
    void this.generatePlans(true)
  }

  async onRegeneratePlan(plan: TestPlanDto, index: number) {
    if (!plan?.id || !this.currentTestSuiteId) return
    if (!this.selectedFile) {
      this.toastr.warning('Upload the specification document first.', 'Regenerate')
      return
    }

    try {
      const user = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
      let userId = String((user as any)?.id || (user as any)?._id || '').trim()
      const token = String((user as any)?.token || this.authService.session || '').trim()
      if (!userId && token) userId = this.resolveUserIdFromToken(token)
      if (!userId) {
        this.toastr.error('Session expired. Reconnect and retry.', 'Session')
        return
      }

      const formData = new FormData()
      formData.append('file', this.selectedFile)
      formData.append('styleConfig', this.styleConfig.trim())
      formData.append('description', this.styleConfig.trim())
      formData.append('userId', userId)
      formData.append('testSuiteId', this.currentTestSuiteId)
      formData.append('planId', plan.id)
      formData.append('regenerate', 'true')

      const result = await firstValueFrom(this.testLabService.generatePlanFromDocx(formData))
      const nextPlans = Array.isArray(result?.testPlans) ? result.testPlans : []
      if (!nextPlans.length) {
        this.toastr.warning('No regenerated plan returned by backend.', 'Regenerate')
        return
      }

      const bySameId = nextPlans.find((p) => p.id === plan.id)
      const bySameIndex = nextPlans[index] || null
      const updated = bySameId || bySameIndex
      if (!updated) {
        this.toastr.warning('Unable to match regenerated plan.', 'Regenerate')
        return
      }

      this.testPlans[index] = updated
      this.planStatuses[updated.id] = 'pending'
      this.sessionSaved = false
      this.plansValidated = false
      this.toastr.success(`Plan ${plan.id} regenerated successfully.`, 'Regenerate')
    } catch (err: any) {
      this.toastr.error(err?.error?.message || 'Unable to regenerate this plan', 'Regenerate')
    }
  }

  // ─── Flux séquentiel ──────────────────────────────────────────────────────

  /**
   * Démarre le flux : génère les test cases du premier plan.
   * Appelé depuis "Confirm" sur la liste des plans.
   */
  async onStartSequentialFlow() {
    await this.onValidateAndGoToCases()
  }

  /**
   * L'utilisateur confirme les test cases du plan courant.
   * → marque le plan "confirmed" puis passe au suivant.
   */
  async onConfirmCurrentPlan() {
    const plan = this.currentPlan
    if (!plan) return

    this.planStatuses[plan.id] = 'confirmed'

    if (this.isLastPlan) {
      // Tous les plans sont confirmés → naviguer
      await this.finishAndNavigate()
    } else {
      // Passer au plan suivant et générer ses test cases
      this.currentPlanIndex++
      await this.generateCasesForCurrentPlan()
    }
  }

  /**
   * Régénère les test cases du plan courant sans avancer.
   */
  async onRegenerateCurrentCases() {
    await this.generateCasesForCurrentPlan(true)
  }

  /**
   * Revenir au plan précédent (pour revoir / modifier).
   */
  onGoToPreviousPlan() {
    if (this.currentPlanIndex > 0) {
      this.currentPlanIndex--
      // Le plan revient en mode "reviewing" pour permettre re-confirmation
      const plan = this.currentPlan
      if (plan) this.planStatuses[plan.id] = 'reviewing'
    }
  }

  /**
   * Supprimer un test case du plan courant.
   */
  onDeleteTestCase(planId: string, testCaseId: string) {
    const list = this.testCasesByPlan[planId] || []
    this.testCasesByPlan[planId] = list.filter((tc) => tc.id !== testCaseId)
  }

  /**
   * Copier les test cases du plan courant dans le presse-papier.
   */
  async onCopyCurrentPlan() {
    const plan = this.currentPlan
    if (!plan) return
    const cases = this.testCasesByPlan[plan.id] || []
    const text = this.formatPlanText(plan, cases)
    await navigator.clipboard.writeText(text)
  }

  /**
   * Télécharger les test cases du plan courant.
   */
  onDownloadCurrentPlan() {
    const plan = this.currentPlan
    if (!plan) return
    const cases = this.testCasesByPlan[plan.id] || []
    const text = this.formatPlanText(plan, cases)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${plan.id}-test-cases.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ──────────────────────────────────────────────────────────────────────────

  // ─── Privé ────────────────────────────────────────────────────────────────

  private formatPlanText(plan: TestPlanDto, cases: TestCaseDto[]): string {
    return [
      `Test Plan: ${plan.title || plan.id}`,
      plan.description ? `Description: ${plan.description}` : '',
      '',
      ...cases.map(
        (tc) =>
          `${tc.id} — ${tc.title}\n${tc.steps.map((s) => `- ${s}`).join('\n')}\nExpected: ${tc.expected_result}`
      ),
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  private async generateCasesForCurrentPlan(regenerate = false) {
    const plan = this.currentPlan
    if (!plan) return

    this.errorMessage = ''
    this.generatingCases = true
    this.planStatuses[plan.id] = 'generating'

    try {
      const resp = await firstValueFrom(
        this.testLabService.generateTestCases({
          testSuiteId: this.currentTestSuiteId,
          planId: plan.id,
          planTitle: plan.title,
          planDescription: plan.description,
          regenerate,
        })
      )
      this.testCasesByPlan[plan.id] = resp?.testCases || []
      this.planStatuses[plan.id] = 'reviewing'
    } catch (err: unknown) {
      this.errorMessage =
        (err as any)?.error?.message || (err as any)?.message || 'Erreur génération test cases'
      this.planStatuses[plan.id] = 'pending'
    } finally {
      this.generatingCases = false
    }
  }

  private async finishAndNavigate() {
    this.finishing = true
    try {
      await this.router.navigate(['/test-cases'], {
        queryParams: { suiteId: this.currentTestSuiteId },
        state: { plans: this.testPlans },
      })
      /*this.toastr.info(
        'Generation des test cases en cours en arriere-plan. Vous pouvez naviguer librement.',
        'AI'
      )*/
    } finally {
      this.finishing = false
    }
  }

  private resolveUserIdFromToken(token: string): string {
    try {
      const decoded = jwt_decode<Record<string, unknown>>(token)
      const userLike =
        (decoded?.['user'] as Record<string, unknown>) || decoded || {}
      return String(
        userLike['userId'] || userLike['id'] || userLike['_id'] || userLike['sub'] || ''
      ).trim()
    } catch {
      return ''
    }
  }

  private async generatePlans(regenerate = false) {
    this.errorMessage = ''
    this.generatingPlans = true
    this.testPlans = []
    this.testCasesByPlan = {}
    this.currentPlanIndex = -1
    this.planStatuses = {}
    this.plansValidated = false
    this.sessionSaved = false

    try {
      this.toastr.info('Generation du test plan en cours. Vous pouvez changer de page.', 'AI')
      if (!this.selectedFile) {
        this.errorMessage = 'Veuillez uploader un fichier (.docx / .md / .txt)'
        this.toastr.warning(this.errorMessage, 'Test Plan')
        return
      }

      const user = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
      let userId = String((user as any)?.id || (user as any)?._id || '').trim()
      const token = String((user as any)?.token || this.authService.session || '').trim()
      if (!userId && token) userId = this.resolveUserIdFromToken(token)
      if (!userId) {
        this.errorMessage = 'Session expirée. Reconnectez-vous.'
        this.toastr.error(this.errorMessage, 'Session')
        return
      }

      const formData = new FormData()
      formData.append('file', this.selectedFile)
      formData.append('styleConfig', this.styleConfig.trim())
      formData.append('description', this.styleConfig.trim())
      formData.append('userId', userId)
      formData.append(
        'nom',
        `Test Suite - ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`
      )
      if (this.nameTest.trim()) formData.append('nametest', this.nameTest.trim())
      if (this.currentTestSuiteId) formData.append('testSuiteId', this.currentTestSuiteId)
      formData.append('regenerate', regenerate ? 'true' : 'false')

      const result = await firstValueFrom(this.testLabService.generatePlanFromDocx(formData))

      this.currentTestSuiteId = String(result?.testSuiteId || '')
      this.testPlans = Array.isArray(result?.testPlans) ? result.testPlans : []

      // Initialiser tous les plans à "pending"
      this.testPlans.forEach((p) => (this.planStatuses[p.id] = 'pending'))

      if (!this.testPlans.length) {
        this.errorMessage = 'Aucun test plan généré.'
        this.toastr.warning(this.errorMessage, 'Test Plan')
      } else {
        this.toastr.success('Test plans générés avec succès.', 'AI')
      }
    } catch (err: unknown) {
      const status = (err as any)?.status
      if (status === 0) {
        this.errorMessage =
          'Backend Node.js non accessible — vérifier que le serveur tourne sur port 3000'
      } else if (status === 502) {
        this.errorMessage =
          'FastAPI non accessible — vérifier que uvicorn tourne sur port 8000'
      } else if (status === 504) {
        this.errorMessage = 'Ollama timeout — essayer avec un fichier plus petit'
      } else {
        this.errorMessage =
          (err as any)?.error?.message || (err as any)?.message || 'Erreur inconnue'
      }
      this.toastr.error(this.errorMessage, 'Generation')
    } finally {
      this.generatingPlans = false
    }
  }

}
