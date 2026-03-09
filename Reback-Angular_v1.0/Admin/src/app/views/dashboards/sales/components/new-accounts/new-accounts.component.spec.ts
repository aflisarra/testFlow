import { ComponentFixture, TestBed } from '@angular/core/testing'

import { NewAccountsComponent } from './new-accounts.component'

describe('NewAccountsComponent', () => {
  let component: NewAccountsComponent
  let fixture: ComponentFixture<NewAccountsComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewAccountsComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(NewAccountsComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
