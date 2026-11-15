import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Lock,
  Mic,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  createCheckIn,
  getTodayDateKey,
  logDoseAndAdjustSupply,
  updateMedicationApproval,
  updateMemberPermissions,
} from '../lib/careService';
import type {
  Appointment,
  CareMember,
  CareProfile,
  CheckIn,
  CheckInMood,
  DoseLog,
  DoseStatus,
  Medication,
  TimeSlot,
} from '../types/kincare';

interface SeniorModeViewProps {
  profile: CareProfile;
  currentUid: string;
  currentUserName: string;
  isOwnerOrSenior: boolean;
  members: CareMember[];
  medications: Medication[];
  doseLogs: DoseLog[];
  appointments: Appointment[];
  checkIns: CheckIn[];
  onRequestCaregiverUnlock: () => void;
  onReportError: (message: string, retryFn?: () => Promise<void>) => void;
}

const SLOT_ORDER: TimeSlot[] = ['morning', 'afternoon', 'evening', 'bedtime'];
const SLOT_LABELS: Record<TimeSlot, string> = {
  morning: 'Morning Routine',
  afternoon: 'Afternoon Routine',
  evening: 'Evening Routine',
  bedtime: 'Bedtime Routine',
};

const MOOD_OPTIONS: Array<{ id: CheckInMood; label: string }> = [
  { id: 'good', label: 'Feeling Good' },
  { id: 'tired', label: 'A Bit Tired' },
  { id: 'unwell', label: 'Feeling Unwell' },
  { id: 'pain', label: 'Pain or Discomfort' },
];

