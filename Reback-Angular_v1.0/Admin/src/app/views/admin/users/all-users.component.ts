import { CommonModule } from '@angular/common'
import { Component, OnInit, inject } from '@angular/core'
import { AdminManagementService, AppUser } from '@/app/core/services/admin-management.service'

@Component({
  selector: 'app-all-users',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './all-users.component.html',
})
export class AllUsersComponent implements OnInit {
  private adminService = inject(AdminManagementService)

  users: AppUser[] = []
  loading = false
  error = ''

  ngOnInit(): void {
    this.loadUsers()
  }

  loadUsers(): void {
    this.loading = true
    this.error = ''

    this.adminService.getUsers().subscribe({
      next: (users) => {
        this.users = users
        this.loading = false
      },
      error: (err) => {
        this.error = err?.error?.message || 'Unable to load users'
        this.loading = false
      },
    })
  }
}
