import { TestLabService, type SpecItem } from '@/app/core/services/testlab.service'
import { CommonModule } from '@angular/common'
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core'
import { firstValueFrom } from 'rxjs'

interface ChunkSummary {
  id: string
  headingPath: string | null
}

@Component({
  selector: 'app-spec-items-explorer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './spec-items-explorer.component.html',
  styleUrl: './spec-items-explorer.component.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SpecItemsExplorerComponent implements OnChanges {
  private testLabService = inject(TestLabService)

  @Input({ required: true }) testSuiteId = ''
  @Output() reviewRequested = new EventEmitter<SpecItem>()

  loading = false
  error = ''
  items: SpecItem[] = []
  filteredItems: SpecItem[] = []
  chunkSummaries: ChunkSummary[] = []
  roles: string[] = []
  selectedChunk: string | null = null
  selectedRoles = new Set<string>()
  searchQuery = ''

  get selectedChunkSummary(): ChunkSummary | null {
    return this.chunkSummaries.find((chunk) => chunk.id === this.selectedChunk) ?? null
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['testSuiteId']) void this.loadItems()
  }

  async loadItems(): Promise<void> {
    if (!this.testSuiteId) return

    this.loading = true
    this.error = ''
    try {
      const response = await firstValueFrom(this.testLabService.getSpecItems(this.testSuiteId))
      this.items = Array.isArray(response?.items) ? response.items : []
      this.chunkSummaries = this.buildChunkSummaries(this.items)
      this.roles = [...new Set(this.items.map((item) => item.role).filter(Boolean))].sort()
      this.applyFilters()
    } catch {
      this.items = []
      this.filteredItems = []
      this.error = 'Unable to load specification items. Confirm that the backend was restarted after adding the spec-items route.'
    } finally {
      this.loading = false
    }
  }

  onSearch(event: Event): void {
    this.searchQuery = (event.target as HTMLInputElement).value
    this.applyFilters()
  }

  selectChunk(chunk: string | null): void {
    this.selectedChunk = this.selectedChunk === chunk ? null : chunk
    this.applyFilters()
  }

  toggleRole(role: string): void {
    if (this.selectedRoles.has(role)) this.selectedRoles.delete(role)
    else this.selectedRoles.add(role)
    this.applyFilters()
  }

  clearFilters(): void {
    this.searchQuery = ''
    this.selectedChunk = null
    this.selectedRoles.clear()
    this.applyFilters()
  }

  requestReview(item: SpecItem): void {
    if (item.role === 'UNTAGGED' && item.reviewState === 'pending') {
      this.reviewRequested.emit(item)
    }
  }

  private applyFilters(): void {
    const query = this.searchQuery.trim().toLowerCase()
    this.filteredItems = this.items.filter((item) => {
      if (this.selectedChunk && item.sourceChunkId !== this.selectedChunk) return false
      if (this.selectedRoles.size && !this.selectedRoles.has(item.role)) return false
      if (!query) return true

      const searchable = [item.text, ...item.headingPath, item.sourceChunkId, item.role]
        .join(' ')
        .toLowerCase()
      return searchable.includes(query)
    })
  }

  private buildChunkSummaries(items: SpecItem[]): ChunkSummary[] {
    const chunks = new Map<string, ChunkSummary>()

    for (const item of items) {
      const chunkId = item.sourceChunkId.trim()
      if (!chunkId || chunks.has(chunkId)) continue

      const headingPath = item.headingPath
        .map((heading) => heading.trim())
        .filter(Boolean)
        .join(' › ')
      chunks.set(chunkId, { id: chunkId, headingPath: headingPath || null })
    }

    return [...chunks.values()]
      .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }))
  }
}
