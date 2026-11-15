import { useState } from 'react';
import {
  BellRing,
  CalendarCheck,
  HeartHandshake,
  KeyRound,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';

interface LandingViewProps {
  onSignIn: () => Promise<void>;
  signingIn: boolean;
  authError: string | null;
}

export function LandingView({ onSignIn, signingIn, authError }: LandingViewProps) {
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            KinCare
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#routine" className="hover:text-teal-700 transition-colors whitespace-nowrap shrink-0">
              Daily Routine
            </a>
            <a href="#care-circle" className="hover:text-teal-700 transition-colors whitespace-nowrap shrink-0">
              Care Circle
            </a>
            <a href="#email-alerts" className="hover:text-teal-700 transition-colors whitespace-nowrap shrink-0">
              Email Alerts
            </a>
            <a href="#autonomy" className="hover:text-teal-700 transition-colors whitespace-nowrap shrink-0">
              Senior Autonomy
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onSignIn}
              disabled={signingIn}
              className="px-4 py-2 min-h-[40px] text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {signingIn ? 'Signing in...' : 'Sign in with Google'}
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero Split */}
        <section className="max-w-7xl mx-auto px-6 pt-12 pb-16">
          {authError && (
            <div
              role="alert"
              className="mb-8 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between gap-4"
            >
              <span>{authError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center py-4">
              <p className="text-sm font-medium text-teal-700 mb-3">
                Collaborative Elderly Care · Passcode Protected · Senior-Centered
              </p>
              <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.12] [text-wrap:balance] mb-5">
                Shared medication clarity that keeps older adults in charge.
              </h1>
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl mb-8">
                KinCare connects elderly individuals, family members, and caretakers around one calm
                healthcare profile. Manage daily medications, doctor visits, proactive email reminders,
                and AI-assisted visit briefs—protected by a 6-digit Care Passcode and senior consent controls.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={onSignIn}
                  disabled={signingIn}
                  className="px-6 py-3 min-h-[48px] text-base font-semibold text-white bg-teal-700 rounded-xl hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {signingIn ? 'Connecting Account...' : 'Start or Join a Care Circle'}
                </button>
                <a
                  href="#autonomy"
                  className="px-5 py-3 min-h-[48px] inline-flex items-center text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Explore Senior Mode
                </a>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-200 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
                <span>6-Digit Care Passcode Access</span>
                <span aria-hidden="true">·</span>
                <span>Proactive Missed-Dose Email Alerts</span>
                <span aria-hidden="true">·</span>
                <span>AI Prescription &amp; Visit Prep</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[340px] lg:min-h-[440px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-100">
                {!heroImgFailed ? (
                  <img
                    src="/src/assets/images/hero_care_circle_1794738807858.jpg"
                    alt="An elderly woman and her daughter sitting at a sunlit table reviewing a weekly medication organizer and care notebook together"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-slate-100 to-teal-50">
                    <HeartHandshake className="w-12 h-12 text-teal-700 mb-3" />
                    <p className="font-display text-lg font-semibold text-slate-800">
                      Connected Family Care Circle
                    </p>
                    <p className="text-sm text-slate-600 max-w-sm mt-1">
                      Daily medication schedules, appointment tracking, and gentle email alerts.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4-Column Capability Strip Below Hero Split */}
          <div
            id="routine"
            className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <UserCheck className="w-5 h-5 text-teal-700 mb-3" />
              <h2 className="font-display text-base font-semibold text-slate-900 mb-1.5">
                Senior-First Daily Mode
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                High-contrast large-print schedule, read-aloud routine guidance, and 1-tap mood check-ins.
              </p>
            </div>

            <div id="care-circle" className="bg-white border border-slate-200 rounded-xl p-6">
              <KeyRound className="w-5 h-5 text-teal-700 mb-3" />
              <h2 className="font-display text-base font-semibold text-slate-900 mb-1.5">
                Passcode-Gated Circles
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Share a Care Code and 6-digit passcode so family and caretakers collaborate securely without leaks.
              </p>
            </div>

            <div id="email-alerts" className="bg-white border border-slate-200 rounded-xl p-6">
              <BellRing className="w-5 h-5 text-teal-700 mb-3" />
              <h2 className="font-display text-base font-semibold text-slate-900 mb-1.5">
                Proactive Email Alerts
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Automated reminders for upcoming doses, missed medications, low refills, and doctor visits.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <Sparkles className="w-5 h-5 text-teal-700 mb-3" />
              <h2 className="font-display text-base font-semibold text-slate-900 mb-1.5">
                Smart Clinical Prep
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Scan pill bottles, check gentle interaction notes, and generate 1-page doctor visit briefs.
              </p>
            </div>
          </div>
        </section>

        {/* Autonomy & Collaborative Care Highlight */}
        <section id="autonomy" className="border-t border-slate-200 bg-white py-16">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7">
              <p className="text-sm font-medium text-teal-700 mb-2">Dignity &amp; Shared Consent</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 [text-wrap:balance] mb-4">
                Care coordination without taking away independence.
              </h2>
              <p className="text-base text-slate-600 leading-relaxed mb-6">
                Unlike passive reminder lists, KinCare includes an explicit Senior Approval Queue and
                Care Circle permission ledger. Older adults can review proposed medication changes before
                they become active, adjust who receives missed-dose alerts, and lock caregiver editing
                with the household passcode on shared tablets.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 mb-1">
                    <ShieldCheck className="w-4 h-4 text-teal-700" />
                    <span>Approval Queue</span>
                  </div>
                  <p className="text-slate-600">
                    Caretaker schedule additions wait for elderly sign-off when autonomy mode is active.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 mb-1">
                    <CalendarCheck className="w-4 h-4 text-teal-700" />
                    <span>Visit Prep Briefs</span>
                  </div>
                  <p className="text-slate-600">
                    Turns 14-day adherence and mood notes into questions for upcoming doctor appointments.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 grid grid-cols-1 gap-4">
              <div className="p-5 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-4">
                <img
                  src="/src/assets/images/avatar_senior_elena_1794738808258.jpg"
                  alt="Portrait of Elena Vance, elderly profile owner"
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-full object-cover border border-slate-200 shrink-0"
                />
                <div>
                  <p className="font-display font-semibold text-slate-900">Elena Vance · Age 76</p>
                  <p className="text-sm text-slate-600 mt-0.5">
                    Reviews morning doses in Large Print Mode and approves schedule updates directly.
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-4">
                <img
                  src="/src/assets/images/avatar_caretaker_marcus_1794738809842.jpg"
                  alt="Portrait of Claire Vance, family caretaker"
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-full object-cover border border-slate-200 shrink-0"
                />
                <div>
                  <p className="font-display font-semibold text-slate-900">Claire Vance · Family Caretaker</p>
                  <p className="text-sm text-slate-600 mt-0.5">
                    Receives proactive missed-dose emails, tracks refills, and prepares cardiology briefs.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span>KinCare Elderly Care &amp; Medication Management</span>
          <span>Educational guidance only · Always confirm clinical changes with a licensed physician or pharmacist</span>
        </div>
      </footer>
    </div>
  );
}
