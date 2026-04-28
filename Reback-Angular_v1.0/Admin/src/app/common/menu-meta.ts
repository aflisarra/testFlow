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


  //project management 
  {
    key: 'Project Management',
    icon: 'iconamoon:folder-duotone',
    label: 'Project Management',
    collapsed: true,
    subMenu: [
      {
        key: 'project',
        label: 'Project',
        link: '/project',
        parentKey: 'project',
      }
    ]
  },

  {
    key: 'test',
    icon: 'iconamoon:file-check-duotone',
    label: 'Test',
    collapsed: true,
    subMenu: [
      {
        key: 'test-plan',
        label: 'Test plan',
        link: '/test',
        parentKey: 'test',
      },
      {
        key: 'test-cases',
        label: 'Test case',
        link: '/test-cases',
        parentKey: 'test',
      },
      {
        key: 'test-suites',
        label: 'List of Tests',
        link: '/test-suites',
        parentKey: 'test',
      },

    ],
  },

    {
    key: 'execution',
    icon: 'iconamoon:home-duotone',
    label: 'Execution',
    collapsed: false,
    subMenu: [
      {
        key: 'Execution-analytics',
        label: 'Analytics',
        link: '/execution/Execution-Management',
        parentKey: 'execution',
      },

    ],
  },

]
