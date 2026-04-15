export type ServiceType = {
  icon: string
  iconColor: string
  title: string
  description: string
}

export type TeamType = {
  profile: string
  name: string
  email: string
}

export const ServiceData: ServiceType[] = [
  {
    icon: 'bxl-react',
    iconColor: 'bg-primary',
    title: 'Creative React Bootstrap Admin',
    description:
      'Introducing our Creative React Bootstrap Admin, a dynamic solution merging versatility with sleek design. Unlock seamless management and intuitive user experiences with our innovative toolkit.',
  },
  {
    icon: 'bxl-bootstrap',
    iconColor: 'bg-purple',
    title: 'Bootstrap Saas Admin',
    description:
      "Introducing our Bootstrap SaaS Admin, a cutting-edge platform tailored for streamlined management. Harness the power of Bootstrap's robust framework infused with SaaS capabilities for scalable solutions.",
  },
  {
    icon: 'bxl-vuejs',
    iconColor: 'bg-cyan',
    title: 'VueJS Client Project',
    description:
      'Introducing our VueJS Client Project, a dynamic and responsive web application powered by Vue.js. Seamlessly blending functionality with elegance, this project delivers an immersive user experience.',
  },
  {
    icon: 'bxl-html5',
    iconColor: 'bg-danger',
    title: 'Pure Html Css Landing',
    description:
      'Introducing our Pure HTML CSS Landing, a minimalist yet impactful landing page solution. Crafted with precision using HTML and CSS, it embodies simplicity and elegance.',
  },
  {
    icon: 'bxl-nodejs',
    iconColor: 'bg-green',
    title: 'Nodejs Backend Project',
    description:
      'Introducing our Node.js Backend Project, a robust and scalable solution for powering your applications. Leveraging the power of Node.js, we deliver efficient and high-performance backend systems.',
  },
]

export const TeamData: TeamType[] = [
  {
    profile: 'assets/images/users/avatar-1.jpg',
    name: 'Willie T. Anderson',
    email: 'willieandr@armyspy.com',
  },
  {
    profile: 'assets/images/users/avatar-2.jpg',
    name: 'Harold J. Hurley',
    email: 'haroldlhurly@armyspy.com',
  },
  {
    profile: 'assets/images/users/avatar-3.jpg',
    name: 'Harold Hurley',
    email: 'snadraaimon@armyspy.com',
  },
  {
    profile: 'assets/images/users/avatar-4.jpg',
    name: 'Richard Lewis',
    email: 'richaaedllewis@armyspy.com',
  },
]
