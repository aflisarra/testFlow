import { CommonModule } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core'
import { Store } from '@ngrx/store'
import { Router } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'
import { getUser } from '@/app/store/authentication/authentication.selector'
import { AuthenticationService } from '@/app/core/services/auth.service'
import { jwt_decode } from '@/app/core/utils/jwt-decode'
import {
  TestLabService,
  type TestPlanDto,
  type TestCaseDto,
} from '@/app/core/services/testlab.service'

@Component({
  selector: 'app-test-suite-configuration',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './test-suite-configuration.component.html',
  styleUrl: './test-suite-configuration.component.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TestSuiteConfigurationComponent {
  private store = inject(Store)
  private testLabService = inject(TestLabService)
  private authService = inject(AuthenticationService)
  private router = inject(Router)

  styleConfig = ''
  uploadedFileName = ''
  selectedFile: File | null = null

  generatingPlans = false
  generatingCasesPlanId: string | null = null
  confirmingAll = false
  confirmProgress = { done: 0, total: 0, current: '' }
  errorMessage = ''

  currentTestSuiteId = ''
  testPlans: TestPlanDto[] = []
  selectedPlanId: string | null = null
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
  // 🔹 Fonction appelée quand l'utilisateur change le style
  onStyleConfigChange(value: string) {
    // INPUT: value (string) → texte saisi par l'utilisateur
    // OUTPUT: met à jour la variable styleConfig
    this.styleConfig = value
  }
  // 🔹 Fonction appelée quand un fichier est sélectionné
  onFileSelected(event: Event) {
    // INPUT: event (Event) → événement HTML input file
    // OUTPUT:
    // - stocke le fichier sélectionné
    // - met à jour le nom du fichier affiché
    const input = event.target as HTMLInputElement | null
    const file = input?.files?.[0] || null
    this.selectedFile = file
    this.uploadedFileName = file?.name || ''
  }
  // 🔹 Bouton "Generate Plan"
  onGeneratePlan() {
    // INPUT: aucun
    // OUTPUT: lance la génération des test plans
    void this.generatePlans()
  }
  // 🔹 Annuler la génération
  onCancelPlans() {
    // INPUT: aucun
    // OUTPUT:
    // - reset toutes les variables
    // - nettoie l'état du composant
    this.errorMessage = ''
    this.generatingPlans = false
    this.generatingCasesPlanId = null
    this.confirmingAll = false
    this.confirmProgress = { done: 0, total: 0, current: '' }

    this.currentTestSuiteId = ''
    this.testPlans = []
    this.selectedPlanId = null
    this.testCasesByPlan = {}
  }
  // 🔹 Régénérer les plans
  onRegeneratePlans() {
    // INPUT: aucun
    // OUTPUT: relance la génération avec regenerate = true

    void this.generatePlans(true)
  }
  // 🔹 Confirmer tous les plans
  async onConfirmPlans() {
    // INPUT: aucun
    // OUTPUT:
    // - génère les test cases pour chaque plan
    // - redirige vers page test-cases
    if (!this.currentTestSuiteId || !this.testPlans.length) return
    this.errorMessage = ''
    this.confirmingAll = true
    this.confirmProgress = { done: 0, total: this.testPlans.length, current: '' }

    try {
      for (const plan of this.testPlans) {
        this.confirmProgress = {
          done: this.confirmProgress.done,
          total: this.confirmProgress.total,
          current: plan.title || plan.id,
        }
        const ok = await this.generateTestCases(plan, false)
        if (!ok) return
        this.confirmProgress = {
          ...this.confirmProgress,
          done: Math.min(this.confirmProgress.done + 1, this.confirmProgress.total),
        }
      }

      await this.router.navigate(['/test-cases', this.currentTestSuiteId])
    } finally {
      this.confirmingAll = false
      this.confirmProgress = { done: 0, total: 0, current: '' }
    }
  }
  // 🔹 Copier plan dans clipboard
  async onCopyPlan() {
    // INPUT: aucun
    // OUTPUT:
    // - copie texte du plan + test cases dans le presse-papier
    const planId = this.selectedPlanId
    if (!planId) return
    const plan = this.testPlans.find((p) => p.id === planId)
    const cases = this.testCasesByPlan[planId] || []
    const text = [
      `Test Plan: ${plan?.title || planId}`,
      plan?.description ? `Description: ${plan.description}` : '',
      '',
      ...cases.map(
        (tc) =>
          `${tc.id} — ${tc.title}\n${tc.steps.map((s) => `- ${s}`).join('\n')}\nExpected: ${tc.expected_result}`
      ),
    ]
      .filter(Boolean)
      .join('\n\n')
    await navigator.clipboard.writeText(text)
  }
  // 🔹 Télécharger plan

  onDownloadPlan() {
    // INPUT: aucun
    // OUTPUT:
    // - génère un fichier .txt
    // - déclenche téléchargement
    const planId = this.selectedPlanId
    if (!planId) return
    const plan = this.testPlans.find((p) => p.id === planId)
    const cases = this.testCasesByPlan[planId] || []
    const text = [
      `Test Plan: ${plan?.title || planId}`,
      plan?.description ? `Description: ${plan.description}` : '',
      '',
      ...cases.map(
        (tc) =>
          `${tc.id} — ${tc.title}\n${tc.steps.map((s) => `- ${s}`).join('\n')}\nExpected: ${tc.expected_result}`
      ),
    ]
      .filter(Boolean)
      .join('\n\n')

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${plan?.id || 'test-plan'}-test-cases.txt`
    a.click()
    URL.revokeObjectURL(url)
  }
  // 🔹 Sauvegarder plan
  onSavePlan() {
    // INPUT: aucun
    // OUTPUT: affiche message (placeholder)

    alert(`Plan sauvegardé ! TestSuite ID : ${this.currentTestSuiteId}`)
  }

  onExportJira() {
    alert('Export Jira — à implémenter')
  }

  async onSelectPlan(plan: TestPlanDto) {
    this.selectedPlanId = plan.id
  }
  // 🔹 Régénérer test cases d’un plan
  async onRegenerateTestCases(plan: TestPlanDto) {
    // INPUT: plan
    // OUTPUT: regénère test cases pour ce plan

    await this.generateTestCases(plan, true)
  }

  onDeleteTestCase(planId: string, testCaseId: string) {
    const list = this.testCasesByPlan[planId] || []
    this.testCasesByPlan[planId] = list.filter((tc) => tc.id !== testCaseId)
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

  private async generatePlans(regenerate: boolean = true) {
    this.errorMessage = ''
    this.generatingPlans = true
    this.testPlans = []
    this.selectedPlanId = null
    this.testCasesByPlan = {}

    try {
      if (!this.selectedFile) {
        this.errorMessage = 'Veuillez uploader un fichier (.docx / .md / .txt)'
        return
      }

      const user = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
      let userId = String((user as any)?.id || (user as any)?._id || '').trim()
      const token = String((user as any)?.token || this.authService.session || '').trim()
      if (!userId && token) userId = this.resolveUserIdFromToken(token)
      if (!userId) {
        this.errorMessage = 'Session expirée. Reconnectez-vous.'
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
      if (this.currentTestSuiteId) formData.append('testSuiteId', this.currentTestSuiteId)
      formData.append('regenerate', regenerate ? 'true' : 'false')

      const result = await firstValueFrom(this.testLabService.generatePlanFromDocx(formData))

      this.currentTestSuiteId = String(result?.testSuiteId || '')
      this.testPlans = Array.isArray(result?.testPlans) ? result.testPlans : []
      this.selectedPlanId = this.testPlans[0]?.id || null

      if (!this.testPlans.length) {
        this.errorMessage = 'Aucun test plan généré.'
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
    } finally {
      this.generatingPlans = false
    }
  }

  private async generateTestCases(plan: TestPlanDto, regenerate: boolean): Promise<boolean> {
    if (!this.currentTestSuiteId) return false
    this.errorMessage = ''
    this.generatingCasesPlanId = plan.id

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
      return true
    } catch (err: unknown) {
      this.errorMessage =
        (err as any)?.error?.message || (err as any)?.message || 'Erreur test cases'
      return false
    } finally {
      this.generatingCasesPlanId = null
    }
  }
}