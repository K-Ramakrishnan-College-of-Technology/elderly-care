import { useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { KeyRound, PlusCircle, ShieldCheck, X } from 'lucide-react';
import { createCareProfile, joinCareProfileWithPasscode } from '../lib/careService';
import type { MemberRole } from '../types/kincare';

interface OnboardingModalProps {
  user: User;
  canClose: boolean;
  onClose: () => void;
  onSuccess: (profileId: string) => void;
}

export function OnboardingModal({ user, canClose, onClose, onSuccess }: OnboardingModalProps) {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create profile fields
  const [seniorName, setSeniorName] = useState('');
  const [age, setAge] = useState('74');
  const [passcode, setPasscode] = useState('');
  const [creatorRole, setCreatorRole] = useState<MemberRole>('family');
  const [relationship, setRelationship] = useState('Daughter / Family Caregiver');
  const [requireSeniorApproval, setRequireSeniorApproval] = useState(true);
  const [allergies, setAllergies] = useState('Penicillin');
  const [conditions, setConditions] = useState('Mild hypertension, Type 2 diabetes');
  const [doctorName, setDoctorName] = useState('Dr. Hannah Lin');
  const [doctorEmail, setDoctorEmail] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [includeStarterRoutine, setIncludeStarterRoutine] = useState(true);

  // Join profile fields
  const [joinCareCode, setJoinCareCode] = useState('');
  const [joinPasscode, setJoinPasscode] = useState('');
  const [joinRole, setJoinRole] = useState<'caretaker' | 'family'>('family');
  const [joinRelationship, setJoinRelationship] = useState('Family Member');
  const [joinEmail, setJoinEmail] = useState(user.email || '');

  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!seniorName.trim()) {
      setError("Please enter the elderly person's full name.");
      return;
    }
    if (!/^\d{6}$/.test(passcode.trim())) {
      setError('Care Passcode must be exactly 6 digits (e.g., 482910).');
      return;
    }

    setBusy(true);
    try {
      const { profileId } = await createCareProfile({
        user,
        seniorName,
        age: Number(age) || 74,
        passcode: passcode.trim(),
        creatorRole,
        relationship: creatorRole === 'elderly' ? 'Self' : relationship,
        requireSeniorApproval,
        allergies,
        conditions,
        doctorName,
        doctorEmail,
        emergencyContactName,
        emergencyContactPhone,
        includeStarterRoutine,
      });
      onSuccess(profileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create care profile. Please retry.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^[A-Za-z0-9-]{4,16}$/.test(joinCareCode.trim())) {
      setError('Please enter a valid Care Code (for example, KIN-4F8A).');
      return;
    }
    if (!/^\d{6}$/.test(joinPasscode.trim())) {
      setError('Please enter the 6-digit Care Passcode.');
      return;
    }

    setBusy(true);
    try {
      const { profileId } = await joinCareProfileWithPasscode({
        user,
        careCode: joinCareCode.trim().toUpperCase(),
        passcode: joinPasscode.trim(),
        role: joinRole,
        relationship: joinRelationship,
        alertEmail: joinEmail,
      });
      onSuccess(profileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to join Care Circle.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-dialog-title"
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-lg my-8">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 id="onboarding-dialog-title" className="font-display text-xl font-bold text-slate-900">
              Set Up or Join a Care Profile
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Signed in as {user.displayName || user.email}
            </p>
          </div>
          {canClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="px-6 pt-5">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setTab('create');
                setError(null);
              }}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tab === 'create'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Create Care Profile
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('join');
                setError(null);
              }}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tab === 'join'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Join with Passcode
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mx-6 mt-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {tab === 'create' ? (
          <form onSubmit={handleCreateSubmit} className="p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Elderly Person&apos;s Full Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={seniorName}
                  onChange={(e) => setSeniorName(e.target.value)}
                  placeholder="e.g. Elena Vance"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Age</label>
                <input
                  type="number"
                  required
                  min={18}
                  max={125}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Your Role</label>
                <select
                  value={creatorRole}
                  onChange={(e) => setCreatorRole(e.target.value as MemberRole)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                >
                  <option value="elderly">I am the Elderly Individual (Self-Managed)</option>
                  <option value="family">Family Member</option>
                  <option value="caretaker">Professional Caretaker</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  6-Digit Care Passcode
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6 digits (e.g. 482910)"
                  className="w-full px-3.5 py-2.5 text-sm font-mono tracking-widest border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
            </div>

            {creatorRole !== 'elderly' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Relationship to Senior
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  placeholder="e.g. Daughter, Son, Visiting Nurse"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Known Allergies
                </label>
                <input
                  type="text"
                  maxLength={400}
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder="e.g. Penicillin, Sulfa"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Key Health Conditions
                </label>
                <input
                  type="text"
                  maxLength={400}
                  value={conditions}
                  onChange={(e) => setConditions(e.target.value)}
                  placeholder="e.g. Hypertension, Arthritis"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Primary Doctor
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  placeholder="Dr. Hannah Lin"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Emergency Contact
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  placeholder="Name"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Emergency Phone
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  placeholder="(555) 234-5678"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireSeniorApproval}
                  onChange={(e) => setRequireSeniorApproval(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                />
                <div className="text-sm">
                  <span className="font-medium text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-teal-700" />
                    Require Elderly Approval for Caretaker Medication Changes
                  </span>
                  <span className="block text-slate-600 text-xs mt-0.5">
                    Keeps the elderly individual at the center of healthcare decisions before new edits go live.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeStarterRoutine}
                  onChange={(e) => setIncludeStarterRoutine(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                />
                <div className="text-sm">
                  <span className="font-medium text-slate-900">
                    Include a sample daily medication &amp; appointment starter schedule
                  </span>
                  <span className="block text-slate-600 text-xs mt-0.5">
                    Preloads 3 example prescriptions and 1 upcoming doctor visit you can edit or remove anytime.
                  </span>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
              {canClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                {busy ? 'Creating Profile...' : 'Create Care Profile'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleJoinSubmit} className="p-6 space-y-5">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700">
              Enter the Care Code (for example <span className="font-mono font-semibold">KIN-8F2A</span>)
              and the 6-digit Passcode shared by the elderly person or primary caretaker.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Care Code</label>
                <input
                  type="text"
                  required
                  maxLength={16}
                  value={joinCareCode}
                  onChange={(e) => setJoinCareCode(e.target.value.toUpperCase())}
                  placeholder="KIN-XXXX"
                  className="w-full px-3.5 py-2.5 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  6-Digit Passcode
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={joinPasscode}
                  onChange={(e) => setJoinPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  className="w-full px-3.5 py-2.5 text-sm font-mono tracking-widest border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Care Role</label>
                <select
                  value={joinRole}
                  onChange={(e) => setJoinRole(e.target.value as 'caretaker' | 'family')}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                >
                  <option value="family">Family Member</option>
                  <option value="caretaker">Caretaker / Nurse</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Relationship
                </label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={joinRelationship}
                  onChange={(e) => setJoinRelationship(e.target.value)}
                  placeholder="e.g. Son, Home Aide"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Alert Email Address (for missed doses &amp; appointment reminders)
              </label>
              <input
                type="email"
                required
                maxLength={120}
                value={joinEmail}
                onChange={(e) => setJoinEmail(e.target.value)}
                placeholder="family@example.com"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
              {canClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                {busy ? 'Verifying Passcode...' : 'Unlock & Join Care Circle'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
