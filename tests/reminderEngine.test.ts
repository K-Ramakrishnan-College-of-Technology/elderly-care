import { describe, expect, it } from 'vitest';
import { evaluateDueAlerts } from '../src/lib/reminderEngine';
import type {
  Appointment,
  CareMember,
  CareProfile,
  DoseLog,
  EmailLog,
  Medication,
} from '../src/types/kincare';

const baseProfile: CareProfile = {
  profileId: 'care_1',
  ownerId: 'uid_senior',
  seniorName: 'Elena Vance',
  age: 76,
  careCode: 'KIN-7M2P',
  passcodeVerifier: 'verifier',
  passcodeSalt: 'salt',
  requireSeniorApproval: true,
  bloodType: 'O+',
  allergies: 'Penicillin',
  conditions: 'Hypertension',
  doctorName: 'Dr. Hannah Lin',
  doctorEmail: 'dr.lin@clinic.example',
  emergencyContactName: 'Claire Vance',
  emergencyContactPhone: '555-0100',
  preferredView: 'senior',
  createdAt: null,
  updatedAt: null,
};

const activeCaregiver: CareMember = {
  uid: 'uid_caregiver',
  profileId: 'care_1',
  displayName: 'Claire Vance',
  relationship: 'Daughter',
  role: 'family',
  canEditSchedule: true,
  alertEmail: 'claire@example.com',
  notifyMissedDose: true,
  notifyUpcomingDose: true,
  notifyAppointments: true,
  status: 'active',
  passToken: 'token_1',
  joinedAt: null,
  updatedAt: null,
};

const pausedMember: CareMember = {
  ...activeCaregiver,
  uid: 'uid_paused',
  alertEmail: 'paused@example.com',
  status: 'paused',
};

const morningMed: Medication = {
  id: 'med_1',
  profileId: 'care_1',
  name: 'Lisinopril',
  dosage: '10 mg',
  frequency: 'Once daily',
  timeSlot: 'morning',
  scheduledTime: '08:00',
  instructions: 'Take after breakfast',
  purpose: 'Blood pressure',
  prescriber: 'Dr. Hannah Lin',
  pillColor: 'Peach',
  pillsRemaining: 20,
  refillThreshold: 7,
  approvalStatus: 'approved',
  proposedByUid: 'uid_senior',
  proposedByName: 'Elena Vance',
  aiSummary: '',
  createdAt: null,
  updatedAt: null,
};

