import { ComponentFixture, TestBed } from '@angular/core/testing'

import { FriendFeedComponent } from './friend-feed.component'

describe('FriendFeedComponent', () => {
  let component: FriendFeedComponent
  let fixture: ComponentFixture<FriendFeedComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FriendFeedComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(FriendFeedComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
