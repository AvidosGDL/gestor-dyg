

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
  url: string; 
}

export interface ChangeDetail {
  field: string;
  from: any;
  to: any;
}

export interface EditLogEntry {
  date: string; // ISO 8601 string
  user: string;
  changes: ChangeDetail[];
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
  createdAt?: string; // ISO 8601 string for creation date
  editHistory?: EditLogEntry[];
}

export interface TeamMember {
  id: string;
  uid: string; // Explicitly add the user's UID
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
  uid: string;
  ownerId?: string; // UID of the team owner who invited this user
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
  value: number;
  probability: number;
}

export type MessageMediaType = 'image' | 'video' | 'audio' | 'file';

export interface Message {
  id: string;
  senderId: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: MessageMediaType;
  mediaName?: string;
  timestamp: any; // Firestore Timestamp
  readBy: string[];
}

export interface Chat {
  id: string;
  memberIds: string[];
  members: { [key: string]: { name: string; avatarUrl: string; email: string; } };
  lastMessage?: Pick<Message, 'text' | 'timestamp' | 'senderId' | 'readBy' | 'mediaType'>;
  lastMessageTimestamp?: any; // Firestore Timestamp
}

export interface InvestmentTransaction {
  id: string;
  date: string; // ISO 8601 string
  type: 'Inversión Inicial' | 'Pago de Interés' | 'Abono a Capital' | 'Devolución';
  amount: number;
  description: string;
  attachments?: Attachment[];
}

export interface Investor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  investmentDate: string; // ISO 8601 string
  investmentTerm: number;
  investmentAmount: number;
  interestRate: number;
  paymentMethod: string;
  status: 'Activa' | 'Liquidada';
  transactions?: InvestmentTransaction[];
  paymentType: 'mensual' | 'pago_unico';
  monthlyPaymentDay?: number | null;
  liquidationDate?: string | null;
}
