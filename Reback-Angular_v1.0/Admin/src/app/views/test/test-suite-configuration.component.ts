// ============================================================
// test-suite-configuration.component.ts
// VERSION ULTRA DEBUG — console.log sur CHAQUE interaction
// même quand tu tapes dans un champ
// ============================================================

import { CommonModule } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, OnInit } from '@angular/core'
import { Store } from '@ngrx/store'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'
import { getUser } from '@/app/store/authentication/authentication.selector'
import { AuthenticationService } from '@/app/core/services/auth.service'
import { jwt_decode } from '@/app/core/utils/jwt-decode'
import { TestLabService, type PlanTestDto } from '@/app/core/services/testlab.service'

type GeneratedSection = {
  title: string
  items: string[]
}

@Component({
  selector: 'app-test-suite-configuration',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './test-suite-configuration.component.html',
  styleUrl: './test-suite-configuration.component.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TestSuiteConfigurationComponent implements OnInit {
  private store = inject(Store)
  private testLabService = inject(TestLabService)
  private authService = inject(AuthenticationService)

  appUrl = ''
  specText = ''
  uploadedFileName = ''
  selectedFile: File | null = null
  generating = false
  errorMessage = ''
  currentTestSuiteId = ''
  generatedSections: GeneratedSection[] = []

  // ── Log au démarrage du composant ────────────────────────
  ngOnInit() {
    console.log('🚀 [INIT] TestSuiteConfigurationComponent chargé')
    console.log('🚀 [INIT] testLabService disponible :', !!this.testLabService)
    console.log('🚀 [INIT] store disponible :', !!this.store)
  }

  // ── Log à chaque frappe dans le champ URL ────────────────
  onAppUrlChange(value: string) {
    this.appUrl = value
    console.log('📝 [URL] Valeur saisie :', value)
  }

  // ── Log à chaque frappe dans le textarea ─────────────────
  onSpecTextChange(value: string) {
    this.specText = value
    console.log('📝 [SPEC] Valeur saisie :', value.slice(0, 50))
  }

  // ── Log à la sélection du fichier ────────────────────────
  onFileSelected(event: Event) {
    console.log('📁 [FILE] Événement onFileSelected déclenché')
    const input = event.target as HTMLInputElement | null
    console.log('📁 [FILE] input element :', input)
    console.log('📁 [FILE] files :', input?.files)
    const file = input?.files?.[0] || null
    this.selectedFile = file
    this.uploadedFileName = file?.name || ''
    if (file) {
      console.log('📁 [FILE] ✅ Fichier sélectionné :', file.name)
      console.log('📁 [FILE] Taille :', file.size, 'bytes')
      console.log('📁 [FILE] Type :', file.type)
    } else {
      console.warn('📁 [FILE] ❌ Aucun fichier sélectionné')
    }
  }

  // ── Log au clic sur Generate ─────────────────────────────
  onGeneratePlan() {
    console.log('🔥 [CLICK] ============================================')
    console.log('🔥 [CLICK] Bouton Generate Test Plan cliqué !')
    console.log('🔥 [CLICK] appUrl =', `"${this.appUrl}"`)
    console.log('🔥 [CLICK] specText =', `"${this.specText.slice(0, 80)}"`)
    console.log('🔥 [CLICK] selectedFile =', this.selectedFile?.name || 'NULL')
    console.log('🔥 [CLICK] generating =', this.generating)
    console.log('🔥 [CLICK] ============================================')
    void this.generatePlan()
  }

  async onCopyPlan() {
    console.log('📋 [COPY] Copie du plan...')
    const text = this.generatedSections
      .map(s => `${s.title}\n${s.items.map(i => `- ${i}`).join('\n')}`)
      .join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      console.log('📋 [COPY] ✅ Copié !')
    } catch (err) {
      console.warn('📋 [COPY] ❌ Échec :', err)
    }
  }

  private resolveUserIdFromToken(token: string): string {
    try {
      const decoded = jwt_decode<Record<string, unknown>>(token)
      const userLike =
        (decoded?.['user'] as Record<string, unknown> | undefined) ?? decoded

      return String(
        (userLike?.['userId'] as string | number | undefined) ||
          (userLike?.['id'] as string | number | undefined) ||
          (userLike?.['_id'] as string | number | undefined) ||
          (userLike?.['sub'] as string | number | undefined) ||
          ''
      ).trim()
    } catch (err) {
      console.error('🔑 [JWT] Erreur décodage token :', err)
      return ''
    }
  }

  onDownloadPlan() {
    console.log('💾 [DOWNLOAD] Téléchargement...')
    const text = this.generatedSections
      .map(s => `${s.title}\n${s.items.map(i => `- ${i}`).join('\n')}`)
      .join('\n\n')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'generated-test-plan.txt'
    a.click()
    URL.revokeObjectURL(url)
    console.log('💾 [DOWNLOAD] ✅ Téléchargé')
  }

  onSavePlan() {
    console.log('💾 [SAVE] currentTestSuiteId :', this.currentTestSuiteId)
    alert(`Plan sauvegardé ! TestSuite ID : ${this.currentTestSuiteId}`)
  }

  onExportJira() {
    console.log('📤 [JIRA] Export Jira cliqué')
    alert('Export Jira — à implémenter')
  }

  // ── Flux principal ────────────────────────────────────────
  private async generatePlan() {
    console.log('⚙️ [GENERATE] Fonction generatePlan() démarrée')

    this.errorMessage = ''
    this.generatedSections = []

    // ── Validation URL ───────────────────────────────────────
    console.log('🔍 [VALIDATE] Vérification URL...')
    if (!this.appUrl.trim()) {
      this.errorMessage = "L'URL de l'application est obligatoire"
      console.warn('🔍 [VALIDATE] ❌ URL vide !')
      return
    }
    console.log('🔍 [VALIDATE] ✅ URL ok :', this.appUrl)

    // ── Validation Description ───────────────────────────────
    console.log('🔍 [VALIDATE] Vérification description...')
    if (!this.specText.trim()) {
      this.errorMessage = 'La description est obligatoire'
      console.warn('🔍 [VALIDATE] ❌ Description vide !')
      return
    }
    console.log('🔍 [VALIDATE] ✅ Description ok')

    // ── Validation Fichier ───────────────────────────────────
    console.log('🔍 [VALIDATE] Vérification fichier...')
    if (!this.selectedFile) {
      this.errorMessage = 'Veuillez uploader un fichier .docx'
      console.warn('🔍 [VALIDATE] ❌ Fichier manquant !')
      return
    }
    console.log('🔍 [VALIDATE] ✅ Fichier ok :', this.selectedFile.name)

    this.generating = true
    console.log('⚙️ [GENERATE] generating = true')

    try {
      // ── Récupérer userId ─────────────────────────────────
      console.log('👤 [AUTH] Récupération userId depuis NgRx store...')
      const user = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
      console.log('👤 [AUTH] user reçu :', user)

      // 1) userId depuis store (quand l'app n'a pas été refresh)
      let userId = String((user as any)?.id || (user as any)?._id || '').trim()

      // 2) fallback token (localStorage) si store vide après refresh
      const token = String((user as any)?.token || this.authService.session || '').trim()
      if (!userId && token) userId = this.resolveUserIdFromToken(token)

      console.log('👤 [AUTH] userId final :', userId)

      if (!userId) {
        this.errorMessage = 'Session expirée. Reconnectez-vous.'
        console.error('👤 [AUTH] ❌ userId introuvable même dans le token !')
        return
      }

      // ── FormData ─────────────────────────────────────────
      console.log('📦 [FORMDATA] Construction FormData...')
      const formData = new FormData()
      formData.append('file', this.selectedFile)
      formData.append('urlCible', this.appUrl.trim())
      formData.append('description', this.specText.trim())
      formData.append('userId', userId)
      formData.append('nom', `Test Suite - ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`)
      formData.append('regenerate', 'true')
      console.log('📦 [FORMDATA] ✅ FormData prêt')

      // ── Appel HTTP ────────────────────────────────────────
      console.log('🌐 [HTTP] Appel generatePlanFromDocx...')
      console.log('🌐 [HTTP] URL cible : POST /ollama/generate-plan')

      const result = await firstValueFrom(
        this.testLabService.generatePlanFromDocx(formData)
      )

      console.log('🌐 [HTTP] ✅ Réponse reçue !')
      console.log('🌐 [HTTP] result complet :', result)
      console.log('🌐 [HTTP] testSuiteId :', result?.testSuiteId)
      console.log('🌐 [HTTP] steps :', result?.steps)
      console.log('🌐 [HTTP] plans :', result?.plans)

      this.currentTestSuiteId = String(result?.testSuiteId || '')

      const steps = Array.isArray(result?.steps)
        ? result.steps
        : this.normalizeSteps(result?.plans || [])

      console.log('📋 [STEPS] Nombre :', steps.length)
      console.log('📋 [STEPS] Liste :', steps)

      this.generatedSections = [{
        title: 'Generated Test Plan',
        items: steps.length ? steps : ['Aucun step — vérifier la console F12']
      }]

      console.log('✅ [UI] generatedSections mis à jour :', this.generatedSections)

    } catch (err: unknown) {
      console.error('❌ [ERROR] Erreur capturée :', err)
      console.error('❌ [ERROR] status :', (err as any)?.status)
      console.error('❌ [ERROR] error body :', (err as any)?.error)
      console.error('❌ [ERROR] message :', (err as any)?.message)

      const status = (err as any)?.status
      if (status === 0) {
        this.errorMessage = '❌ Backend Node.js non accessible — vérifier que npm start tourne sur port 3000'
      } else if (status === 502) {
        this.errorMessage = '❌ FastAPI non accessible — vérifier que uvicorn tourne sur port 8000'
      } else if (status === 504) {
        this.errorMessage = '❌ Ollama timeout — essayer avec un fichier plus petit'
      } else {
        this.errorMessage =
          (err as any)?.error?.error ||
          (err as any)?.error?.message ||
          (err as any)?.message ||
          'Erreur inconnue — voir console F12'
      }
    } finally {
      this.generating = false
      console.log('⚙️ [GENERATE] generating = false — terminé')
    }
  }

  private normalizeSteps(plans: PlanTestDto[]): string[] {
    return [...plans]
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
      .map(p => String(p.contenu || '').trim())
      .filter(Boolean)
  }
}
