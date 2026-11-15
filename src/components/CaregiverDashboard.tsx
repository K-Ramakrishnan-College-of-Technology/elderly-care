import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertTriangle,
  BellRing,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  Edit3,
  KeyRound,
  Mail,
  Pill,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { DASHBOARD_NAV_ITEMS } from './dashboardNav';
import type { DashboardTab } from './dashboardNav';
export { DASHBOARD_NAV_ITEMS };
export type { DashboardTab };
import {
  generateAppointmentPrepBrief,
  generateDailyCareDigest,
  requestMedicationInsights,
} from '../lib/api';
import {
  deleteAppointment,
  deleteMedication,
  getTodayDateKey,
  logDoseAndAdjustSupply,
  rotateCarePasscode,
  updateAppointmentFields,
  updateCareProfileSettings,
  updateMedicationApproval,
  updateMemberPermissions,
} from '../lib/careService';
import { evaluateDueAlerts, runProactiveAlertSweep } from '../lib/reminderEngine';
import type {
  Appointment,
  CareMember,
  CareProfile,
  CheckIn,
  DoseLog,
  DoseStatus,
  EmailLog,
  Medication,
  MedicationInsights,
  TimeSlot,
} from '../types/kincare';
import { AppointmentModal, MedicationModal, SendEmailReminderModal } from './Modals';

interface CaregiverDashboardProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  profile: CareProfile;
  currentUid: string;
  currentUserName: string;
  currentMember: CareMember;
  members: CareMember[];
  medications: Medication[];
  doseLogs: DoseLog[];
  appointments: Appointment[];
  checkIns: CheckIn[];
  emailLogs: EmailLog[];
  smtpConfigured: boolean;
  onReportError: (message: string, retryFn?: () => Promise<void>) => void;
}

