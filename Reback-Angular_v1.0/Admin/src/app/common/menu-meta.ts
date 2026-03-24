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
        key: 'users-manage-role',
        label: 'Manage Role',
        link: '/admin/roles',
        parentKey: 'users',
      },
      {
        key: 'users-all-users',
        label: 'Manage Users',
        link: '/admin/users',
        parentKey: 'users',
      },


    ],

  },
  {
    key: 'test',
    icon: 'iconamoon:file-check-duotone',
    label: 'Test',
    collapsed: true,
    subMenu: [
      {
        key: 'test-suite',
        label: 'Test Suite',
        link: '/test',
        parentKey: 'test',
      },

      {
        key: 'historique',
        label: 'historique',
        link: '/admin/users/invite',
        parentKey: 'test',
      },
    ],
  },



]
