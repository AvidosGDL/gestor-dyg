export type TaskStatus =
  | 'pendiente'
  | 'en-progreso'
  | 'cierre'
  | 'completado';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface FocusSession {
  date: string; // ISO 8601 string
  duration: number; // in minutes
}

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
  focusSessions?: FocusSession[];
  completionComment?: string;
  evidenceUrls?: string[];
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string;
  phone?: string;
}
