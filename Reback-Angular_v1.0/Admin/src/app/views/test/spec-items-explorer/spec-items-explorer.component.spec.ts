import { ComponentFixture, TestBed } from '@angular/core/testing'
import { of, throwError } from 'rxjs'

import { TestLabService, type SpecItem } from '@/app/core/services/testlab.service'
import { SpecItemsExplorerComponent } from './spec-items-explorer.component'

describe('SpecItemsExplorerComponent', () => {
  let fixture: ComponentFixture<SpecItemsExplorerComponent>
  let component: SpecItemsExplorerComponent
  let testLabService: jasmine.SpyObj<TestLabService>

  const items: SpecItem[] = [
    {
      itemId: 'ITEM-1',
      text: 'The administrator manages user accounts',
      headingPath: ['Users', 'Administration'],
      nearestHeading: 'Administration',
      sourceChunkId: 'CHUNK-10',
      role: 'ACTOR',
      roleMethod: 'heading',
      reviewed: false,
      reviewState: 'resolved',
      requirementId: null,
    },
    {
      itemId: 'ITEM-2',
      text: 'Checkout must create a receipt',
      headingPath: ['Commerce', ' Checkout '],
      nearestHeading: 'Checkout',
      sourceChunkId: 'CHUNK-2',
      role: 'REQUIREMENT',
      roleMethod: 'regex',
      reviewed: false,
      reviewState: 'resolved',
      requirementId: 'REQ-2',
    },
    {
      itemId: 'ITEM-3',
      text: 'Ambiguous checkout evidence',
      headingPath: ['Commerce', 'Checkout'],
      nearestHeading: 'Checkout',
      sourceChunkId: 'CHUNK-2',
      role: 'UNTAGGED',
      roleMethod: 'none',
      reviewed: false,
      reviewState: 'pending',
      requirementId: null,
    },
    {
      itemId: 'ITEM-4',
      text: 'Previously dismissed evidence',
      headingPath: [],
      nearestHeading: null,
      sourceChunkId: '   ',
      role: 'UNTAGGED',
      roleMethod: 'none',
      reviewed: false,
      reviewState: 'dismissed',
      requirementId: null,
    },
  ]

  beforeEach(async () => {
    testLabService = jasmine.createSpyObj<TestLabService>('TestLabService', ['getSpecItems'])
    testLabService.getSpecItems.and.returnValue(of({
      specHash: 'hash',
      totalCount: items.length,
      items,
    }))

    await TestBed.configureTestingModule({
      imports: [SpecItemsExplorerComponent],
      providers: [{ provide: TestLabService, useValue: testLabService }],
    }).compileComponents()

    fixture = TestBed.createComponent(SpecItemsExplorerComponent)
    component = fixture.componentInstance
  })

  async function load(suiteId = 'suite-1'): Promise<void> {
    fixture.componentRef.setInput('testSuiteId', suiteId)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }

  it('loads items and renders sorted chunk, role, and heading context', async () => {
    await load()

    expect(testLabService.getSpecItems).toHaveBeenCalledOnceWith('suite-1')
    expect(component.loading).toBeFalse()
    expect(component.filteredItems).toEqual(items)
    expect(component.roles).toEqual(['ACTOR', 'REQUIREMENT', 'UNTAGGED'])
    expect(component.chunkSummaries).toEqual([
      { id: 'CHUNK-2', headingPath: 'Commerce › Checkout' },
      { id: 'CHUNK-10', headingPath: 'Users › Administration' },
    ])

    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelector('.items-count')?.textContent?.trim()).toBe('4 / 4')
    expect(Array.from(element.querySelectorAll('.chunk-button-id')).map((node) => node.textContent?.trim()))
      .toEqual(['CHUNK-2', 'CHUNK-10'])
    expect(element.textContent).toContain('Checkout must create a receipt')
    expect(element.textContent).toContain('Commerce › Checkout')
  })

  it('combines search, chunk, and role filters and clears them', async () => {
    await load()

    component.onSearch({ target: { value: 'checkout' } } as unknown as Event)
    expect(component.filteredItems.map((item) => item.itemId)).toEqual(['ITEM-2', 'ITEM-3'])

    component.toggleRole('REQUIREMENT')
    expect(component.filteredItems.map((item) => item.itemId)).toEqual(['ITEM-2'])

    component.selectChunk('CHUNK-2')
    expect(component.selectedChunkSummary).toEqual({
      id: 'CHUNK-2',
      headingPath: 'Commerce › Checkout',
    })
    expect(component.filteredItems.map((item) => item.itemId)).toEqual(['ITEM-2'])

    component.selectChunk('CHUNK-2')
    expect(component.selectedChunk).toBeNull()
    component.toggleRole('REQUIREMENT')
    expect(component.selectedRoles.size).toBe(0)

    component.clearFilters()
    expect(component.searchQuery).toBe('')
    expect(component.selectedChunk).toBeNull()
    expect(component.filteredItems).toEqual(items)
  })

  it('requests review only for pending UNTAGGED items', async () => {
    await load()
    const emitted: SpecItem[] = []
    component.reviewRequested.subscribe((item) => emitted.push(item))

    component.requestReview(items[0])
    component.requestReview(items[3])
    component.requestReview(items[2])

    expect(emitted).toEqual([items[2]])
    const element = fixture.nativeElement as HTMLElement
    const pendingButton = element.querySelector<HTMLElement>('article[data-role="UNTAGGED"] .reviewable')
    expect(pendingButton?.getAttribute('title')).toBe('Open this item in role review')
  })

  it('shows a retryable error and keeps no stale items when loading fails', async () => {
    testLabService.getSpecItems.and.returnValue(throwError(() => new Error('offline')))

    await load()

    expect(component.loading).toBeFalse()
    expect(component.items).toEqual([])
    expect(component.filteredItems).toEqual([])
    expect(component.error).toContain('Unable to load specification items')
    expect((fixture.nativeElement as HTMLElement).querySelector('.retry-button')).not.toBeNull()
  })

  it('does not request the API without a suite id', async () => {
    await component.loadItems()
    expect(testLabService.getSpecItems).not.toHaveBeenCalled()
  })
})
