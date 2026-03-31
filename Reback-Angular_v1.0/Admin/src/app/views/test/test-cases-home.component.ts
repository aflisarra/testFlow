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

  // New state for suites accordion
  expandedSuites: Record<string, boolean> = {}
  suitePlans: Record<string, TestPlanDto[]> = {}
  loadingSuitePlans: Record<string, boolean> = {}

  testSuiteId = ''

  get generatedCount(): number {
    return this.plans.filter((p) => (this.testCasesByPlan[p.id]?.length || 0) > 0).length
  }

  get progressPercent(): number {
    if (!this.plans.length) return 0
    return (this.generatedCount / this.plans.length) * 100
  }

  get currentPlanNumber(): number {
    if (!this.plans.length) return 0
    return Math.min(this.generatedCount + 1, this.plans.length)
  }

  get currentPlanPreview(): TestPlanDto | null {
    if (!this.plans.length) return null
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
  }

  async toggleSuite(suite: TestSuiteDto) {
    const suiteId = suite._id
    if (!suiteId) return

    this.expandedSuites[suiteId] = !this.expandedSuites[suiteId]

    // Only load if expanding and not already loaded/loading
    if (this.expandedSuites[suiteId] && !this.suitePlans[suiteId] && !this.loadingSuitePlans[suiteId]) {
      this.loadingSuitePlans[suiteId] = true
      try {
        const resp = await firstValueFrom(this.testLabService.getTestPlans(suiteId))
        this.suitePlans[suiteId] = resp?.testPlans || []

        // Let's also load test cases for these plans sequentially to not overload ollama
        for (const plan of this.suitePlans[suiteId]) {
          try {
            const tcResp = await firstValueFrom(
              this.testLabService.generateTestCases({
                testSuiteId: suiteId,
                planId: plan.id,
                planTitle: plan.title,
                planDescription: plan.description,
                regenerate: false
              })
            )
            this.testCasesByPlan[plan.id] = tcResp?.testCases || []
            await this.delay(500) // Small delay to avoid hammering the endpoint
          } catch (e) {
            console.error(`Erreur chargement cas plan ${plan.id}`, e)
            this.testCasesByPlan[plan.id] = []
          }
        }
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

    // ✅ FIX : utiliser history.state au lieu de getCurrentNavigation()
    const state = history.state as { plans?: TestPlanDto[] }
    this.plans = state?.plans || []

    if (this.plans.length > 0) {
      this.expandedPlans[this.plans[0].id] = true
    }

    if (this.plans.length) {
      await this.generateAllTestCases()
    } else {
      await this.loadSuites()
      if (requestedSuiteId) {
        const target = this.suites.find((s) => String(s._id || '').trim() === requestedSuiteId)
        if (target && !this.expandedSuites[requestedSuiteId]) {
          await this.toggleSuite(target)
        }
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

      this.suites = await firstValueFrom(
        this.testLabService.getTestSuitesByUser(userId)
      )
    } catch (err: unknown) {
      this.errorMessage =
        (err as any)?.error?.message ||
        (err as any)?.message ||
        'Unable to load test suites'
    } finally {
      this.loading = false
    }
  }

  async generateAllTestCases() {
    if (!this.plans.length || !this.testSuiteId) return

    this.generating = true
    this.errorMessage = ''
    this.toastr.info(
      'Generation des test cases en cours en arriere-plan. Vous pouvez naviguer librement.',
      'AI'
    )

    try {
      for (const plan of this.plans) {
        try {
          const resp = await firstValueFrom(
            this.testLabService.generateTestCases({
              testSuiteId: this.testSuiteId,
              planId: plan.id,
              planTitle: plan.title,
              planDescription: plan.description,
              regenerate: false,
            })
          )
          this.testCasesByPlan[plan.id] = resp?.testCases || []

          // ✅ Pause entre chaque appel pour ne pas surcharger Ollama
          await this.delay(2000)

        } catch (err: unknown) {
          console.error(`Erreur plan ${plan.id}:`, err)
          // Continue avec le plan suivant au lieu de tout arrêter
          this.testCasesByPlan[plan.id] = []
        }
      }
      this.toastr.success('Generation des test cases terminee.', 'AI')
    } finally {
      this.generating = false
    }
  }

  // ✅ Ajouter cette méthode utilitaire
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  openSuite(suite: TestSuiteDto) {
    const id = String(suite?._id || '').trim()
    if (!id) return

    void this.router.navigate(['/test-cases', id])
  }

  private resolveUserIdFromToken(token: string): string {
    try {
      const decoded = jwt_decode<Record<string, unknown>>(token)
      const userLike =
        (decoded?.['user'] as Record<string, unknown>) || decoded || {}

      return String(
        userLike['userId'] ||
        userLike['id'] ||
        userLike['_id'] ||
        userLike['sub'] ||
        ''
      ).trim()
    } catch {
      return ''
    }
  }
}
