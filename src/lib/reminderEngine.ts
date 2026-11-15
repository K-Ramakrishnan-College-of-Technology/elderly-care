import { dispatchProactiveEmail } from './api';
import { recordEmailLog, updateAppointmentFields } from './careService';
import { getTodayDateKey } from './careUtils';
import type {
  Appointment,
  CareMember,
  CareProfile,
  DoseLog,
  EmailAlertType,
  EmailLog,
  Medication,
} from '../types/kincare';

export interface DueAlertCandidate {
  alertKey: string;
  type: EmailAlertType;
  subject: string;
  messageText: string;
  recipients: string[];
  appointmentId?: string;
  appointmentWindow?: '24h' | '2h';
}

function parseTimeToMinutesToday(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => Number(n));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function evaluateDueAlerts(params: {
  profile: CareProfile;
  members: CareMember[];
  medications: Medication[];
  doseLogs: DoseLog[];
  appointments: Appointment[];
  emailLogs: EmailLog[];
  now?: Date;
}): DueAlertCandidate[] {
  const now = params.now ?? new Date();
  const todayKey = getTodayDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const sentKeys = new Set(params.emailLogs.map((e) => e.alertKey));

  const activeMembers = params.members.filter((m) => m.status === 'active' && m.alertEmail.trim().length > 0);
  const missedRecipients = activeMembers.filter((m) => m.notifyMissedDose).map((m) => m.alertEmail.trim());
  const upcomingRecipients = activeMembers.filter((m) => m.notifyUpcomingDose).map((m) => m.alertEmail.trim());
  const apptRecipients = activeMembers.filter((m) => m.notifyAppointments).map((m) => m.alertEmail.trim());

  const todayLogsByMed = new Map<string, DoseLog>();
  for (const log of params.doseLogs) {
    if (log.dateKey === todayKey) {
      todayLogsByMed.set(log.medicationId, log);
    }
  }

  const candidates: DueAlertCandidate[] = [];

  for (const med of params.medications) {
    if (med.approvalStatus !== 'approved') continue;
    const log = todayLogsByMed.get(med.id);
    const schedMins = parseTimeToMinutesToday(med.scheduledTime);

    // 1. Missed dose (> 30 minutes past scheduled time and not logged)
    if (!log && nowMinutes - schedMins >= 30 && missedRecipients.length > 0) {
      const alertKey = `missed_${med.id}_${todayKey}`;
      if (!sentKeys.has(alertKey)) {
        candidates.push({
          alertKey,
          type: 'missed_dose',
          subject: `Missed Dose Alert: ${med.name} (${med.dosage}) for ${params.profile.seniorName}`,
          messageText:
            `${params.profile.seniorName} has not logged their ${med.scheduledTime} dose of ${med.name} (${med.dosage}).\n` +
            `Instructions: ${med.instructions || 'Take as directed.'}\n` +
            `Please check in gently with ${params.profile.seniorName} or update the Care Log once confirmed.`,
          recipients: missedRecipients,
        });
      }
    }

    // 2. Upcoming dose (due within next 45 minutes)
    const minsUntil = schedMins - nowMinutes;
    if (!log && minsUntil >= 0 && minsUntil <= 45 && upcomingRecipients.length > 0) {
      const alertKey = `upcoming_${med.id}_${todayKey}`;
      if (!sentKeys.has(alertKey)) {
        candidates.push({
          alertKey,
          type: 'upcoming_dose',
          subject: `Upcoming Dose (${med.scheduledTime}): ${med.name} for ${params.profile.seniorName}`,
          messageText:
            `Reminder: ${med.name} (${med.dosage}) is scheduled at ${med.scheduledTime} (in ${minsUntil} minutes).\n` +
            `Guidance: ${med.instructions || 'Take as prescribed.'}`,
          recipients: upcomingRecipients,
        });
      }
    }

    // 3. Refill warning
    if (med.pillsRemaining <= med.refillThreshold && missedRecipients.length > 0) {
      const alertKey = `refill_${med.id}_${todayKey}`;
      if (!sentKeys.has(alertKey)) {
        candidates.push({
          alertKey,
          type: 'refill_warning',
          subject: `Low Supply Warning: ${med.name} has ${med.pillsRemaining} pills left`,
          messageText:
            `${params.profile.seniorName}'s supply of ${med.name} (${med.dosage}) is down to ${med.pillsRemaining} pills ` +
            `(alert threshold: ${med.refillThreshold}). Prescriber: ${med.prescriber || 'Primary clinic'}. Please arrange a refill.`,
          recipients: missedRecipients,
        });
      }
    }
  }

  // 4. Appointments within 24h or 2h
  if (apptRecipients.length > 0) {
    for (const appt of params.appointments) {
      if (appt.status !== 'scheduled') continue;
      const apptDateTime = new Date(`${appt.appointmentDate}T${appt.appointmentTime}:00`);
      if (Number.isNaN(apptDateTime.getTime())) continue;
      const hoursUntil = (apptDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntil > 0 && hoursUntil <= 2 && !appt.reminder2hSent) {
        const alertKey = `appt2h_${appt.id}`;
        if (!sentKeys.has(alertKey)) {
          candidates.push({
            alertKey,
            type: 'appointment_reminder',
            subject: `Appointment in < 2 Hours: ${appt.title} with ${appt.doctorName}`,
            messageText:
              `Upcoming medical appointment for ${params.profile.seniorName} today at ${appt.appointmentTime}.\n` +
              `Doctor: ${appt.doctorName} (${appt.specialty || 'Clinic Visit'})\n` +
              `Location: ${appt.location || 'See visit notes'}\n` +
              `Notes: ${appt.notes || 'None'}`,
            recipients: apptRecipients,
            appointmentId: appt.id,
            appointmentWindow: '2h',
          });
        }
      } else if (hoursUntil > 2 && hoursUntil <= 24 && !appt.reminder24hSent) {
        const alertKey = `appt24h_${appt.id}`;
        if (!sentKeys.has(alertKey)) {
          candidates.push({
            alertKey,
            type: 'appointment_reminder',
            subject: `Tomorrow's Appointment: ${appt.title} (${appt.appointmentDate} at ${appt.appointmentTime})`,
            messageText:
              `24-hour reminder for ${params.profile.seniorName}'s visit: ${appt.title}.\n` +
              `Doctor: ${appt.doctorName} · ${appt.appointmentDate} at ${appt.appointmentTime}\n` +
              `Location: ${appt.location || 'See visit notes'}`,
            recipients: apptRecipients,
            appointmentId: appt.id,
            appointmentWindow: '24h',
          });
        }
      }
    }
  }

  return candidates;
}

