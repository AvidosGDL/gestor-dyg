export type TaskStatus =
  | 'backlog'
  | 'prospecting'
  | 'negotiation'
  | 'closing'
  | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string; // Changed from number to string for Firestore compatibility
  title: string;
  client: string;
  progress: number;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  delegateTo: string;
  description: string;
  value: number;
  probability: number;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string;
}
