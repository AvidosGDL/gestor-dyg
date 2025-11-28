export type TaskStatus =
  | 'backlog'
  | 'prospecting'
  | 'negotiation'
  | 'closing'
  | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: number;
  title: string;
  client: string;
  progress: number;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  delegateTo: string;
  description: string;
}
