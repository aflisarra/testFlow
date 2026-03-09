export type MenuItem = {
  key?: string
  label?: string
  icon?: string
  link?: string
  collapsed?: boolean
  subMenu?: any
  isTitle?: boolean
  badge?: any
  parentKey?: string
  disabled?: boolean
}

export const MENU: MenuItem[] = [
  {
    key: 'general',
    label: 'GENERAL',
    isTitle: true,
  },
  {
    key: 'dashboards',
    icon: 'iconamoon:home-duotone',
    label: 'Dashboards',
    collapsed: false,
    subMenu: [
      {
        key: 'dashboard-analytics',
        label: 'Analytics',
        link: '/dashboard/analytics',
        parentKey: 'dashboards',
      },
     
    ],
  },
  {
    key: 'users',
    icon: 'iconamoon:profile-circle-duotone',
    label: 'Users',
    collapsed: true,
    subMenu: [
      {
        key: 'users-all-users',
        label: 'All Users',
        link: '/admin/users',
        parentKey: 'users',
      },
      {
        key: 'users-invite-user',
        label: 'Invite User',
        link: '/admin/users/invite',
        parentKey: 'users',
      },
      {
        key: 'users-manage-role',
        label: 'Manage Role',
        link: '/admin/roles',
        parentKey: 'users',
      },
    ],
  },
  {
    key: 'auth',
    icon: 'iconamoon:lock-duotone',
    label: 'Auth',
    collapsed: true,
    subMenu: [
      {
        key: 'auth-sign-up',
        label: 'Sign Up',
        link: '/auth/sign-up',
        parentKey: 'auth',
      },
    ],
  },
 
 
]
