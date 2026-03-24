import { Component } from '@angular/core'
import { MessagesData } from '../../data'
import { CommonModule } from '@angular/common'

@Component({
  selector: 'profile-messages',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './messages.component.html',
  styles: ``,
})
export class MessagesComponent {
  messageList = MessagesData
}
