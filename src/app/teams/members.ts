export interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: string;
    avatarUrl: string;
  }
  
  export const initialMembers: TeamMember[] = [
    {
      id: '1',
      name: 'Daniela',
      email: 'daniela@example.com',
      role: 'Project Manager',
      avatarUrl: 'https://i.pravatar.cc/150?u=daniela@example.com',
    },
    {
      id: '2',
      name: 'Carlos',
      email: 'carlos@example.com',
      role: 'Frontend Developer',
      avatarUrl: 'https://i.pravatar.cc/150?u=carlos@example.com',
    },
    {
      id: '3',
      name: 'Ana',
      email: 'ana@example.com',
      role: 'UI/UX Designer',
      avatarUrl: 'https://i.pravatar.cc/150?u=ana@example.com',
    },
  ];
  