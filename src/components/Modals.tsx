import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Camera, KeyRound, Mail, Sparkles, X } from 'lucide-react';
import { dispatchProactiveEmail, parsePrescriptionLabel } from '../lib/api';
import { computePasscodeVerifier } from '../lib/firebase';
import { recordEmailLog, upsertAppointment, upsertMedication } from '../lib/careService';
import type {
  Appointment,
  AppointmentStatus,
  CareMember,
  CareProfile,
  EmailAlertType,
  Medication,
  TimeSlot,
} from '../types/kincare';

export function PasscodeUnlockModal({
  profile,
  onClose,
  onUnlocked,
}: {
  profile: CareProfile;
  onClose: () => void;
  onUnlocked: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit Care Passcode.');
      return;
    }
    setChecking(true);
    try {
      const candidate = await computePasscodeVerifier(profile.passcodeSalt, code.trim());
      if (candidate !== profile.passcodeVerifier) {
        setError('Incorrect 6-digit Care Passcode. Please try again.');
        return;
      }
      onUnlocked();
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-teal-700" />
            Unlock Care Circle View
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close passcode dialog"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-slate-600 mb-4">
          Enter the 6-digit Care Passcode for <strong>{profile.seniorName}</strong> ({profile.careCode}) to switch into Care Circle editing mode.
        </p>

        {error && (
          <div role="alert" className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            className="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.4em] border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-700"
          />

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Stay in Senior Mode
            </button>
            <button
              type="submit"
              disabled={checking}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
            >
              {checking ? 'Verifying...' : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function MedicationModal({
  profile,
  actorUid,
  actorName,
  isOwnerOrSenior,
  existing,
  onClose,
  onSaved,
}: {
  profile: CareProfile;
  actorUid: string;
  actorName: string;
  isOwnerOrSenior: boolean;
  existing?: Medication;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name || '');
  const [dosage, setDosage] = useState(existing?.dosage || '');
  const [frequency, setFrequency] = useState(existing?.frequency || 'Once daily');
  const [timeSlot, setTimeSlot] = useState<TimeSlot>(existing?.timeSlot || 'morning');
  const [scheduledTime, setScheduledTime] = useState(existing?.scheduledTime || '08:00');
  const [instructions, setInstructions] = useState(existing?.instructions || '');
  const [purpose, setPurpose] = useState(existing?.purpose || '');
  const [prescriber, setPrescriber] = useState(existing?.prescriber || profile.doctorName || '');
  const [pillColor, setPillColor] = useState(existing?.pillColor || 'White Tablet');
  const [pillsRemaining, setPillsRemaining] = useState(String(existing?.pillsRemaining ?? 30));
  const [refillThreshold, setRefillThreshold] = useState(String(existing?.refillThreshold ?? 7));

  const [labelText, setLabelText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleParseText() {
    if (!labelText.trim()) {
      setError('Paste prescription label text or upload a pill bottle photo first.');
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const extracted = await parsePrescriptionLabel({ labelText });
      applyExtracted(extracted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to parse prescription text.');
    } finally {
      setScanning(false);
    }
  }

  function applyExtracted(extracted: {
    name: string;
    dosage: string;
    frequency: string;
    timeSlot: TimeSlot;
    scheduledTime: string;
    instructions: string;
    purpose: string;
    prescriber: string;
    pillsRemaining: number;
  }) {
    if (extracted.name) setName(extracted.name);
    if (extracted.dosage) setDosage(extracted.dosage);
    if (extracted.frequency) setFrequency(extracted.frequency);
    if (['morning', 'afternoon', 'evening', 'bedtime'].includes(extracted.timeSlot)) {
      setTimeSlot(extracted.timeSlot);
    }
    if (/^\d{2}:\d{2}$/.test(extracted.scheduledTime)) {
      setScheduledTime(extracted.scheduledTime);
    }
    if (extracted.instructions) setInstructions(extracted.instructions);
    if (extracted.purpose) setPurpose(extracted.purpose);
    if (extracted.prescriber) setPrescriber(extracted.prescriber);
    if (Number.isFinite(extracted.pillsRemaining)) {
      setPillsRemaining(String(Math.max(0, extracted.pillsRemaining)));
    }
  }

  async function handleImageUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please upload a JPG, PNG, or WebP photo of the prescription label.');
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read selected image file.'));
        reader.readAsDataURL(file);
      });
      const extracted = await parsePrescriptionLabel({
        labelText,
        imageBase64: base64,
        mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
      });
      applyExtracted(extracted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan prescription image.');
    } finally {
      setScanning(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !dosage.trim()) {
      setError('Medication name and dosage are required.');
      return;
    }

    setSaving(true);
    try {
      await upsertMedication({
        profile,
        actorUid,
        actorName,
        isOwnerOrSenior,
        existingId: existing?.id,
        data: {
          name,
          dosage,
          frequency,
          timeSlot,
          scheduledTime,
          instructions,
          purpose,
          prescriber,
          pillColor,
          pillsRemaining: Number(pillsRemaining) || 0,
          refillThreshold: Number(refillThreshold) || 7,
          aiSummary: existing?.aiSummary || '',
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save medication.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-lg my-8">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              {existing ? `Edit ${existing.name}` : 'Add Medication to Schedule'}
            </h2>
            {!isOwnerOrSenior && profile.requireSeniorApproval && (
              <p className="text-xs text-amber-700 mt-0.5">
                Senior Approval Mode is on: this update will wait for {profile.seniorName}&apos;s approval.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close medication modal"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* AI Prescription Scanner */}
          {!existing && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-teal-700" />
                  AI Prescription Label &amp; Bottle Scanner
                </p>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-white border border-teal-200 rounded-lg hover:bg-teal-50 cursor-pointer">
                  <Camera className="w-3.5 h-3.5" />
                  {scanning ? 'Scanning...' : 'Upload Bottle Photo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageUpload}
                    disabled={scanning}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={labelText}
                  onChange={(e) => setLabelText(e.target.value)}
                  placeholder="Or paste label text (e.g. 'Eliquis 5mg Take 1 tablet twice daily with water, Qty 60, Dr. Patel')"
                  className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
                <button
                  type="button"
                  onClick={handleParseText}
                  disabled={scanning}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                >
                  {scanning ? 'Parsing...' : 'Auto-Fill'}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Medication Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Lisinopril"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Dosage</label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={dosage}
                  onChange={(e) => setDosage(e.target.value)}
                  placeholder="e.g. 10 mg (1 tablet)"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Time Slot</label>
                <select
                  value={timeSlot}
                  onChange={(e) => setTimeSlot(e.target.value as TimeSlot)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                >
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                  <option value="bedtime">Bedtime</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Scheduled Time
                </label>
                <input
                  type="time"
                  required
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Frequency</label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  placeholder="Once daily"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Plain-Language Instructions
              </label>
              <input
                type="text"
                maxLength={300}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Take with breakfast and a full glass of water"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Purpose</label>
                <input
                  type="text"
                  maxLength={200}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Blood pressure support"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Prescribing Doctor
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={prescriber}
                  onChange={(e) => setPrescriber(e.target.value)}
                  placeholder="Dr. Hannah Lin"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Pill Appearance
                </label>
                <input
                  type="text"
                  maxLength={30}
                  value={pillColor}
                  onChange={(e) => setPillColor(e.target.value)}
                  placeholder="e.g. Small Peach Oval"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Pills Remaining
                </label>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={pillsRemaining}
                  onChange={(e) => setPillsRemaining(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Refill Alert At
                </label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={refillThreshold}
                  onChange={(e) => setRefillThreshold(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
              >
                {saving ? 'Saving...' : existing ? 'Save Changes' : 'Add Medication'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export function AppointmentModal({
  profileId,
  actorUid,
  existing,
  onClose,
  onSaved,
}: {
  profileId: string;
  actorUid: string;
  existing?: Appointment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(
    tomorrow.getDate()
  ).padStart(2, '0')}`;

  const [title, setTitle] = useState(existing?.title || '');
  const [doctorName, setDoctorName] = useState(existing?.doctorName || '');
  const [specialty, setSpecialty] = useState(existing?.specialty || '');
  const [location, setLocation] = useState(existing?.location || '');
  const [appointmentDate, setAppointmentDate] = useState(existing?.appointmentDate || defaultDate);
  const [appointmentTime, setAppointmentTime] = useState(existing?.appointmentTime || '10:00');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [status, setStatus] = useState<AppointmentStatus>(existing?.status || 'scheduled');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !doctorName.trim()) {
      setError('Appointment title and doctor name are required.');
      return;
    }

    setSaving(true);
    try {
      await upsertAppointment({
        profileId,
        actorUid,
        existingId: existing?.id,
        data: {
          title,
          doctorName,
          specialty,
          location,
          appointmentDate,
          appointmentTime,
          notes,
          status,
          prepBrief: existing?.prepBrief || '',
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save appointment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-lg my-8">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-slate-900">
            {existing ? 'Edit Medical Appointment' : 'Schedule Medical Appointment'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close appointment modal"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Visit Title</label>
            <input
              type="text"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Cardiology Follow-Up & Lab Review"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Doctor Name</label>
              <input
                type="text"
                required
                maxLength={80}
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="Dr. Hannah Lin"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Specialty</label>
              <input
                type="text"
                maxLength={80}
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="Cardiology"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input
                type="date"
                required
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
              <input
                type="time"
                required
                value={appointmentTime}
                onChange={(e) => setAppointmentTime(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Clinic / Hospital Location
            </label>
            <input
              type="text"
              maxLength={160}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Oakridge Medical Center, Room 304"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Questions / Notes for Visit
            </label>
            <textarea
              rows={3}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Check morning blood pressure log and confirm refill dosage."
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </div>

          {existing && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SendEmailReminderModal({
  profile,
  members,
  actorUid,
  onClose,
  onSent,
}: {
  profile: CareProfile;
  members: CareMember[];
  actorUid: string;
  onClose: () => void;
  onSent: (smtpWarning?: string) => void;
}) {
  const defaultRecipients = members
    .filter((m) => m.status === 'active' && m.alertEmail)
    .map((m) => m.alertEmail);

  const [type, setType] = useState<EmailAlertType>('manual_test');
  const [recipientsRaw, setRecipientsRaw] = useState(defaultRecipients.join(', '));
  const [subject, setSubject] = useState(
    `KinCare Update for ${profile.seniorName}: Daily Care & Medication Check`
  );
  const [messageText, setMessageText] = useState(
    `Hello Care Circle,\nThis is a proactive update regarding ${profile.seniorName}'s medication routine and upcoming medical schedule.`
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const recipients = recipientsRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.includes('@'));

    if (recipients.length === 0) {
      setError('Enter at least one valid recipient email address.');
      return;
    }

    setSending(true);
    try {
      const res = await dispatchProactiveEmail({
        seniorName: profile.seniorName,
        careCode: profile.careCode,
        type,
        subject,
        messageText,
        recipients,
      });

      await recordEmailLog({
        profileId: profile.profileId,
        alertKey: `manual_${Date.now()}`,
        type,
        recipients,
        subject,
        bodyPreview: messageText,
        deliveryMode: res.deliveryMode,
        status: res.status,
        actorUid,
      });
      onSent(res.smtpWarning);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send email reminder.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-lg my-8">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
            <Mail className="w-5 h-5 text-teal-700" />
            Send Care Circle Email Reminder
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close email modal"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Alert Category</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as EmailAlertType)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="manual_test">Care Circle Notice</option>
              <option value="upcoming_dose">Upcoming Dose Reminder</option>
              <option value="missed_dose">Missed Dose Alert</option>
              <option value="appointment_reminder">Appointment Reminder</option>
              <option value="refill_warning">Refill Warning</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Recipient Emails (comma-separated)
            </label>
            <input
              type="text"
              required
              value={recipientsRaw}
              onChange={(e) => setRecipientsRaw(e.target.value)}
              placeholder="daughter@example.com, caretaker@example.com"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
            <input
              type="text"
              required
              maxLength={160}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
            <textarea
              rows={4}
              required
              maxLength={1200}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="px-5 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
            >
              {sending ? 'Dispatching...' : 'Send Email Reminder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
