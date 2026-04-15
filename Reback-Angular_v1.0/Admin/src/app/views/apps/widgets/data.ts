import { currentYear } from '@/app/common/constants'

export type ProjectType = {
  project: string
  client: string
  team: string[]
  deadline: string
  progressValue: number
  progressType: string
}

export type ScheduleType = {
  time: string
  title: string
  type: string
  duration: string
}

export type StateType = {
  icon: string
  iconColor: string
  title: string
  amount: string
  badge: string
  badgeColor: string
}

export const RecentProject: ProjectType[] = [
  {
    project: 'Zelogy',
    client: 'Daniel Olsen',
    team: [
      'assets/images/users/avatar-2.jpg',
      'assets/images/users/avatar-3.jpg',
      'assets/images/users/avatar-4.jpg',
    ],
    deadline: '12 April ' + currentYear,
    progressValue: 33,
    progressType: 'primary',
  },
  {
    project: 'Shiaz',
    client: 'Jack Roldan',
    team: [
      'assets/images/users/avatar-1.jpg',
      'assets/images/users/avatar-5.jpg',
    ],
    deadline: '10 April ' + currentYear,
    progressValue: 74,
    progressType: 'success',
  },
  {
    project: 'Holderick',
    client: 'Betty Cox',
    team: [
      'assets/images/users/avatar-5.jpg',
      'assets/images/users/avatar-2.jpg',
      'assets/images/users/avatar-3.jpg',
    ],
    deadline: '31 March ' + currentYear,
    progressValue: 50,
    progressType: 'warning',
  },
  {
    project: 'Feyvux',
    client: 'Carlos Johnson',
    team: [
      'assets/images/users/avatar-3.jpg',
      'assets/images/users/avatar-7.jpg',
      'assets/images/users/avatar-6.jpg',
    ],
    deadline: '25 March ' + currentYear,
    progressValue: 92,
    progressType: 'primary',
  },
  {
    project: 'Xavlox',
    client: 'Lorraine Cox',
    team: ['assets/images/users/avatar-7.jpg'],
    deadline: '22 March ' + currentYear,
    progressValue: 48,
    progressType: 'danger',
  },
  {
    project: 'Mozacav',
    client: 'Delores Young',
    team: [
      'assets/images/users/avatar-3.jpg',
      'assets/images/users/avatar-4.jpg',
      'assets/images/users/avatar-2.jpg',
    ],
    deadline: '15 March ' + currentYear,
    progressValue: 21,
    progressType: 'primary',
  },
]

export const ScheduleData: ScheduleType[] = [
  {
    time: '09:00',
    title: 'Setup Github Repository',
    type: 'primary',
    duration: '09:00 - 10:00',
  },
  {
    time: '10:00',
    title: 'Design Review - Reback Admin',
    type: 'success',
    duration: '10:00 - 10:30',
  },
  {
    time: '11:00',
    title: 'Meeting with BD Team',
    type: 'info',
    duration: '11:00 - 12:30',
  },
  {
    time: '01:00',
    title: 'Meeting with Design Studio',
    type: 'warning',
    duration: '01:00 - 02:00',
  },
]

export const State2Data: StateType[] = [
  {
    icon: 'bx-layer',
    iconColor: 'primary',
    title: 'Campaign Sent',
    amount: '13, 647',
    badge: '2.3',
    badgeColor: 'success',
  },
  {
    icon: 'bx-award',
    iconColor: 'success',
    title: 'New Leads',
    amount: '9, 526',
    badge: '8.1',
    badgeColor: 'success',
  },
  {
    icon: 'bxs-backpack',
    iconColor: 'danger',
    title: 'Deals',
    amount: '976',
    badge: '0.3',
    badgeColor: 'danger',
  },
  {
    icon: 'bx-dollar-circle',
    iconColor: 'warning',
    title: 'Booked Revenue',
    amount: '$123',
    badge: '10.6',
    badgeColor: 'danger',
  },
]
