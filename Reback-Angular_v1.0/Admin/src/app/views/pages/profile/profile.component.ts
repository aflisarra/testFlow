import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component } from '@angular/core'
import { ProfileInfoComponent } from './components/profile-info/profile-info.component'
import { PersonalInfoComponent } from './components/personal-info/personal-info.component'
import { ProjectsComponent } from './components/projects/projects.component'
import { ActivitiesComponent } from './components/activities/activities.component'
import { SkillComponent } from './components/skill/skill.component'
import { MessagesComponent } from './components/messages/messages.component'
import { FollowersComponent } from './components/followers/followers.component'

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    PageTitleComponent,
    ProfileInfoComponent,
    PersonalInfoComponent,
    ProjectsComponent,
    ActivitiesComponent,
    SkillComponent,
    MessagesComponent,
    FollowersComponent,
  ],
  templateUrl: './profile.component.html',
  styles: ``,
})
export class ProfileComponent {}