describe('evaluateDueAlerts — proactive reminder engine', () => {
  it('flags missed doses when >= 30 minutes overdue and not logged', () => {
    const now = new Date(2026, 10, 15, 8, 35, 0); // 08:35 (35m past 08:00)
    const alerts = evaluateDueAlerts({
      profile: baseProfile,
      members: [activeCaregiver, pausedMember],
      medications: [morningMed],
      doseLogs: [],
      appointments: [],
      emailLogs: [],
      now,
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('missed_dose');
    expect(alerts[0].recipients).toEqual(['claire@example.com']); // paused member excluded
    expect(alerts[0].alertKey).toBe('missed_med_1_2026-11-15');
  });

  it('does not flag missed dose under 30 minutes or already logged today', () => {
    const beforeThreshold = new Date(2026, 10, 15, 8, 25, 0);
    const noneYet = evaluateDueAlerts({
      profile: baseProfile,
      members: [activeCaregiver],
      medications: [morningMed],
      doseLogs: [],
      appointments: [],
      emailLogs: [],
      now: beforeThreshold,
    });
    expect(noneYet).toHaveLength(0);

    const afterThreshold = new Date(2026, 10, 15, 9, 0, 0);
    const takenLog: DoseLog = {
      id: '2026-11-15_med_1',
      profileId: 'care_1',
      medicationId: 'med_1',
      medicationName: 'Lisinopril',
      dosage: '10 mg',
      dateKey: '2026-11-15',
      scheduledTime: '08:00',
      status: 'taken',
      note: '',
      loggedByUid: 'uid_senior',
      loggedByName: 'Elena Vance',
      loggedAt: null,
    };
    const alreadyTaken = evaluateDueAlerts({
      profile: baseProfile,
      members: [activeCaregiver],
      medications: [morningMed],
      doseLogs: [takenLog],
      appointments: [],
      emailLogs: [],
      now: afterThreshold,
    });
    expect(alreadyTaken).toHaveLength(0);
  });

  it('flags upcoming doses within 45 minutes and ignores unapproved pending_senior meds', () => {
    const now = new Date(2026, 10, 15, 7, 30, 0); // 30m before 08:00
    const pendingMed: Medication = {
      ...morningMed,
      id: 'med_pending',
      approvalStatus: 'pending_senior',
    };

    const alerts = evaluateDueAlerts({
      profile: baseProfile,
      members: [activeCaregiver],
      medications: [morningMed, pendingMed],
      doseLogs: [],
      appointments: [],
      emailLogs: [],
      now,
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('upcoming_dose');
    expect(alerts[0].alertKey).toBe('upcoming_med_1_2026-11-15');
  });

  it('triggers refill warnings when pillsRemaining <= refillThreshold and deduplicates sent logs', () => {
    const now = new Date(2026, 10, 15, 6, 0, 0); // before dose window
    const lowMed: Medication = { ...morningMed, pillsRemaining: 5, refillThreshold: 7 };

    const firstPass = evaluateDueAlerts({
      profile: baseProfile,
      members: [activeCaregiver],
      medications: [lowMed],
      doseLogs: [],
      appointments: [],
      emailLogs: [],
      now,
    });
    expect(firstPass).toHaveLength(1);
    expect(firstPass[0].type).toBe('refill_warning');

    const sentLog: EmailLog = {
      id: 'eml_1',
      profileId: 'care_1',
      alertKey: 'refill_med_1_2026-11-15',
      type: 'refill_warning',
      recipients: ['claire@example.com'],
      subject: 'Low Supply',
      bodyPreview: 'Low supply',
      deliveryMode: 'outbox_queued',
      status: 'logged',
      triggeredByUid: 'uid_caregiver',
      sentAt: null,
    };

    const secondPass = evaluateDueAlerts({
      profile: baseProfile,
      members: [activeCaregiver],
      medications: [lowMed],
      doseLogs: [],
      appointments: [],
      emailLogs: [sentLog],
      now,
    });
    expect(secondPass).toHaveLength(0);
  });

  it('triggers 24h and 2h appointment reminders based on upcoming time window', () => {
    const now = new Date(2026, 10, 15, 9, 0, 0); // 2026-11-15 09:00
    const appt2h: Appointment = {
      id: 'appt_2h',
      profileId: 'care_1',
      title: 'Cardiology Follow-up',
      doctorName: 'Dr. Lin',
      specialty: 'Cardiology',
      location: 'Suite 304',
      appointmentDate: '2026-11-15',
      appointmentTime: '10:30', // 1.5h away
      notes: '',
      status: 'scheduled',
      prepBrief: '',
      reminder24hSent: true,
      reminder2hSent: false,
      createdByUid: 'uid_caregiver',
      createdAt: null,
      updatedAt: null,
    };
    const appt24h: Appointment = {
      ...appt2h,
      id: 'appt_24h',
      appointmentDate: '2026-11-16',
      appointmentTime: '08:00', // 23h away
      reminder24hSent: false,
      reminder2hSent: false,
    };

    const alerts = evaluateDueAlerts({
      profile: baseProfile,
      members: [activeCaregiver],
      medications: [],
      doseLogs: [],
      appointments: [appt2h, appt24h],
      emailLogs: [],
      now,
    });

    expect(alerts).toHaveLength(2);
    expect(alerts.find((a) => a.appointmentId === 'appt_2h')?.appointmentWindow).toBe('2h');
    expect(alerts.find((a) => a.appointmentId === 'appt_24h')?.appointmentWindow).toBe('24h');
  });
});