export function CaregiverDashboard({
  activeTab,
  onTabChange,
  profile,
  currentUid,
  currentUserName,
  currentMember,
  members,
  medications,
  doseLogs,
  appointments,
  checkIns,
  emailLogs,
  smtpConfigured,
  onReportError,
}: CaregiverDashboardProps) {
  const isOwnerOrSenior = profile.ownerId === currentUid || currentMember.role === 'elderly';
  const canEditSchedule = isOwnerOrSenior || currentMember.canEditSchedule;
  const todayKey = getTodayDateKey();

  // Modals & Interactive States
  const [medModalOpen, setMedModalOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | undefined>(undefined);
  const [apptModalOpen, setApptModalOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | undefined>(undefined);
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  // Filters
  const [medSearch, setMedSearch] = useState('');
  const [slotFilter, setSlotFilter] = useState<'all' | TimeSlot | 'pending_senior'>('all');
  const [apptFilter, setApptFilter] = useState<'upcoming' | 'completed' | 'all'>('upcoming');

  // AI States
  const [dailyDigest, setDailyDigest] = useState<string>('');
  const [loadingDigest, setLoadingDigest] = useState(false);
  const [insights, setInsights] = useState<MedicationInsights | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [generatingBriefId, setGeneratingBriefId] = useState<string | null>(null);

  // Email Sweep States
  const [sweepingAlerts, setSweepingAlerts] = useState(false);
  const [sweepNotice, setSweepNotice] = useState<string | null>(null);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);

  // Care Circle & Profile Settings States
  const [copiedCode, setCopiedCode] = useState(false);
  const [oldPasscode, setOldPasscode] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [rotatingPass, setRotatingPass] = useState(false);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);

  const [allergiesDraft, setAllergiesDraft] = useState(profile.allergies);
  const [conditionsDraft, setConditionsDraft] = useState(profile.conditions);
  const [doctorNameDraft, setDoctorNameDraft] = useState(profile.doctorName);
  const [emergencyNameDraft, setEmergencyNameDraft] = useState(profile.emergencyContactName);
  const [emergencyPhoneDraft, setEmergencyPhoneDraft] = useState(profile.emergencyContactPhone);
  const [savingClinical, setSavingClinical] = useState(false);
  const [clinicalSavedMsg, setClinicalSavedMsg] = useState<string | null>(null);

  // Sync draft inputs whenever user switches to a different CareProfile
  useEffect(() => {
    setAllergiesDraft(profile.allergies);
    setConditionsDraft(profile.conditions);
    setDoctorNameDraft(profile.doctorName);
    setEmergencyNameDraft(profile.emergencyContactName);
    setEmergencyPhoneDraft(profile.emergencyContactPhone);
    setInsights(null);
    setDailyDigest('');
    setSweepNotice(null);
    setClinicalSavedMsg(null);
  }, [
    profile.profileId,
    profile.allergies,
    profile.conditions,
    profile.doctorName,
    profile.emergencyContactName,
    profile.emergencyContactPhone,
  ]);

  // Derived Metrics
  const todayLogsMap = useMemo(() => {
    const map = new Map<string, DoseLog>();
    for (const log of doseLogs) {
      if (log.dateKey === todayKey) {
        map.set(log.medicationId, log);
      }
    }
    return map;
  }, [doseLogs, todayKey]);

  const approvedMeds = useMemo(
    () => medications.filter((m) => m.approvalStatus === 'approved'),
    [medications]
  );

  const takenTodayCount = approvedMeds.filter(
    (m) => todayLogsMap.get(m.id)?.status === 'taken'
  ).length;

  const lowRefillMeds = useMemo(
    () => approvedMeds.filter((m) => m.pillsRemaining <= m.refillThreshold),
    [approvedMeds]
  );

  const scheduledAppts = useMemo(
    () => appointments.filter((a) => a.status === 'scheduled'),
    [appointments]
  );

  const sevenDayAdherence = useMemo(() => {
    const recentLogs = doseLogs.slice(0, 60);
    if (recentLogs.length === 0) return approvedMeds.length > 0 ? 100 : 0;
    const taken = recentLogs.filter((l) => l.status === 'taken').length;
    return Math.round((taken / recentLogs.length) * 100);
  }, [doseLogs, approvedMeds.length]);

  const dueCandidates = useMemo(
    () =>
      evaluateDueAlerts({
        profile,
        members,
        medications,
        doseLogs,
        appointments,
        emailLogs,
      }),
    [profile, members, medications, doseLogs, appointments, emailLogs]
  );

  const filteredMeds = useMemo(() => {
    return medications.filter((med) => {
      if (slotFilter === 'pending_senior' && med.approvalStatus !== 'pending_senior') return false;
      if (
        slotFilter !== 'all' &&
        slotFilter !== 'pending_senior' &&
        med.timeSlot !== slotFilter
      ) {
        return false;
      }
      if (medSearch.trim()) {
        const q = medSearch.trim().toLowerCase();
        return (
          med.name.toLowerCase().includes(q) ||
          med.dosage.toLowerCase().includes(q) ||
          med.purpose.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [medications, slotFilter, medSearch]);

  const filteredAppts = useMemo(() => {
    if (apptFilter === 'upcoming') return appointments.filter((a) => a.status === 'scheduled');
    if (apptFilter === 'completed') return appointments.filter((a) => a.status !== 'scheduled');
    return appointments;
  }, [appointments, apptFilter]);

  // Handlers
  async function handleLogDose(med: Medication, status: DoseStatus) {
    const existing = todayLogsMap.get(med.id);
    const execute = async () => {
      try {
        await logDoseAndAdjustSupply({
          profileId: profile.profileId,
          medication: med,
          dateKey: todayKey,
          status,
          previousStatus: existing?.status,
          note: '',
          actorUid: currentUid,
          actorName: currentUserName,
        });
      } catch (err) {
        onReportError(err instanceof Error ? err.message : 'Failed to log dose.', execute);
      }
    };
    await execute();
  }

  async function handleGenerateDigest() {
    setLoadingDigest(true);
    try {
      const missedCount = approvedMeds.filter(
        (m) => todayLogsMap.get(m.id)?.status === 'missed'
      ).length;
      const pendingCount = approvedMeds.length - takenTodayCount;
      const latestCheckIn = checkIns[0];
      const text = await generateDailyCareDigest({
        seniorName: profile.seniorName,
        dateLabel: todayKey,
        pendingCount,
        takenCount: takenTodayCount,
        missedCount,
        lowRefillMeds: lowRefillMeds.map((m) => `${m.name} (${m.pillsRemaining} left)`),
        upcomingAppointments: scheduledAppts
          .slice(0, 3)
          .map((a) => `${a.title} on ${a.appointmentDate} at ${a.appointmentTime}`),
        latestMood: latestCheckIn
          ? `${latestCheckIn.mood} (Energy ${latestCheckIn.energyLevel}/5) ${latestCheckIn.note}`
          : 'No check-in logged yet today.',
      });
      setDailyDigest(text);
    } catch (err) {
      onReportError(err instanceof Error ? err.message : 'Unable to generate daily digest.');
    } finally {
      setLoadingDigest(false);
    }
  }

  async function handleAnalyzeInteractions() {
    if (approvedMeds.length === 0) {
      onReportError('Add at least one approved medication before running interaction guidance.');
      return;
    }
    setLoadingInsights(true);
    try {
      const result = await requestMedicationInsights({
        seniorName: profile.seniorName,
        age: profile.age,
        allergies: profile.allergies || 'None reported',
        conditions: profile.conditions || 'None reported',
        medications: approvedMeds.map((m) => ({
          name: m.name,
          dosage: m.dosage,
          frequency: m.frequency,
          scheduledTime: m.scheduledTime,
          instructions: m.instructions,
        })),
      });
      setInsights(result);
    } catch (err) {
      onReportError(err instanceof Error ? err.message : 'Unable to analyze medication list.');
    } finally {
      setLoadingInsights(false);
    }
  }

  async function handleGenerateVisitBrief(appt: Appointment) {
    setGeneratingBriefId(appt.id);
    try {
      const takenCount = doseLogs.filter((l) => l.status === 'taken').length;
      const missedLogs = doseLogs.filter((l) => l.status === 'missed');
      const skippedCount = doseLogs.filter((l) => l.status === 'skipped').length;

      const brief = await generateAppointmentPrepBrief({
        seniorName: profile.seniorName,
        age: profile.age,
        allergies: profile.allergies,
        conditions: profile.conditions,
        appointment: {
          title: appt.title,
          doctorName: appt.doctorName,
          specialty: appt.specialty,
          appointmentDate: appt.appointmentDate,
          appointmentTime: appt.appointmentTime,
          notes: appt.notes,
        },
        medications: approvedMeds.map((m) => ({
          name: m.name,
          dosage: m.dosage,
          frequency: m.frequency,
          pillsRemaining: m.pillsRemaining,
        })),
        adherenceSummary: {
          takenCount,
          missedCount: missedLogs.length,
          skippedCount,
          missedMedNames: Array.from(new Set(missedLogs.map((m) => m.medicationName))).slice(0, 10),
        },
        recentCheckIns: checkIns.slice(0, 5).map((c) => ({
          mood: c.mood,
          energyLevel: c.energyLevel,
          note: c.note,
        })),
      });

      await updateAppointmentFields(profile.profileId, appt.id, { prepBrief: brief });
    } catch (err) {
      onReportError(err instanceof Error ? err.message : 'Failed to generate visit brief.');
    } finally {
      setGeneratingBriefId(null);
    }
  }

  async function handleSweepAlerts() {
    setSweepingAlerts(true);
    setSweepNotice(null);
    try {
      const { dispatched, smtpWarning } = await runProactiveAlertSweep({
        profile,
        members,
        medications,
        doseLogs,
        appointments,
        emailLogs,
        actorUid: currentUid,
      });
      if (smtpWarning) {
        setSweepNotice(
          `Logged ${dispatched} alert${dispatched === 1 ? '' : 's'} to Care Circle Outbox. ${smtpWarning}`
        );
      } else {
        setSweepNotice(
          dispatched === 0
            ? 'All due reminders are already up to date—zero pending missed doses or appointment windows.'
            : `Dispatched ${dispatched} proactive email alert${dispatched === 1 ? '' : 's'} to Care Circle recipients.`
        );
      }
    } catch (err) {
      onReportError(err instanceof Error ? err.message : 'Alert dispatch sweep failed.');
    } finally {
      setSweepingAlerts(false);
    }
  }

  function handleDownloadEml(log: EmailLog) {
    const eml = [
      `To: ${log.recipients.join(', ')}`,
      `Subject: ${log.subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      '',
      log.bodyPreview,
    ].join('\n');
    const blob = new Blob([eml], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${log.id}.eml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleRotatePasscode(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(newPasscode.trim())) {
      onReportError('New passcode must be exactly 6 digits.');
      return;
    }
    setRotatingPass(true);
    setPassSuccess(null);
    try {
      await rotateCarePasscode({
        profile,
        oldPasscode: oldPasscode.trim() || undefined,
        newPasscode: newPasscode.trim(),
        actorUid: currentUid,
      });
      setOldPasscode('');
      setNewPasscode('');
      setPassSuccess('Care Passcode updated. Share the new 6-digit passcode only with trusted members.');
    } catch (err) {
      onReportError(err instanceof Error ? err.message : 'Failed to rotate passcode.');
    } finally {
      setRotatingPass(false);
    }
  }

  async function handleSaveClinicalProfile(e: FormEvent) {
    e.preventDefault();
    setSavingClinical(true);
    setClinicalSavedMsg(null);
    try {
      await updateCareProfileSettings(profile.profileId, {
        allergies: allergiesDraft,
        conditions: conditionsDraft,
        doctorName: doctorNameDraft,
        emergencyContactName: emergencyNameDraft,
        emergencyContactPhone: emergencyPhoneDraft,
      });
      setClinicalSavedMsg('Clinical summary saved.');
    } catch (err) {
      onReportError(err instanceof Error ? err.message : 'Unable to save clinical summary.');
    } finally {
      setSavingClinical(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Sub-Navigation Pills for Mobile */}
      <div className="lg:hidden flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
        {(
          [
            ['overview', 'Overview'],
            ['medications', 'Medications'],
            ['appointments', 'Appointments'],
            ['emails', 'Email Alerts'],
            ['circle', 'Care Circle'],
          ] as Array<[DashboardTab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 4-Column KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Today&apos;s Doses</p>
              <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {takenTodayCount} / {approvedMeds.length}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {approvedMeds.length - takenTodayCount} remaining today
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Recent Adherence</p>
              <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {sevenDayAdherence}%
              </p>
              <p className="text-xs text-slate-600 mt-1">
                Across {doseLogs.length} logged dose events
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Low Refill Alerts</p>
              <p
                className={`font-mono text-2xl font-bold tabular-nums mt-1 ${
                  lowRefillMeds.length > 0 ? 'text-amber-700' : 'text-slate-900'
                }`}
              >
                {lowRefillMeds.length}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {lowRefillMeds.length > 0
                  ? lowRefillMeds.map((m) => m.name).join(', ')
                  : 'All supplies stocked'}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Upcoming Appointments</p>
              <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {scheduledAppts.length}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {scheduledAppts[0]
                  ? `Next: ${scheduledAppts[0].appointmentDate}`
                  : 'No visits scheduled'}
              </p>
            </div>
          </div>

          {/* AI Daily Care Briefing */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-700" />
                  Smart Daily Care Briefing for {profile.seniorName}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Synthesizes today&apos;s doses, refill alerts, appointments, and wellness check-ins.
                </p>
              </div>
              <button
                type="button"
                onClick={handleGenerateDigest}
                disabled={loadingDigest}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDigest ? 'animate-spin' : ''}`} />
                {loadingDigest ? 'Synthesizing...' : dailyDigest ? 'Refresh Briefing' : 'Generate Briefing'}
              </button>
            </div>

            {dailyDigest ? (
              <p className="mt-4 text-sm text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-4">
                {dailyDigest}
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Click &ldquo;Generate Briefing&rdquo; for a plain-language summary of today&apos;s priorities.
              </p>
            )}
          </div>

          {/* Today's Medication Schedule Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Today&apos;s Medication Schedule ({todayKey})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time shared log synchronized with {profile.seniorName}&apos;s Senior View
                </p>
              </div>
              {canEditSchedule && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingMed(undefined);
                    setMedModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Medication
                </button>
              )}
            </div>

            {approvedMeds.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-600">
                No active medications scheduled yet. Add a medication or approve pending requests.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-6">Time</th>
                      <th className="py-3 px-4">Medication</th>
                      <th className="py-3 px-4">Instructions</th>
                      <th className="py-3 px-4 text-right">Supply</th>
                      <th className="py-3 px-4">Today&apos;s Status</th>
                      <th className="py-3 px-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {approvedMeds.map((med) => {
                      const log = todayLogsMap.get(med.id);
                      const status = log?.status;
                      return (
                        <tr key={med.id} className="hover:bg-slate-50/70">
                          <td className="py-3.5 px-6 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                            {med.scheduledTime}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900">{med.name}</div>
                            <div className="text-xs text-slate-500">
                              {med.dosage} · {med.timeSlot}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 max-w-xs">
                            {med.instructions || 'Take as prescribed'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                            <span
                              className={
                                med.pillsRemaining <= med.refillThreshold
                                  ? 'text-amber-700 font-semibold'
                                  : 'text-slate-700'
                              }
                            >
                              {med.pillsRemaining} pills
                            </span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {status === 'taken' && (
                              <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                                <CheckCircle2 className="w-4 h-4" />
                                Taken
                              </span>
                            )}
                            {status === 'missed' && (
                              <span className="inline-flex items-center gap-1.5 text-red-700 font-medium">
                                <AlertTriangle className="w-4 h-4" />
                                Missed
                              </span>
                            )}
                            {status === 'skipped' && (
                              <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium">
                                Skipped
                              </span>
                            )}
                            {!status && <span className="text-slate-500">Pending</span>}
                          </td>
                          <td className="py-3.5 px-6 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleLogDose(med, 'taken')}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                                  status === 'taken'
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : 'bg-teal-700 text-white hover:bg-teal-800'
                                }`}
                              >
                                {status === 'taken' ? 'Logged Taken' : 'Mark Taken'}
                              </button>
                              {status !== 'missed' && (
                                <button
                                  type="button"
                                  onClick={() => handleLogDose(med, 'missed')}
                                  className="px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 cursor-pointer"
                                >
                                  Missed
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Check-Ins */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="font-display text-base font-bold text-slate-900 mb-3">
              Recent Senior Wellness &amp; Side-Effect Check-Ins
            </h2>
            {checkIns.length === 0 ? (
              <p className="text-sm text-slate-500">
                No check-ins recorded yet. {profile.seniorName} can record 1-tap mood and comfort updates in Senior View.
              </p>
            ) : (
              <div className="divide-y divide-slate-200">
                {checkIns.slice(0, 5).map((item) => (
                  <div key={item.id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-4 text-sm">
                    <div>
                      <span className="font-semibold capitalize text-slate-900">{item.mood}</span>
                      <span className="text-slate-400 mx-2">·</span>
                      <span className="font-mono text-xs text-slate-600 tabular-nums">
                        Energy {item.energyLevel}/5
                      </span>
                      {item.note && <p className="text-slate-700 mt-1">{item.note}</p>}
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">{item.authorName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MEDICATIONS & AI GUARDIAN TAB */}
      {activeTab === 'medications' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  aria-label="Filter medications"
                  value={medSearch}
                  onChange={(e) => setMedSearch(e.target.value)}
                  placeholder="Filter medications..."
                  className="pl-9 pr-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    ['all', 'All'],
                    ['morning', 'Morning'],
                    ['afternoon', 'Afternoon'],
                    ['evening', 'Evening'],
                    ['bedtime', 'Bedtime'],
                    ['pending_senior', 'Pending Approval'],
                  ] as Array<['all' | TimeSlot | 'pending_senior', string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSlotFilter(key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                      slotFilter === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleAnalyzeInteractions}
                disabled={loadingInsights}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-teal-700" />
                {loadingInsights ? 'Analyzing...' : 'AI Interaction Check'}
              </button>

              {canEditSchedule && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingMed(undefined);
                    setMedModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Medication
                </button>
              )}
            </div>
          </div>

          {/* AI Interaction & Plain Language Insights */}
          {insights && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-teal-700" />
                    AI Medication Safety &amp; Plain-Language Guide
                  </h3>
                  <p className="text-sm text-slate-700 mt-1">{insights.overallSafetyNote}</p>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700">
                <strong>Routine Clustering Suggestion:</strong> {insights.routineOptimizationTip}
              </div>

              {insights.interactionAlerts.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold text-slate-500">
                    Considerations to Discuss With Your Pharmacist
                  </h4>
                  {insights.interactionAlerts.map((alert, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-lg border border-amber-200 bg-amber-50/70 text-sm"
                    >
                      <p className="font-semibold text-slate-900">
                        [{alert.severity}] {alert.title}
                      </p>
                      <p className="text-slate-700 mt-0.5">{alert.guidance}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {insights.plainLanguageGuides.map((g, idx) => (
                  <div key={idx} className="p-3.5 rounded-lg border border-slate-200 bg-white text-sm">
                    <p className="font-semibold text-slate-900">{g.medicationName}</p>
                    <p className="text-slate-600 mt-1">{g.plainSummary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Medication List */}
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
            {filteredMeds.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-600">
                No medications match the current filter.
              </div>
            ) : (
              filteredMeds.map((med) => (
                <div
                  key={med.id}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-mono text-sm font-semibold text-teal-700 tabular-nums">
                        {med.scheduledTime}
                      </span>
                      <h3 className="font-display font-bold text-slate-900">{med.name}</h3>
                      <span className="text-sm text-slate-600">{med.dosage}</span>
                      {med.approvalStatus === 'pending_senior' && (
                        <span className="text-xs font-semibold text-amber-700">
                          Awaiting Senior Approval
                        </span>
                      )}
                      {med.approvalStatus === 'paused' && (
                        <span className="text-xs font-semibold text-slate-500">Paused</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700">
                      {med.instructions || 'Take as prescribed.'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {med.frequency} · {med.pillColor} · Prescriber: {med.prescriber || 'Unspecified'} ·{' '}
                      <span className="font-mono tabular-nums">
                        {med.pillsRemaining} pills remaining
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {isOwnerOrSenior && med.approvalStatus !== 'approved' && (
                      <button
                        type="button"
                        onClick={() =>
                          updateMedicationApproval(profile.profileId, med.id, 'approved')
                        }
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 cursor-pointer"
                      >
                        Approve
                      </button>
                    )}
                    {canEditSchedule && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMed(med);
                            setMedModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await deleteMedication(profile.profileId, med.id);
                            } catch (err) {
                              onReportError(
                                err instanceof Error ? err.message : 'Unable to delete medication.'
                              );
                            }
                          }}
                          aria-label={`Delete ${med.name}`}
                          className="p-1.5 text-slate-500 hover:text-red-700 rounded-lg hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* APPOINTMENTS & VISIT PREP TAB */}
      {activeTab === 'appointments' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
              {(
                [
                  ['upcoming', 'Upcoming'],
                  ['completed', 'Completed / Past'],
                  ['all', 'All Visits'],
                ] as Array<['upcoming' | 'completed' | 'all', string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setApptFilter(key)}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    apptFilter === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {canEditSchedule && (
              <button
                type="button"
                onClick={() => {
                  setEditingAppt(undefined);
                  setApptModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Schedule Appointment
              </button>
            )}
          </div>

          {filteredAppts.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-600">
              No appointments in this view. Schedule a medical visit to track reminders and generate AI visit prep briefs.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAppts.map((appt) => (
                <div key={appt.id} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-mono text-sm font-semibold text-teal-700 tabular-nums">
                          {appt.appointmentDate} · {appt.appointmentTime}
                        </span>
                        <h3 className="font-display text-lg font-bold text-slate-900">
                          {appt.title}
                        </h3>
                        <span className="text-xs font-medium capitalize text-slate-500">
                          {appt.status}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 mt-1">
                        {appt.doctorName}
                        {appt.specialty ? ` (${appt.specialty})` : ''}
                        {appt.location ? ` · ${appt.location}` : ''}
                      </p>
                      {appt.notes && (
                        <p className="text-sm text-slate-600 mt-1.5">{appt.notes}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={generatingBriefId === appt.id}
                        onClick={() => handleGenerateVisitBrief(appt)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {generatingBriefId === appt.id
                          ? 'Preparing Brief...'
                          : appt.prepBrief
                          ? 'Refresh Visit Brief'
                          : 'AI Visit Prep Brief'}
                      </button>

                      {canEditSchedule && appt.status === 'scheduled' && (
                        <button
                          type="button"
                          onClick={() =>
                            updateAppointmentFields(profile.profileId, appt.id, { status: 'completed' })
                          }
                          className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 cursor-pointer"
                        >
                          <ClipboardCheck className="w-3.5 h-3.5" />
                          Complete
                        </button>
                      )}

                      {canEditSchedule && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAppt(appt);
                              setApptModalOpen(true);
                            }}
                            className="p-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                            aria-label="Edit appointment"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await deleteAppointment(profile.profileId, appt.id);
                              } catch (err) {
                                onReportError(
                                  err instanceof Error ? err.message : 'Unable to delete appointment.'
                                );
                              }
                            }}
                            className="p-2 text-slate-500 hover:text-red-700 rounded-lg hover:bg-red-50 cursor-pointer"
                            aria-label="Delete appointment"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {appt.prepBrief && (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-teal-800">
                          Doctor Visit Preparation Brief
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => navigator.clipboard?.writeText(appt.prepBrief)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copy
                          </button>
                          <button
                            type="button"
                            onClick={() => window.print()}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Print
                          </button>
                        </div>
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed">
                        {appt.prepBrief}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PROACTIVE EMAIL ALERTS TAB */}
      {activeTab === 'emails' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                <BellRing className="w-5 h-5 text-teal-700" />
                Proactive Email Reminder Engine
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Monitors upcoming doses (within 45m), missed doses (&gt; 30m overdue), low pill supplies, and appointments (24h &amp; 2h).{' '}
                {smtpConfigured
                  ? 'Live SMTP transport is active.'
                  : 'Running in Care Circle Outbox Mode (emails are rendered, logged, and exportable as .eml until SMTP env credentials are attached).'}
              </p>
              <p className="text-xs font-mono text-slate-500 mt-1.5 tabular-nums">
                Currently queued alerts detected: {dueCandidates.length}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleSweepAlerts}
                disabled={sweepingAlerts}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${sweepingAlerts ? 'animate-spin' : ''}`} />
                {sweepingAlerts ? 'Scanning...' : 'Scan & Send Due Alerts'}
              </button>

              <button
                type="button"
                onClick={() => setEmailModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <Mail className="w-4 h-4" />
                Compose Reminder
              </button>
            </div>
          </div>

          {sweepNotice && (
            <div
              role="status"
              aria-live="polite"
              className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-sm text-teal-900"
            >
              {sweepNotice}
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-bold text-slate-900">
                Dispatched Email History ({emailLogs.length})
              </h3>
            </div>

            {emailLogs.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-600">
                No email reminders dispatched yet. Click &ldquo;Scan &amp; Send Due Alerts&rdquo; or &ldquo;Compose Reminder&rdquo; above.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {emailLogs.map((log) => (
                  <div key={log.id} className="p-5 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{log.subject}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          To: {log.recipients.join(', ')} · Type: {log.type.replace('_', ' ')} · Mode:{' '}
                          {log.deliveryMode === 'smtp_sent' ? 'SMTP Delivered' : 'Outbox Logged'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedEmailId((cur) => (cur === log.id ? null : log.id))
                          }
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                          {expandedEmailId === log.id ? 'Hide Content' : 'View Email'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadEml(log)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          .eml
                        </button>
                      </div>
                    </div>

                    {expandedEmailId === log.id && (
                      <pre className="mt-2 p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap font-sans">
                        {log.bodyPreview}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CARE CIRCLE & PASSCODE ACCESS TAB */}
      {activeTab === 'circle' && (
        <div className="space-y-6">
          {/* Passcode & Senior Approval Governance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-teal-700" />
                Passcode-Based Care Circle Access
              </h2>
              <p className="text-sm text-slate-600">
                Share the Care Code and 6-digit Passcode with trusted family members or caretakers so they can join this profile.
              </p>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">Shareable Care Code</p>
                  <p className="font-mono text-xl font-bold text-slate-900 tracking-wider mt-0.5">
                    {profile.careCode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(profile.careCode);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCode ? 'Copied' : 'Copy Code'}
                </button>
              </div>

              {isOwnerOrSenior && (
                <form onSubmit={handleRotatePasscode} className="space-y-3 pt-2 border-t border-slate-200">
                  <p className="text-xs font-semibold text-slate-700">Rotate 6-Digit Care Passcode</p>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="password"
                      aria-label="Current 6-digit passcode (optional)"
                      inputMode="numeric"
                      maxLength={6}
                      value={oldPasscode}
                      onChange={(e) => setOldPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Current (optional)"
                      className="px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                    <input
                      type="password"
                      aria-label="New 6-digit passcode"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={newPasscode}
                      onChange={(e) => setNewPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="New 6 digits"
                      className="px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={rotatingPass}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                  >
                    {rotatingPass ? 'Updating...' : 'Update Passcode'}
                  </button>
                  {passSuccess && <p className="text-xs text-emerald-700 font-medium">{passSuccess}</p>}
                </form>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-teal-700" />
                Senior Autonomy &amp; Clinical Context
              </h2>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isOwnerOrSenior}
                  checked={profile.requireSeniorApproval}
                  onChange={(e) =>
                    updateCareProfileSettings(profile.profileId, {
                      requireSeniorApproval: e.target.checked,
                    })
                  }
                  className="mt-0.5 h-4 w-4 accent-teal-700"
                />
                <div className="text-sm">
                  <span className="font-semibold text-slate-900">
                    Require Elderly Approval for Medication Edits
                  </span>
                  <span className="block text-xs text-slate-600 mt-0.5">
                    Caretaker proposals remain in Pending Approval until {profile.seniorName} signs off.
                  </span>
                </div>
              </label>

              <form onSubmit={handleSaveClinicalProfile} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="clinical-allergies" className="block text-xs font-medium text-slate-600 mb-1">
                      Allergies
                    </label>
                    <input
                      id="clinical-allergies"
                      type="text"
                      value={allergiesDraft}
                      onChange={(e) => setAllergiesDraft(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="clinical-conditions" className="block text-xs font-medium text-slate-600 mb-1">
                      Conditions
                    </label>
                    <input
                      id="clinical-conditions"
                      type="text"
                      value={conditionsDraft}
                      onChange={(e) => setConditionsDraft(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="clinical-doctor" className="block text-xs font-medium text-slate-600 mb-1">
                      Primary Doctor
                    </label>
                    <input
                      id="clinical-doctor"
                      type="text"
                      value={doctorNameDraft}
                      onChange={(e) => setDoctorNameDraft(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="clinical-emergency-name" className="block text-xs font-medium text-slate-600 mb-1">
                      Emergency Contact
                    </label>
                    <input
                      id="clinical-emergency-name"
                      type="text"
                      value={emergencyNameDraft}
                      onChange={(e) => setEmergencyNameDraft(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="clinical-emergency-phone" className="block text-xs font-medium text-slate-600 mb-1">
                      Emergency Phone
                    </label>
                    <input
                      id="clinical-emergency-phone"
                      type="text"
                      value={emergencyPhoneDraft}
                      onChange={(e) => setEmergencyPhoneDraft(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="submit"
                    disabled={savingClinical || !canEditSchedule}
                    className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
                  >
                    {savingClinical ? 'Saving...' : 'Save Clinical Info'}
                  </button>
                  {clinicalSavedMsg && (
                    <span role="status" aria-live="polite" className="text-xs font-medium text-emerald-700">
                      {clinicalSavedMsg}
                    </span>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* Members & Notification Rules */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-teal-700" />
                Care Circle Members &amp; Email Alert Preferences ({members.length})
              </h2>
            </div>

            <div className="divide-y divide-slate-200">
              {members.map((member) => {
                const isSelf = member.uid === currentUid;
                const canModify = isOwnerOrSenior || isSelf;
                return (
                  <div
                    key={member.uid}
                    className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {member.displayName}{' '}
                        {isSelf && <span className="text-xs font-normal text-teal-700">(You)</span>}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {member.relationship} · Role: {member.role} · Email: {member.alertEmail || 'None'} ·{' '}
                        Status: {member.status}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={!canModify}
                          checked={member.notifyMissedDose}
                          onChange={(e) =>
                            updateMemberPermissions(profile.profileId, member.uid, {
                              notifyMissedDose: e.target.checked,
                            })
                          }
                          className="accent-teal-700"
                        />
                        Missed Doses
                      </label>

                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={!canModify}
                          checked={member.notifyUpcomingDose}
                          onChange={(e) =>
                            updateMemberPermissions(profile.profileId, member.uid, {
                              notifyUpcomingDose: e.target.checked,
                            })
                          }
                          className="accent-teal-700"
                        />
                        Upcoming Doses
                      </label>

                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={!canModify}
                          checked={member.notifyAppointments}
                          onChange={(e) =>
                            updateMemberPermissions(profile.profileId, member.uid, {
                              notifyAppointments: e.target.checked,
                            })
                          }
                          className="accent-teal-700"
                        />
                        Appointments
                      </label>

                      {isOwnerOrSenior && !isSelf && (
                        <>
                          <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium text-slate-800">
                            <input
                              type="checkbox"
                              checked={member.canEditSchedule}
                              onChange={(e) =>
                                updateMemberPermissions(profile.profileId, member.uid, {
                                  canEditSchedule: e.target.checked,
                                })
                              }
                              className="accent-teal-700"
                            />
                            Can Edit Schedule
                          </label>

                          <button
                            type="button"
                            onClick={() =>
                              updateMemberPermissions(profile.profileId, member.uid, {
                                status: member.status === 'active' ? 'paused' : 'active',
                              })
                            }
                            className="px-3 py-1.5 font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                          >
                            {member.status === 'active' ? 'Pause Access' : 'Restore Access'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {medModalOpen && (
        <MedicationModal
          profile={profile}
          actorUid={currentUid}
          actorName={currentUserName}
          isOwnerOrSenior={isOwnerOrSenior}
          existing={editingMed}
          onClose={() => setMedModalOpen(false)}
          onSaved={() => setMedModalOpen(false)}
        />
      )}

      {apptModalOpen && (
        <AppointmentModal
          profileId={profile.profileId}
          actorUid={currentUid}
          existing={editingAppt}
          onClose={() => setApptModalOpen(false)}
          onSaved={() => setApptModalOpen(false)}
        />
      )}

      {emailModalOpen && (
        <SendEmailReminderModal
          profile={profile}
          members={members}
          actorUid={currentUid}
          onClose={() => setEmailModalOpen(false)}
          onSent={(smtpWarning) => {
            setEmailModalOpen(false);
            setSweepNotice(
              smtpWarning || 'Email reminder dispatched and recorded in Care Circle history.'
            );
          }}
        />
      )}
    </div>
  );
}
