export type TaskStatus =
  | 'pendiente'
  | 'en-progreso'
  | 'cierre'
  | 'completado';
export type TaskPriority = 'low' | 'medium' | 'high';
export type DelegationStatus = 'pending' | 'accepted' | 'rejected' | null;

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
  delegateToId: string | null;
  delegateToEmail: string | null;
  delegatedByName: string | null;
  delegationStatus: DelegationStatus;
  ownerId: string;
  description: string;
  value: number;
  probability: number;
  focusSessions?: FocusSession[];
  completionComment?: string;
  attachments?: Attachment[];
  notificationDismissed?: boolean;
  updatedAt?: string; // ISO 8601 string for the last update time
  lastOwnerUpdateTimestamp?: string; // ISO 8601 string for when the owner last interacted
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

export interface UserProfile {
  name: string;
  email: string;
  avatarUrl: string;
  role: string;
  phone?: string;
}

export interface ContactLogEntry {
  date: string; // ISO 8601 string
  notes: string;
}

export interface Prospect {
  id: string;
  name: string;
  phone: string;
  email: string;
  businessDescription: string;
  nextContactDate?: string; // ISO 8601 date string (YYYY-MM-DD)
  contactLog?: ContactLogEntry[];
}