export function SeniorModeView({
  profile,
  currentUid,
  currentUserName,
  isOwnerOrSenior,
  members,
  medications,
  doseLogs,
  appointments,
  checkIns,
  onRequestCaregiverUnlock,
  onReportError,
}: SeniorModeViewProps) {
  const [largePrint, setLargePrint] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [busyMedId, setBusyMedId] = useState<string | null>(null);
  const [mood, setMood] = useState<CheckInMood>('good');
  const [energyLevel, setEnergyLevel] = useState<number>(4);
  const [checkInNote, setCheckInNote] = useState('');
  const [savingCheckIn, setSavingCheckIn] = useState(false);
  const [checkInSavedMsg, setCheckInSavedMsg] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const todayKey = getTodayDateKey();

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

  const pendingApprovals = useMemo(
    () => medications.filter((m) => m.approvalStatus === 'pending_senior'),
    [medications]
  );

  const upcomingAppts = useMemo(
    () => appointments.filter((a) => a.status === 'scheduled').slice(0, 3),
    [appointments]
  );

  const takenCount = approvedMeds.filter((m) => todayLogsMap.get(m.id)?.status === 'taken').length;

  function handleReadAloud() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onReportError('Voice read-aloud is not supported by this browser.');
      return;
    }

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const remaining = approvedMeds.filter((m) => todayLogsMap.get(m.id)?.status !== 'taken');
    const summaryText =
      remaining.length === 0
        ? `Hello ${profile.seniorName}. Great news: all ${approvedMeds.length} scheduled medications for today have been completed.`
        : `Hello ${profile.seniorName}. You have ${remaining.length} medication${
            remaining.length === 1 ? '' : 's'
          } remaining today. ` +
          remaining
            .map(
              (m) =>
                `At ${m.scheduledTime}, ${m.name}, ${m.dosage}. ${m.instructions || 'Take as directed.'}`
            )
            .join(' ');

    const utterance = new SpeechSynthesisUtterance(summaryText);
    utterance.rate = 0.92;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  function handleVoiceNote() {
    const win = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
      };
    };
    const Recognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!Recognition) {
      onReportError('Voice dictation is not supported in this browser. Please type your note below.');
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'en-US';
    setListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript || '';
      setCheckInNote((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
  }

  async function handleLogDose(med: Medication, nextStatus: DoseStatus) {
    const existingLog = todayLogsMap.get(med.id);
    const execute = async () => {
      setBusyMedId(med.id);
      try {
        await logDoseAndAdjustSupply({
          profileId: profile.profileId,
          medication: med,
          dateKey: todayKey,
          status: nextStatus,
          previousStatus: existingLog?.status,
          note: nextStatus === 'skipped' ? 'Marked skipped from Senior Care View' : '',
          actorUid: currentUid,
          actorName: currentUserName,
        });
      } catch (err) {
        onReportError(
          err instanceof Error ? err.message : 'Could not save medication status.',
          execute
        );
      } finally {
        setBusyMedId(null);
      }
    };
    await execute();
  }

  async function handleApprovalDecision(med: Medication, decision: 'approved' | 'paused') {
    const execute = async () => {
      setBusyMedId(med.id);
      try {
        await updateMedicationApproval(profile.profileId, med.id, decision);
      } catch (err) {
        onReportError(err instanceof Error ? err.message : 'Unable to save decision.', execute);
      } finally {
        setBusyMedId(null);
      }
    };
    await execute();
  }

  async function handleCheckInSubmit(e: FormEvent) {
    e.preventDefault();
    const execute = async () => {
      setSavingCheckIn(true);
      setCheckInSavedMsg(null);
      try {
        await createCheckIn({
          profileId: profile.profileId,
          mood,
          energyLevel,
          note: checkInNote,
          actorUid: currentUid,
          actorName: currentUserName,
        });
        setCheckInNote('');
        setCheckInSavedMsg('Saved to your daily wellness log.');
      } catch (err) {
        onReportError(err instanceof Error ? err.message : 'Could not save wellness check-in.', execute);
      } finally {
        setSavingCheckIn(false);
      }
    };
    await execute();
  }

  async function handleToggleMemberStatus(member: CareMember) {
    const nextStatus = member.status === 'active' ? 'paused' : 'active';
    const execute = async () => {
      try {
        await updateMemberPermissions(profile.profileId, member.uid, { status: nextStatus });
      } catch (err) {
        onReportError(err instanceof Error ? err.message : 'Could not update member access.', execute);
      }
    };
    await execute();
  }

  return (
    <div className={`max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8 ${largePrint ? 'text-lg' : 'text-base'}`}>
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <p className="text-sm font-medium text-teal-700">
            Senior Care Mode · {todayKey}
          </p>
          <h1 className={`font-display font-bold text-slate-900 mt-1 ${largePrint ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'}`}>
            Hello, {profile.seniorName}
          </h1>
          <p className="text-slate-600 mt-2">
            <span className="font-mono font-semibold tabular-nums text-slate-900">
              {takenCount} of {approvedMeds.length}
            </span>{' '}
            scheduled medications taken today.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleReadAloud}
            className="inline-flex items-center gap-2 px-4 py-3 min-h-[48px] text-sm font-semibold text-white bg-teal-700 rounded-xl hover:bg-teal-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            {speaking ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            {speaking ? 'Stop Reading' : 'Read My Routine Aloud'}
          </button>

          <button
            type="button"
            onClick={() => setLargePrint((v) => !v)}
            className="px-4 py-3 min-h-[48px] text-sm font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            Text Size: {largePrint ? 'Large' : 'Standard'}
          </button>

          <button
            type="button"
            onClick={onRequestCaregiverUnlock}
            className="inline-flex items-center gap-2 px-4 py-3 min-h-[48px] text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Lock className="w-4 h-4 text-slate-500" />
            Care Circle View
          </button>
        </div>
      </div>

      {/* Senior Approval Queue (Autonomy Centerpiece) */}
      {pendingApprovals.length > 0 && (
        <section aria-label="Medication proposals awaiting approval" className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900">
                Changes Waiting for Your Approval ({pendingApprovals.length})
              </h2>
              <p className="text-sm text-slate-700 mt-0.5">
                A family member or caretaker suggested these updates. Nothing becomes active until you approve it.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {pendingApprovals.map((med) => (
              <div
                key={med.id}
                className="bg-white border border-amber-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <h3 className="font-display font-semibold text-slate-900">
                    {med.name} · {med.dosage}
                  </h3>
                  <p className="text-sm text-slate-600 mt-1">
                    {med.scheduledTime} ({med.timeSlot}) · Proposed by {med.proposedByName}
                  </p>
                  {med.instructions && (
                    <p className="text-sm text-slate-700 mt-1">{med.instructions}</p>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    disabled={busyMedId === med.id || !isOwnerOrSenior}
                    onClick={() => handleApprovalDecision(med, 'approved')}
                    className="px-4 py-2.5 min-h-[48px] text-sm font-semibold text-white bg-teal-700 rounded-xl hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
                  >
                    Approve &amp; Add
                  </button>
                  <button
                    type="button"
                    disabled={busyMedId === med.id || !isOwnerOrSenior}
                    onClick={() => handleApprovalDecision(med, 'paused')}
                    className="px-4 py-2.5 min-h-[48px] text-sm font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 disabled:opacity-50 cursor-pointer"
                  >
                    Hold
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Daily Medications */}
      <section className="space-y-6">
        <h2 className="font-display text-2xl font-bold text-slate-900">
          Today&apos;s Medication Routine
        </h2>

        {approvedMeds.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-600">
            No active medications scheduled yet. Switch to Care Circle View with your 6-digit passcode to add prescriptions.
          </div>
        ) : (
          SLOT_ORDER.map((slot) => {
            const slotMeds = approvedMeds.filter((m) => m.timeSlot === slot);
            if (slotMeds.length === 0) return null;

            return (
              <div key={slot} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="font-display font-semibold text-slate-900 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-teal-700" />
                    {SLOT_LABELS[slot]}
                  </h3>
                  <span className="text-sm text-slate-500 tabular-nums">
                    {slotMeds.filter((m) => todayLogsMap.get(m.id)?.status === 'taken').length} / {slotMeds.length} taken
                  </span>
                </div>

                <div className="divide-y divide-slate-200">
                  {slotMeds.map((med) => {
                    const log = todayLogsMap.get(med.id);
                    const isTaken = log?.status === 'taken';
                    const isSkipped = log?.status === 'skipped';
                    const isBusy = busyMedId === med.id;

                    return (
                      <div
                        key={med.id}
                        className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-5"
                      >
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className="font-mono text-base font-semibold text-teal-700 tabular-nums">
                              {med.scheduledTime}
                            </span>
                            <h4 className={`font-display font-bold text-slate-900 ${largePrint ? 'text-xl' : 'text-lg'}`}>
                              {med.name}
                            </h4>
                            <span className="text-slate-600 font-medium">{med.dosage}</span>
                          </div>

                          <p className="text-slate-700">
                            {med.instructions || 'Take as prescribed.'}
                          </p>

                          <div className="text-sm text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                            {med.purpose && <span>For: {med.purpose}</span>}
                            {med.purpose && <span aria-hidden="true">·</span>}
                            <span>Appearance: {med.pillColor || 'Standard tablet'}</span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={`tabular-nums font-medium ${
                                med.pillsRemaining <= med.refillThreshold ? 'text-amber-700' : 'text-slate-600'
                              }`}
                            >
                              {med.pillsRemaining} pills left
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 shrink-0">
                          {isTaken ? (
                            <div className="flex items-center gap-3">
                              <span className="inline-flex items-center gap-2 px-4 py-3 min-h-[48px] rounded-xl bg-emerald-50 text-emerald-800 font-semibold text-sm border border-emerald-200">
                                <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                                Taken Today
                              </span>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleLogDose(med, 'missed')}
                                className="px-3 py-3 min-h-[48px] text-sm font-medium text-slate-600 hover:text-slate-900 underline cursor-pointer"
                              >
                                Undo
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleLogDose(med, 'taken')}
                                className="inline-flex items-center gap-2 px-6 py-3 min-h-[52px] text-base font-semibold text-white bg-teal-700 rounded-xl hover:bg-teal-800 disabled:opacity-60 transition-colors cursor-pointer"
                              >
                                <Check className="w-5 h-5" />
                                {isBusy ? 'Saving...' : 'I Took This'}
                              </button>

                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleLogDose(med, 'skipped')}
                                className={`inline-flex items-center gap-2 px-4 py-3 min-h-[52px] text-sm font-semibold rounded-xl border transition-colors cursor-pointer ${
                                  isSkipped
                                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <SkipForward className="w-4 h-4" />
                                {isSkipped ? 'Marked Skipped' : 'Skip'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Wellness Check-In & Appointments */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="font-display text-xl font-bold text-slate-900 mb-1">
            How Are You Feeling Today?
          </h2>
          <p className="text-sm text-slate-600 mb-5">
            Share a quick update with your care circle or save notes for your next doctor visit.
          </p>

          <form onSubmit={handleCheckInSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {MOOD_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMood(opt.id)}
                  className={`px-4 py-3 min-h-[48px] text-sm font-semibold rounded-xl border text-left transition-colors cursor-pointer ${
                    mood === opt.id
                      ? 'bg-teal-50 border-teal-700 text-teal-900'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between text-sm font-medium text-slate-700 mb-1.5">
                <span>Energy Level</span>
                <span className="font-mono tabular-nums">{energyLevel} / 5</span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                value={energyLevel}
                onChange={(e) => setEnergyLevel(Number(e.target.value))}
                className="w-full accent-teal-700 h-2 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Optional Note or Side Effects
                </label>
                <button
                  type="button"
                  onClick={handleVoiceNote}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  {listening ? 'Listening...' : 'Speak Note'}
                </button>
              </div>
              <textarea
                rows={3}
                maxLength={400}
                value={checkInNote}
                onChange={(e) => setCheckInNote(e.target.value)}
                placeholder="e.g. Slept well, slight dizziness when standing up after breakfast..."
                className="w-full px-3.5 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>

            {checkInSavedMsg && (
              <p className="text-sm font-medium text-emerald-700">{checkInSavedMsg}</p>
            )}

            <button
              type="submit"
              disabled={savingCheckIn}
              className="w-full sm:w-auto px-6 py-3 min-h-[48px] text-base font-semibold text-white bg-teal-700 rounded-xl hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
            >
              {savingCheckIn ? 'Saving Update...' : 'Save My Daily Check-In'}
            </button>
          </form>

          {checkIns.length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-200 space-y-2.5">
              <p className="text-xs font-semibold text-slate-500">Recent Check-Ins</p>
              {checkIns.slice(0, 3).map((item) => (
                <div key={item.id} className="text-sm text-slate-700 flex items-baseline justify-between gap-4">
                  <span>
                    <strong className="capitalize">{item.mood}</strong> · Energy {item.energyLevel}/5
                    {item.note ? ` — "${item.note}"` : ''}
                  </span>
                  <span className="text-xs text-slate-500 shrink-0">{item.authorName}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="lg:col-span-5 space-y-6">
          <section className="bg-white border border-slate-200 rounded-2xl p-6">
            <h2 className="font-display text-xl font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-teal-700" />
              Upcoming Appointments
            </h2>

            {upcomingAppts.length === 0 ? (
              <p className="text-sm text-slate-600">No upcoming doctor appointments scheduled.</p>
            ) : (
              <div className="space-y-4">
                {upcomingAppts.map((appt) => (
                  <div key={appt.id} className="pb-4 last:pb-0 border-b last:border-b-0 border-slate-200">
                    <p className="font-semibold text-slate-900">{appt.title}</p>
                    <p className="text-sm text-slate-600 mt-0.5">
                      {appt.doctorName} ·{' '}
                      <span className="font-mono tabular-nums">
                        {appt.appointmentDate} at {appt.appointmentTime}
                      </span>
                    </p>
                    {appt.location && <p className="text-sm text-slate-500 mt-0.5">{appt.location}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-6">
            <h2 className="font-display text-xl font-bold text-slate-900 mb-1">
              Who Helps With My Care
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              Care Code: <span className="font-mono font-semibold text-slate-900">{profile.careCode}</span>
            </p>
            <div className="divide-y divide-slate-200">
              {members.map((member) => (
                <div key={member.uid} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{member.displayName}</p>
                    <p className="text-xs text-slate-500">
                      {member.relationship} · {member.role} ·{' '}
                      {member.status === 'active' ? 'Active' : 'Paused'}
                    </p>
                  </div>
                  {isOwnerOrSenior && member.uid !== currentUid && (
                    <button
                      type="button"
                      onClick={() => handleToggleMemberStatus(member)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer shrink-0"
                    >
                      {member.status === 'active' ? (
                        <>
                          <PauseCircle className="w-4 h-4 text-amber-700" />
                          Pause Access
                        </>
                      ) : (
                        <>
                          <PlayCircle className="w-4 h-4 text-emerald-700" />
                          Restore
                        </>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
