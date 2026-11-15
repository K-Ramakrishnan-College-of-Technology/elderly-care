import { auth } from './firebase';
import type { EmailAlertType, MedicationInsights, TimeSlot } from '../types/kincare';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to perform this action.');
  }
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Unexpected response from ${url} (status ${res.status}).`);
  }
  const data = (await res.json()) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export async function fetchServerHealth(): Promise<{ ok: boolean; smtpConfigured: boolean }> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    return { ok: false, smtpConfigured: false };
  }
  return (await res.json()) as { ok: boolean; smtpConfigured: boolean };
}

export async function requestMedicationInsights(payload: {
  seniorName: string;
  age: number;
  allergies: string;
  conditions: string;
  medications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    scheduledTime: string;
    instructions: string;
  }>;
}): Promise<MedicationInsights> {
  const data = await postJson<{ insights: MedicationInsights }>('/api/ai/medication-insights', payload);
  return data.insights;
}

export async function parsePrescriptionLabel(payload: {
  labelText?: string;
  imageBase64?: string;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
}): Promise<{
  name: string;
  dosage: string;
  frequency: string;
  timeSlot: TimeSlot;
  scheduledTime: string;
  instructions: string;
  purpose: string;
  prescriber: string;
  pillsRemaining: number;
}> {
  const data = await postJson<{
    extracted: {
      name: string;
      dosage: string;
      frequency: string;
      timeSlot: TimeSlot;
      scheduledTime: string;
      instructions: string;
      purpose: string;
      prescriber: string;
      pillsRemaining: number;
    };
  }>('/api/ai/parse-prescription', payload);
  return data.extracted;
}

export async function generateAppointmentPrepBrief(payload: {
  seniorName: string;
  age: number;
  allergies: string;
  conditions: string;
  appointment: {
    title: string;
    doctorName: string;
    specialty: string;
    appointmentDate: string;
    appointmentTime: string;
    notes: string;
  };
  medications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    pillsRemaining: number;
  }>;
  adherenceSummary: {
    takenCount: number;
    missedCount: number;
    skippedCount: number;
    missedMedNames: string[];
  };
  recentCheckIns: Array<{
    mood: string;
    energyLevel: number;
    note: string;
  }>;
}): Promise<string> {
  const data = await postJson<{ prepBrief: string }>('/api/ai/appointment-brief', payload);
  return data.prepBrief;
}

export async function generateDailyCareDigest(payload: {
  seniorName: string;
  dateLabel: string;
  pendingCount: number;
  takenCount: number;
  missedCount: number;
  lowRefillMeds: string[];
  upcomingAppointments: string[];
  latestMood: string;
}): Promise<string> {
  const data = await postJson<{ digest: string }>('/api/ai/daily-digest', payload);
  return data.digest;
}

export async function dispatchProactiveEmail(payload: {
  seniorName: string;
  careCode: string;
  type: EmailAlertType;
  subject: string;
  messageText: string;
  recipients: string[];
}): Promise<{
  deliveryMode: 'smtp_sent' | 'outbox_queued';
  status: 'sent' | 'logged' | 'failed';
  messageId: string;
  htmlPreview: string;
  textPreview: string;
  smtpWarning?: string;
}> {
  return postJson('/api/reminders/dispatch', payload);
}
