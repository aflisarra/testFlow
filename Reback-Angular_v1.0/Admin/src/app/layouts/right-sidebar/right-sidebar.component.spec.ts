import { ComponentFixture, TestBed } from '@angular/core/testing'
import { appTestProviders } from '@/testing/app-test-providers'

import { RightSidebarComponent } from './right-sidebar.component'

describe('RightSidebarComponent', () => {
  let component: RightSidebarComponent
  let fixture: ComponentFixture<RightSidebarComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RightSidebarComponent],
      providers: appTestProviders(),
    }).compileComponents()

    fixture = TestBed.createComponent(RightSidebarComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
