export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;

export type OperationTypeValue = (typeof OperationType)[keyof typeof OperationType];

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationTypeValue;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: Array<{
      providerId?: string | null;
      email?: string | null;
    }>;
  };
}

export type MemberRole = 'elderly' | 'caretaker' | 'family';
export type TimeSlot = 'morning' | 'afternoon' | 'evening' | 'bedtime';
export type ApprovalStatus = 'approved' | 'pending_senior' | 'paused';
export type DoseStatus = 'taken' | 'missed' | 'skipped';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled';
export type CheckInMood = 'good' | 'tired' | 'unwell' | 'pain';
export type EmailAlertType =
  | 'missed_dose'
  | 'upcoming_dose'
  | 'appointment_reminder'
  | 'refill_warning'
  | 'manual_test';

export interface UserMembership {
  profileId: string;
  seniorName: string;
  careCode: string;
  role: MemberRole;
  joinedAt: unknown;
}

export interface CareProfile {
  profileId: string;
  ownerId: string;
  seniorName: string;
  age: number;
  careCode: string;
  passcodeVerifier: string;
  passcodeSalt: string;
  requireSeniorApproval: boolean;
  bloodType: string;
  allergies: string;
  conditions: string;
  doctorName: string;
  doctorEmail: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  preferredView: 'senior' | 'caregiver';
  createdAt: unknown;
  updatedAt: unknown;
}

export interface CareMember {
  uid: string;
  profileId: string;
  displayName: string;
  relationship: string;
  role: MemberRole;
  canEditSchedule: boolean;
  alertEmail: string;
  notifyMissedDose: boolean;
  notifyUpcomingDose: boolean;
  notifyAppointments: boolean;
  status: 'active' | 'paused';
  passToken: string;
  joinedAt: unknown;
  updatedAt: unknown;
}

export interface Medication {
  id: string;
  profileId: string;
  name: string;
  dosage: string;
  frequency: string;
  timeSlot: TimeSlot;
  scheduledTime: string;
  instructions: string;
  purpose: string;
  prescriber: string;
  pillColor: string;
  pillsRemaining: number;
  refillThreshold: number;
  approvalStatus: ApprovalStatus;
  proposedByUid: string;
  proposedByName: string;
  aiSummary: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface DoseLog {
  id: string;
  profileId: string;
  medicationId: string;
  medicationName: string;
  dosage: string;
  dateKey: string;
  scheduledTime: string;
  status: DoseStatus;
  note: string;
  loggedByUid: string;
  loggedByName: string;
  loggedAt: unknown;
}

export interface Appointment {
  id: string;
  profileId: string;
  title: string;
  doctorName: string;
  specialty: string;
  location: string;
  appointmentDate: string;
  appointmentTime: string;
  notes: string;
  status: AppointmentStatus;
  prepBrief: string;
  reminder24hSent: boolean;
  reminder2hSent: boolean;
  createdByUid: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface CheckIn {
  id: string;
  profileId: string;
  mood: CheckInMood;
  energyLevel: number;
  note: string;
  authorUid: string;
  authorName: string;
  createdAt: unknown;
}

export interface EmailLog {
  id: string;
  profileId: string;
  alertKey: string;
  type: EmailAlertType;
  recipients: string[];
  subject: string;
  bodyPreview: string;
  deliveryMode: 'smtp_sent' | 'outbox_queued';
  status: 'sent' | 'logged' | 'failed';
  triggeredByUid: string;
  sentAt: unknown;
}

export interface MedicationInsights {
  overallSafetyNote: string;
  routineOptimizationTip: string;
  interactionAlerts: Array<{
    severity: string;
    title: string;
    guidance: string;
  }>;
  plainLanguageGuides: Array<{
    medicationName: string;
    plainSummary: string;
  }>;
}