export async function runProactiveAlertSweep(params: {
  profile: CareProfile;
  members: CareMember[];
  medications: Medication[];
  doseLogs: DoseLog[];
  appointments: Appointment[];
  emailLogs: EmailLog[];
  actorUid: string;
}): Promise<{ dispatched: number; smtpWarning?: string }> {
  const candidates = evaluateDueAlerts(params);
  let dispatched = 0;
  let smtpWarning: string | undefined;

  for (const item of candidates) {
    const result = await dispatchProactiveEmail({
      seniorName: params.profile.seniorName,
      careCode: params.profile.careCode,
      type: item.type,
      subject: item.subject,
      messageText: item.messageText,
      recipients: item.recipients,
    });

    if (result.smtpWarning) {
      smtpWarning = result.smtpWarning;
    }

    await recordEmailLog({
      profileId: params.profile.profileId,
      alertKey: item.alertKey,
      type: item.type,
      recipients: item.recipients,
      subject: item.subject,
      bodyPreview: item.messageText,
      deliveryMode: result.deliveryMode,
      status: result.status,
      actorUid: params.actorUid,
    });

    if (item.appointmentId && item.appointmentWindow === '24h') {
      await updateAppointmentFields(params.profile.profileId, item.appointmentId, { reminder24hSent: true });
    } else if (item.appointmentId && item.appointmentWindow === '2h') {
      await updateAppointmentFields(params.profile.profileId, item.appointmentId, { reminder2hSent: true });
    }

    dispatched++;
  }

  return { dispatched, smtpWarning };
}
