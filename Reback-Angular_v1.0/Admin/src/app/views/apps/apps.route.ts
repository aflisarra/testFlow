import { Route } from '@angular/router'
import { ChatComponent } from './chat/chat.component'
import { ContactsComponent } from './contacts/contacts.component'
import { EmailComponent } from './email/email.component'
import { SocialComponent } from './social/social.component'
import { TodoComponent } from './todo/todo.component'

export const APPS_ROUTES: Route[] = [
  {
    path: 'chat',
    component: ChatComponent,
    data: { title: 'Chat' },
  },
  {
    path: 'email',
    component: EmailComponent,
    data: { title: 'Email' },
  },
  {
    path: 'todo',
    component: TodoComponent,
    data: { title: 'To do' },
  },
  {
    path: 'social',
    component: SocialComponent,
    data: { title: 'Social' },
  },
  {
    path: 'contacts',
    component: ContactsComponent,
    data: { title: 'Contacts' },
  },
]
