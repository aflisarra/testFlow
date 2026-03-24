import { ComponentFixture, TestBed } from '@angular/core/testing'

import { SessionbycountyComponent } from './sessionbycounty.component'

describe('SessionbycountyComponent', () => {
  let component: SessionbycountyComponent
  let fixture: ComponentFixture<SessionbycountyComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SessionbycountyComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(SessionbycountyComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
