import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  HeartHandshake,
  LogOut,
  Plus,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import { DASHBOARD_NAV_ITEMS } from './components/dashboardNav';
import type { DashboardTab } from './components/dashboardNav';
import { LandingView } from './components/LandingView';
import { fetchServerHealth } from './lib/api';
import {
  ensureUserRecord,
  subscribeCareWorkspace,
  subscribeUserMemberships,
} from './lib/careService';
import { auth, googleProvider } from './lib/firebase';
import { runProactiveAlertSweep } from './lib/reminderEngine';

const CaregiverDashboard = lazy(() =>
  import('./components/CaregiverDashboard').then((m) => ({ default: m.CaregiverDashboard }))
);
const SeniorModeView = lazy(() =>
  import('./components/SeniorModeView').then((m) => ({ default: m.SeniorModeView }))
);
const OnboardingModal = lazy(() =>
  import('./components/OnboardingModal').then((m) => ({ default: m.OnboardingModal }))
);
const PasscodeUnlockModal = lazy(() =>
  import('./components/Modals').then((m) => ({ default: m.PasscodeUnlockModal }))
);
import type {
  Appointment,
  CareMember,
  CareProfile,
  CheckIn,
  DoseLog,
  EmailLog,
  Medication,
  UserMembership,
} from './types/kincare';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [memberships, setMemberships] = useState<UserMembership[]>([]);
  const [membershipsLoaded, setMembershipsLoaded] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  const [profile, setProfile] = useState<CareProfile | null>(null);
  const [members, setMembers] = useState<CareMember[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [doseLogs, setDoseLogs] = useState<DoseLog[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);

  const [viewMode, setViewMode] = useState<'senior' | 'caregiver'>('caregiver');
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState(false);

  const [errorBanner, setErrorBanner] = useState<{
    message: string;
    retryFn?: () => Promise<void>;
  } | null>(null);

  // Check server health & SMTP status
  useEffect(() => {
    fetchServerHealth().then((h) => setSmtpConfigured(h.smtpConfigured));
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        try {
          await ensureUserRecord(nextUser);
        } catch (err) {
          setErrorBanner({
            message: err instanceof Error ? err.message : 'Unable to sync user profile.',
          });
        }
      } else {
        setMemberships([]);
        setMembershipsLoaded(false);
        setActiveProfileId(null);
        setProfile(null);
      }
    });
    return unsub;
  }, []);

  // Subscribe to user's joined care profiles
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeUserMemberships(
      user.uid,
      (list) => {
        setMemberships(list);
        setMembershipsLoaded(true);
        setActiveProfileId((prev) => {
          if (prev && list.some((m) => m.profileId === prev)) return prev;
          return list[0]?.profileId ?? null;
        });
      },
      (err) => {
        setMembershipsLoaded(true);
        setErrorBanner({ message: err.message });
      }
    );
    return unsub;
  }, [user]);

  // Subscribe to active CareProfile workspace
  useEffect(() => {
    if (!user || !activeProfileId) {
      setProfile(null);
      return;
    }

    const unsub = subscribeCareWorkspace(activeProfileId, {
      onProfile: (p) => {
        setProfile(p);
        if (p) {
          const myMembership = memberships.find((m) => m.profileId === p.profileId);
          if (myMembership?.role === 'elderly') {
            setViewMode('senior');
          }
        }
      },
      onMembers: setMembers,
      onMedications: setMedications,
      onDoseLogs: setDoseLogs,
      onAppointments: setAppointments,
      onCheckIns: setCheckIns,
      onEmailLogs: setEmailLogs,
      onError: (err) => setErrorBanner({ message: err.message }),
    });

    return unsub;
  }, [user, activeProfileId]);

  // Keep latest workspace state in a ref so the 60s alert sweep interval is stable and non-overlapping
  const sweepStateRef = useRef({
    user,
    profile,
    members,
    medications,
    doseLogs,
    appointments,
    emailLogs,
  });
  sweepStateRef.current = {
    user,
    profile,
    members,
    medications,
    doseLogs,
    appointments,
    emailLogs,
  };
  const sweepInFlightRef = useRef(false);

  // Automatic proactive email alert evaluator (runs quietly every 60s when workspace is open)
  useEffect(() => {
    if (!user || !activeProfileId) return;

    const timer = window.setInterval(() => {
      const current = sweepStateRef.current;
      if (!current.user || !current.profile || current.members.length === 0 || sweepInFlightRef.current) {
        return;
      }
      sweepInFlightRef.current = true;
      runProactiveAlertSweep({
        profile: current.profile,
        members: current.members,
        medications: current.medications,
        doseLogs: current.doseLogs,
        appointments: current.appointments,
        emailLogs: current.emailLogs,
        actorUid: current.user.uid,
      })
        .catch(() => {
          // Silent background sweep retry on next tick; manual sweep reports explicit UI errors
        })
        .finally(() => {
          sweepInFlightRef.current = false;
        });
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [user, activeProfileId]);

  const currentMember = useMemo(
    () => members.find((m) => m.uid === user?.uid),
    [members, user?.uid]
  );

  async function handleGoogleSignIn() {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Google Sign-In was cancelled or failed.'
      );
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-600">Loading KinCare...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <LandingView
        onSignIn={handleGoogleSignIn}
        signingIn={signingIn}
        authError={authError}
      />
    );
  }

  const needsOnboarding = membershipsLoaded && memberships.length === 0;
  const currentUserName =
    user.displayName || user.email?.split('@')[0] || 'Care Member';

  // Paused member notice
  if (currentMember && currentMember.status === 'paused') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-8 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-amber-700 mx-auto" />
          <h1 className="font-display text-xl font-bold text-slate-900">
            Care Circle Access Paused
          </h1>
          <p className="text-sm text-slate-600">
            Your access to this care profile has been paused by the elderly profile owner. Contact them directly to restore access.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOnboardingOpen(true)}
              className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg cursor-pointer"
            >
              Join Another Profile
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-teal-700 focus:text-white focus:rounded-lg focus:text-sm focus:font-semibold"
      >
        Skip to main content
      </a>
      {/* Persistent Accessible Error / Retry Banner */}
      {errorBanner && (
        <div
          role="alert"
          className="bg-red-50 border-b border-red-200 px-6 py-3 text-sm text-red-900 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
            <span>{errorBanner.message}</span>
          </div>
          <div className="flex items-center gap-2">
            {errorBanner.retryFn && (
              <button
                type="button"
                onClick={async () => {
                  const fn = errorBanner.retryFn;
                  setErrorBanner(null);
                  if (fn) await fn();
                }}
                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-red-700 rounded-md hover:bg-red-800 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Save
              </button>
            )}
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="px-2.5 py-1 text-xs font-medium text-red-800 hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Workspace Layout */}
      <div className="flex-1 flex">
        {/* Sidebar (Caregiver Mode Desktop) */}
        {profile && viewMode === 'caregiver' && (
          <aside className="hidden lg:flex w-60 bg-white border-r border-slate-200 flex-col justify-between shrink-0">
            <div>
              <div className="h-16 px-6 flex items-center border-b border-slate-200">
                <span className="font-display text-lg font-bold tracking-tight text-slate-900">
                  KinCare
                </span>
              </div>

              <div className="p-4 space-y-1">
                {DASHBOARD_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                        active
                          ? 'bg-teal-50 text-teal-800'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${active ? 'text-teal-700' : 'text-slate-400'}`} />
                      <span className="whitespace-nowrap">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 space-y-3">
              <button
                type="button"
                onClick={() => setViewMode('senior')}
                className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 cursor-pointer"
              >
                <UserCheck className="w-4 h-4" />
                Open Senior Care View
              </button>
              <button
                type="button"
                onClick={() => setOnboardingOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                New or Join Profile
              </button>
            </div>
          </aside>
        )}

        {/* Main Viewport */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Contextual Bar */}
          <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {(!profile || viewMode === 'senior') && (
                <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
                  KinCare
                </span>
              )}
              {profile && (
                <div className="flex items-center gap-2 text-sm text-slate-600 truncate">
                  {memberships.length > 1 ? (
                    <select
                      aria-label="Switch care profile"
                      value={activeProfileId || ''}
                      onChange={(e) => setActiveProfileId(e.target.value)}
                      className="font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-sm"
                    >
                      {memberships.map((m) => (
                        <option key={m.profileId} value={m.profileId}>
                          {m.seniorName} ({m.careCode})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-semibold text-slate-900 truncate">
                      {profile.seniorName}
                    </span>
                  )}
                  <span className="hidden sm:inline text-slate-300">/</span>
                  <span className="hidden sm:inline font-mono text-xs text-slate-500">
                    {profile.careCode}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {profile && viewMode === 'caregiver' && (
                <button
                  type="button"
                  onClick={() => setViewMode('senior')}
                  className="lg:hidden px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  Senior View
                </button>
              )}

              <button
                type="button"
                onClick={() => setOnboardingOpen(true)}
                className="lg:hidden px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
              >
                + Profile
              </button>

              <span className="hidden md:inline text-xs text-slate-500 truncate max-w-[160px]">
                {currentUserName}
              </span>

              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </header>

          {/* Content */}
          <main id="main-content" className="flex-1 p-4 sm:p-6 max-w-6xl w-full mx-auto">
            {!membershipsLoaded ? (
              <div className="py-20 text-center text-sm text-slate-500">
                Loading care profiles...
              </div>
            ) : !profile || !currentMember ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center max-w-lg mx-auto mt-10 space-y-4">
                <HeartHandshake className="w-10 h-10 text-teal-700 mx-auto" />
                <h1 className="font-display text-2xl font-bold text-slate-900">
                  Welcome to KinCare
                </h1>
                <p className="text-sm text-slate-600">
                  Create a new elderly care profile protected by a 6-digit Care Passcode, or join a loved one&apos;s Care Circle using their Care Code.
                </p>
                <button
                  type="button"
                  onClick={() => setOnboardingOpen(true)}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-xl hover:bg-teal-800 cursor-pointer"
                >
                  Create or Join Care Profile
                </button>
              </div>
            ) : (
              <Suspense
                fallback={
                  <div className="py-16 text-center text-sm text-slate-500">
                    Loading care workspace...
                  </div>
                }
              >
                {viewMode === 'senior' ? (
                  <SeniorModeView
                    profile={profile}
                    currentUid={user.uid}
                    currentUserName={currentUserName}
                    isOwnerOrSenior={
                      profile.ownerId === user.uid || currentMember.role === 'elderly'
                    }
                    members={members}
                    medications={medications}
                    doseLogs={doseLogs}
                    appointments={appointments}
                    checkIns={checkIns}
                    onRequestCaregiverUnlock={() => setUnlockModalOpen(true)}
                    onReportError={(message, retryFn) => setErrorBanner({ message, retryFn })}
                  />
                ) : (
                  <CaregiverDashboard
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    profile={profile}
                    currentUid={user.uid}
                    currentUserName={currentUserName}
                    currentMember={currentMember}
                    members={members}
                    medications={medications}
                    doseLogs={doseLogs}
                    appointments={appointments}
                    checkIns={checkIns}
                    emailLogs={emailLogs}
                    smtpConfigured={smtpConfigured}
                    onReportError={(message, retryFn) => setErrorBanner({ message, retryFn })}
                  />
                )}
              </Suspense>
            )}
          </main>
        </div>
      </div>

      <Suspense fallback={null}>
        {(needsOnboarding || onboardingOpen) && (
          <OnboardingModal
            user={user}
            canClose={!needsOnboarding}
            onClose={() => setOnboardingOpen(false)}
            onSuccess={(newId) => {
              setActiveProfileId(newId);
              setOnboardingOpen(false);
            }}
          />
        )}

        {unlockModalOpen && profile && (
          <PasscodeUnlockModal
            profile={profile}
            onClose={() => setUnlockModalOpen(false)}
            onUnlocked={() => {
              setUnlockModalOpen(false);
              setViewMode('caregiver');
            }}
          />
        )}
      </Suspense>
    </div>
  );
}
