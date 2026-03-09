export type ProfileType = {
  cover: string
  profile: string
  name: string
  post: string
  about: string
  skill: string[]
  link: string[]
  email: string
  phone: string
  designation: string
  age: number
  experience: number
  language: string
}

export type SkillType = {
  title: string
  progressValue: number
}

export type FollowersType = {
  profile: string
  name: string
  email: string
}

export type ProjectType = {
  icon: string
  iconColor: string
  title: string
  days: number
  file: number
  progressValue: number
  progressType: string
  team: number
  teamMebmer: string[]
}

export type MessageType = {
  profile: string
  name: string
  content: string
  time: string
}

export const ProfileInfo: ProfileType = {
  cover: 'assets/images/small/img-6.jpg',
  profile: 'assets/images/users/avatar-1.jpg',
  name: 'Jeannette C. Mullin',
  post: 'Front End Developer',
  about:
    "Hi I'm Jeannette Mullin. I am user experience and user interface designer. I have been working on Full Stack Developer since last 10 years.",
  skill: [
    'Code',
    'UX Researcher',
    'Python',
    'HTML',
    'JavaScript',
    'WordPress',
    'App Development',
    'SQL',
    'MongoDB',
  ],
  link: [
    'https://myworkbench-portfolio.com',
    'https://scaly-paddock.biz//a.portfolio',
  ],

  email: 'jeannette@rhyta.com',
  phone: '+909 707-302-2110',
  designation: 'Full Stack Developer',
  age: 31,
  experience: 10,
  language: 'English , Spanish , German , Japanese',
}

export const SkillData: SkillType[] = [
  {
    title: 'MongoDB',
    progressValue: 82,
  },
  {
    title: 'WordPress',
    progressValue: 55,
  },
  {
    title: 'UX Researcher',
    progressValue: 68,
  },
  {
    title: 'SQL',
    progressValue: 37,
  },
]

export const FollowersData: FollowersType[] = [
  {
    profile: 'assets/images/users/avatar-6.jpg',
    name: 'Hilda B. Brid',
    email: 'hildabbridges@teleworm.us',
  },
  {
    profile: 'assets/images/users/avatar-2.jpg',
    name: 'Kevin M. Bacon',
    email: 'kevinmbacon@dayrep.com',
  },
  {
    profile: 'assets/images/users/avatar-3.jpg',
    name: 'Sherrie W. Torres',
    email: 'sherriewtorres@dayrep.com',
  },
  {
    profile: 'assets/images/users/avatar-4.jpg',
    name: 'David R. Willi',
    email: 'davidrwill@teleworm.us',
  },
  {
    profile: 'assets/images/users/avatar-7.jpg',
    name: 'Daryl V. Donn',
    email: 'darylvdonnellan@teleworm.us',
  },
  {
    profile: 'assets/images/users/avatar-5.jpg',
    name: 'Risa H. Cuevas',
    email: 'risahcuevas@jourrapide.com',
  },
]

export const ProjectData: ProjectType[] = [
  {
    icon: 'iconamoon:pen-duotone',
    iconColor: 'primary',
    title: 'UI/UX Figma Design',
    days: 10,
    file: 13,
    progressValue: 59,
    progressType: 'primary',
    team: 20,
    teamMebmer: [
      'assets/images/users/avatar-4.jpg',
      'assets/images/users/avatar-5.jpg',
      'assets/images/users/avatar-3.jpg',
      'assets/images/users/avatar-6.jpg',
    ],
  },
  {
    icon: 'iconamoon:file-document-duotone',
    iconColor: 'warning',
    title: 'Multipurpose Template',
    days: 15,
    file: 8,
    progressValue: 78,
    progressType: 'warning',
    team: 12,
    teamMebmer: [
      'assets/images/users/avatar-5.jpg',
      'assets/images/users/avatar-7.jpg',
      'assets/images/users/avatar-8.jpg',
      'assets/images/users/avatar-1.jpg',
    ],
  },
]

export const MessagesData: MessageType[] = [
  {
    profile: 'assets/images/users/avatar-2.jpg',
    name: 'Kelly Winsler',
    content:
      "Hello! I just got your assignment, everything's alright, excellent of you!",
    time: '4.24 PM',
  },
  {
    profile: 'assets/images/users/avatar-3.jpg',
    name: 'Mary R. Olson',
    content: 'Hey! Okay, thank you for letting me know. See you!',
    time: '3.21 PM',
  },
  {
    profile: 'assets/images/users/avatar-4.jpg',
    name: 'Andre J. Stricker',
    content: "Hello! I just got your assignment, everything's alright, exce",
    time: '5.12 AM',
  },
  {
    profile: 'assets/images/users/avatar-5.jpg',
    name: 'Amy R. Whitaker',
    content:
      'Hello! You asked me for some extra excercises to train CO. Here you are, like I promissed.',
    time: '12.03 AM',
  },
  {
    profile: 'assets/images/users/avatar-6.jpg',
    name: 'Alice R. Owens',
    content: 'Hey! Okay, thank you for letting me know. See you!',
    time: '1.23 PM',
  },
  {
    profile: 'assets/images/users/avatar-7.jpg',
    name: 'Marcel M. McCall',
    content: 'Hey! Okay, thank you for letting me know. See you!',
    time: '8.32 AM',
  },
]
