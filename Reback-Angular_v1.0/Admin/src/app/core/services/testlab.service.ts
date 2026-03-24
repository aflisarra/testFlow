// ============================================================
// services/testlab.service.ts
// Angular service — appelle Node.js backend
// ============================================================

import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable } from 'rxjs'

// ── Types ────────────────────────────────────────────────────

export interface PlanTestDto {
  _id?: string
  contenu: string
  ordre: number
  testSuiteId: string
  createdAt?: string
}

export interface GeneratePlanResponse {
  testSuiteId: string
  steps: string[]        // tableau de strings retourné par Ollama
  plans: PlanTestDto[]   // documents MongoDB sauvegardés
  reused?: boolean       // indique si un plan existant a été réutilisé
}

// ── Service ──────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class TestLabService {
  private http = inject(HttpClient)

  // URL du backend Node.js
  private baseUrl = 'http://localhost:3000/api'

  // ── Générer le plan depuis .docx + URL + description ──────
  // Envoie FormData à Node.js POST /ollama/generate-plan
  // Node.js fait tout : lire docx, créer TestSuite, appeler FastAPI, sauvegarder PlanTest
  generatePlanFromDocx(formData: FormData): Observable<GeneratePlanResponse> {
    return this.http.post<GeneratePlanResponse>(
      `${this.baseUrl}/ollama/generate-plan`,
      formData
      // NE PAS mettre Content-Type manuellement
      // Angular le gère automatiquement pour FormData
    )
  }

  // ── Récupérer le plan d'une TestSuite existante ───────────
  getPlanByTestSuiteId(testSuiteId: string): Observable<{ plans: PlanTestDto[]; steps: string[] }> {
    return this.http.get<{ plans: PlanTestDto[]; steps: string[] }>(
      `${this.baseUrl}/ollama/testsuite/${testSuiteId}/plan`
    )
  }

  // ── Health check FastAPI ──────────────────────────────────
  checkHealth(): Observable<{ status: string }> {
    return this.http.get<{ status: string }>(`${this.baseUrl}/ollama/health`)
  }

  // ── Chat avec Ollama ──────────────────────────────────────
  chat(message: string): Observable<{ reply: string }> {
    return this.http.post<{ reply: string }>(
      `${this.baseUrl}/ollama/chat`,
      { message }
    )
  }
}
