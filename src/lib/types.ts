export type TaskStatus =
  | 'pendiente'
  | 'en-progreso'
  | 'cierre'
  | 'completado';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface FocusSession {
  startTime: string; // ISO 8601 string
  endTime: string;   // ISO 8601 string
}

export interface Attachment {
  name: string;
  type: string;
  size: number;
  // url: string; // This would be the URL from a storage service like Firebase Storage
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
  attachments?: Attachment[];
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string;
  phone?: string;
  authType: 'google' | 'email';
}
