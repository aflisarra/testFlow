import { DOCUMENT } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { ActivatedRoute, Router } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { provideMockStore } from '@ngrx/store/testing'
import { ToastrService } from 'ngx-toastr'
import { BehaviorSubject, of, Subject, throwError } from 'rxjs'

import { AdminManagementService } from '@/app/core/services/admin-management.service'
import { AuthenticationService } from '@/app/core/services/auth.service'
import { ProjectsRefreshService } from '@/app/core/services/projects-refresh.service'
import { ProjectsStateService } from '@/app/core/services/projects-state.service'
import {
  TestLabService,
  type RoleReviewItem,
  type TestPlanDto,
} from '@/app/core/services/testlab.service'
import type { AppProject } from '@/app/interfaces/admin-management.interface'
import { TestSuiteConfigurationComponent } from './test-plan.component'

describe('TestSuiteConfigurationComponent owned specification-review flow', () => {
  let fixture: ComponentFixture<TestSuiteConfigurationComponent>
  let component: TestSuiteConfigurationComponent
  let testLabService: jasmine.SpyObj<TestLabService>
  let toastr: jasmine.SpyObj<ToastrService>
  let document: Document

  const reviewItems: RoleReviewItem[] = [
    {
      itemId: 'ITEM-1',
      text: 'The customer completes checkout',
      headingPath: ['Commerce', 'Checkout'],
      nearestHeading: 'Checkout',
      suggestedRole: null,
    },
    {
      itemId: 'ITEM-2',
      text: 'An administrator can suspend an account',
      headingPath: ['Users', 'Administration'],
      nearestHeading: 'Administration',
      suggestedRole: 'ACTOR',
    },
  ]

  const projects: AppProject[] = [{
    _id: 'project-1',
    title: 'Checkout project',
  } as AppProject]

  beforeEach(async () => {
    testLabService = jasmine.createSpyObj<TestLabService>('TestLabService', [
      'dismissRoleReview',
      'generateStoredPlan',
      'getRoleReviews',
      'getSpecItems',
      'ingestSpecification',
      'resolveRoleReview',
    ])
    testLabService.getRoleReviews.and.returnValue(of({
      specHash: 'hash',
      pendingCount: reviewItems.length,
      items: reviewItems,
    }))
    testLabService.getSpecItems.and.returnValue(of({
      specHash: 'hash',
      totalCount: 0,
      items: [],
    }))
    testLabService.dismissRoleReview.and.returnValue(of(void 0))
    testLabService.ingestSpecification.and.returnValue(of({
      testSuiteId: 'suite-1',
      pendingReviewCount: reviewItems.length,
    }))

    toastr = jasmine.createSpyObj<ToastrService>('ToastrService', [
      'error',
      'success',
      'warning',
    ])

    const projectState = {
      projects$: new BehaviorSubject<AppProject[]>(projects),
      refresh: jasmine.createSpy('refresh').and.resolveTo(),
    }
    const projectRefresh = { changes$: new Subject<void>() }

    await TestBed.configureTestingModule({
      imports: [TestSuiteConfigurationComponent],
      providers: [
        provideMockStore(),
        { provide: TestLabService, useValue: testLabService },
        { provide: ToastrService, useValue: toastr },
        { provide: ProjectsStateService, useValue: projectState },
        { provide: ProjectsRefreshService, useValue: projectRefresh },
        { provide: AuthenticationService, useValue: { session: null } },
        { provide: AdminManagementService, useValue: {} },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate').and.resolveTo(true) } },
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } },
        { provide: NgbModal, useValue: { open: jasmine.createSpy('open') } },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(TestSuiteConfigurationComponent)
    component = fixture.componentInstance
    document = TestBed.inject(DOCUMENT)
    fixture.detectChanges()
    await fixture.whenStable()
  })

  it('opens the queue, initializes selections, and renders heading context', async () => {
    component.currentTestSuiteId = 'suite-1'
    component.specificationUploaded = true

    await component.toggleRoleReview()
    fixture.detectChanges()

    expect(testLabService.getRoleReviews).toHaveBeenCalledOnceWith('suite-1')
    expect(component.roleReviewOpen).toBeTrue()
    expect(component.roleReviewItems).toEqual(reviewItems)
    expect(component.roleReviewSelections).toEqual({ 'ITEM-1': '', 'ITEM-2': '' })
    expect(component.pendingRoleReviewCount).toBe(2)
    expect(component.roleReviewLoading).toBeFalse()

    const panel = (fixture.nativeElement as HTMLElement).querySelector('#roleReviewPanel')
    expect(panel?.textContent).toContain('Commerce › Checkout')
    expect(panel?.textContent).toContain('Nearest heading: Checkout')
    expect(panel?.textContent).not.toContain('Suggested role: null')
    expect(panel?.textContent).toContain('Suggested role: ACTOR')

    await component.toggleRoleReview()
    expect(component.roleReviewOpen).toBeFalse()
    expect(testLabService.getRoleReviews).toHaveBeenCalledTimes(1)
  })

  it('renders the inline recovery banner for a legacy suite 409', async () => {
    testLabService.getRoleReviews.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 409,
      error: { code: 'SPEC_NOT_INGESTED' },
    })))
    component.currentTestSuiteId = 'legacy-suite'
    component.specificationUploaded = true

    await component.toggleRoleReview()
    fixture.detectChanges()

    expect(component.roleReviewLegacySuite).toBeTrue()
    expect(component.roleReviewItems).toEqual([])
    expect(component.pendingRoleReviewCount).toBe(0)
    expect(component.roleReviewError).toBe('')
    expect(toastr.error).not.toHaveBeenCalled()
    const banner = (fixture.nativeElement as HTMLElement).querySelector('.role-review-legacy-banner')
    expect(banner?.textContent).toContain('This test suite was generated before role tagging was introduced.')
    expect(banner?.textContent).toContain('Re-upload the original specification to enable review.')
    expect(banner?.querySelector('button')).not.toBeNull()
  })

  it('accepts only supported role selections', () => {
    component.onRoleReviewSelection('ITEM-1', {
      target: { value: 'REQUIREMENT' },
    } as unknown as Event)
    expect(component.roleReviewSelections['ITEM-1']).toBe('REQUIREMENT')

    component.onRoleReviewSelection('ITEM-1', {
      target: { value: 'UNTAGGED' },
    } as unknown as Event)
    expect(component.roleReviewSelections['ITEM-1']).toBe('')
  })

  it('applies a role and refreshes the visible queue state and badge', async () => {
    component.currentTestSuiteId = 'suite-1'
    component.roleReviewItems = [...reviewItems]
    component.roleReviewSelections = { 'ITEM-1': 'REQUIREMENT', 'ITEM-2': '' }
    component.pendingRoleReviewCount = 2
    testLabService.resolveRoleReview.and.returnValue(of({
      item: {
        ...reviewItems[0],
        role: 'REQUIREMENT',
        roleMethod: 'human',
        reviewed: true,
        reviewState: 'resolved',
      },
      pendingCount: 1,
    }))

    await component.resolveRoleReview(reviewItems[0])

    expect(testLabService.resolveRoleReview)
      .toHaveBeenCalledOnceWith('suite-1', 'ITEM-1', 'REQUIREMENT')
    expect(component.roleReviewItems).toEqual([reviewItems[1]])
    expect(component.roleReviewSelections['ITEM-1']).toBeUndefined()
    expect(component.pendingRoleReviewCount).toBe(1)
    expect(component.roleReviewBusyItemId).toBe('')
    expect(toastr.success).toHaveBeenCalledWith(
      'Role saved for this specification item.',
      'Specification review',
    )
  })

  it('keeps an item visible and notifies when applying a role fails', async () => {
    component.currentTestSuiteId = 'suite-1'
    component.roleReviewItems = [...reviewItems]
    component.roleReviewSelections = { 'ITEM-1': 'ACTOR' }
    testLabService.resolveRoleReview.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 500,
      error: { message: 'Review could not be saved' },
    })))

    await component.resolveRoleReview(reviewItems[0])

    expect(component.roleReviewItems).toEqual(reviewItems)
    expect(component.roleReviewSelections['ITEM-1']).toBe('ACTOR')
    expect(component.roleReviewError).toBe('Review could not be saved')
    expect(component.roleReviewBusyItemId).toBe('')
    expect(toastr.error).toHaveBeenCalledWith('Review could not be saved', 'Specification review')
  })

  it('requires dismissal confirmation and removes the item only after success', async () => {
    component.currentTestSuiteId = 'suite-1'
    component.roleReviewItems = [...reviewItems]
    component.roleReviewSelections = { 'ITEM-1': '', 'ITEM-2': '' }
    component.pendingRoleReviewCount = 2
    const confirm = spyOn(window, 'confirm').and.returnValue(false)

    await component.dismissRoleReview(reviewItems[0])
    expect(testLabService.dismissRoleReview).not.toHaveBeenCalled()
    expect(component.roleReviewItems).toEqual(reviewItems)

    confirm.and.returnValue(true)
    await component.dismissRoleReview(reviewItems[0])

    expect(testLabService.dismissRoleReview).toHaveBeenCalledOnceWith('suite-1', 'ITEM-1')
    expect(component.roleReviewItems).toEqual([reviewItems[1]])
    expect(component.pendingRoleReviewCount).toBe(1)
    expect(component.roleReviewBusyItemId).toBe('')
    expect(toastr.success).toHaveBeenCalledWith(
      'Item dismissed from the review queue.',
      'Specification review',
    )
  })

  it('uploads a specification, opens review, and switches to its item evidence', async () => {
    const file = new File(['docx'], 'checkout.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    component.projects = projects
    component.testPlanForm.setValue({
      name: 'Checkout validation',
      specDocument: file.name,
      projectId: 'project-1',
      applicationUrl: 'example.com',
    })
    component.selectedFile = file

    await component.onUploadSpecification()

    expect(testLabService.ingestSpecification).toHaveBeenCalledTimes(1)
    const sentForm = testLabService.ingestSpecification.calls.mostRecent().args[0]
    expect(sentForm.get('file')).toBe(file)
    expect(sentForm.get('projectId')).toBe('project-1')
    expect(sentForm.get('nametest')).toBe('Checkout validation')
    expect(component.currentTestSuiteId).toBe('suite-1')
    expect(component.specificationUploaded).toBeTrue()
    expect(component.uploadingSpecification).toBeFalse()
    expect(component.activeResultTab).toBe('items')
    expect(component.roleReviewOpen).toBeTrue()
    expect(component.roleReviewItems).toEqual(reviewItems)
    expect(toastr.success).toHaveBeenCalledWith(
      'Specification uploaded and ready for role review.',
      'Specification upload',
    )
  })

  it('blocks an incomplete upload without calling the API', async () => {
    await component.onUploadSpecification()

    expect(testLabService.ingestSpecification).not.toHaveBeenCalled()
    expect(toastr.warning).toHaveBeenCalledWith(
      'Choose a DOCX file and complete the required fields first.',
      'Specification upload',
    )
  })

  it('generates stored plans only after upload and records pending-review metadata', async () => {
    const plans: TestPlanDto[] = [{
      id: 'TP-1',
      title: 'Checkout',
      description: 'Checkout scenarios',
    }]
    testLabService.generateStoredPlan.and.returnValue(of({
      testSuiteId: 'suite-1',
      pendingReviewCount: 3,
      testPlans: plans,
    }))
    component.projects = projects
    component.testPlanForm.setValue({
      name: 'Checkout validation',
      specDocument: 'checkout.docx',
      projectId: 'project-1',
      applicationUrl: 'example.com',
    })
    component.specificationUploaded = true
    component.currentTestSuiteId = 'suite-1'

    component.onGeneratePlan()
    await fixture.whenStable()

    expect(testLabService.generateStoredPlan).toHaveBeenCalledOnceWith('suite-1', {
      styleConfig: '',
      urlCible: 'example.com',
      nametest: 'Checkout validation',
      regenerate: false,
    })
    expect(component.testPlans).toEqual(plans)
    expect(component.planStatuses).toEqual({ 'TP-1': 'pending' })
    expect(component.pendingRoleReviewCount).toBe(3)
    expect(component.generatingPlans).toBeFalse()
    expect(component.activeResultTab).toBe('plans')
  })

  it('opens review from the explorer and scrolls the panel into view', async () => {
    component.currentTestSuiteId = 'suite-1'
    component.specificationUploaded = true
    fixture.detectChanges()
    const panel = document.getElementById('roleReviewPanel')
    expect(panel).not.toBeNull()
    const scrollIntoView = jasmine.createSpy('scrollIntoView')
    Object.defineProperty(panel, 'scrollIntoView', { value: scrollIntoView })

    await component.openRoleReviewFromExplorer()

    expect(component.roleReviewOpen).toBeTrue()
    expect(testLabService.getRoleReviews).toHaveBeenCalledWith('suite-1')
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
  })

  it('does nothing when resolving or dismissing without the required state', async () => {
    component.roleReviewSelections = { 'ITEM-1': '' }
    await component.resolveRoleReview(reviewItems[0])
    await component.dismissRoleReview(reviewItems[0])

    expect(testLabService.resolveRoleReview).not.toHaveBeenCalled()
    expect(testLabService.dismissRoleReview).not.toHaveBeenCalled()
  })

})
