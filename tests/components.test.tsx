// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LandingView } from '../src/components/LandingView';
import { SeniorModeView } from '../src/components/SeniorModeView';
import type { Appointment, CareMember, CareProfile, CheckIn, Medication } from '../src/types/kincare';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  vi.restoreAllMocks();
});

const mockProfile: CareProfile = {
  profileId: 'care_test',
  ownerId: 'uid_senior',
  seniorName: 'Elena Vance',
  age: 76,
  careCode: 'KIN-8A2C',
  passcodeVerifier: 'v',
  passcodeSalt: 's',
  requireSeniorApproval: true,
  bloodType: 'O+',
  allergies: 'Penicillin',
  conditions: 'Hypertension',
  doctorName: 'Dr. Lin',
  doctorEmail: 'lin@clinic.example',
  emergencyContactName: 'Claire Vance',
  emergencyContactPhone: '555-0199',
  preferredView: 'senior',
  createdAt: null,
  updatedAt: null,
};

const mockMembers: CareMember[] = [
  {
    uid: 'uid_senior',
    profileId: 'care_test',
    displayName: 'Elena Vance',
    relationship: 'Self',
    role: 'elderly',
    canEditSchedule: true,
    alertEmail: 'elena@example.com',
    notifyMissedDose: true,
    notifyUpcomingDose: true,
    notifyAppointments: true,
    status: 'active',
    passToken: 'token_test',
    joinedAt: null,
    updatedAt: null,
  },
];

const mockMeds: Medication[] = [
  {
    id: 'med_approved',
    profileId: 'care_test',
    name: 'Lisinopril',
    dosage: '10 mg',
    frequency: 'Once daily',
    timeSlot: 'morning',
    scheduledTime: '08:00',
    instructions: 'Take with water',
    purpose: 'Blood pressure',
    prescriber: 'Dr. Lin',
    pillColor: 'Peach',
    pillsRemaining: 24,
    refillThreshold: 7,
    approvalStatus: 'approved',
    proposedByUid: 'uid_senior',
    proposedByName: 'Elena Vance',
    aiSummary: '',
    createdAt: null,
    updatedAt: null,
  },
  {
    id: 'med_pending',
    profileId: 'care_test',
    name: 'Vitamin D3',
    dosage: '1000 IU',
    frequency: 'Once daily',
    timeSlot: 'morning',
    scheduledTime: '09:00',
    instructions: 'Take with breakfast',
    purpose: 'Bone health',
    prescriber: 'Dr. Lin',
    pillColor: 'Yellow',
    pillsRemaining: 30,
    refillThreshold: 7,
    approvalStatus: 'pending_senior',
    proposedByUid: 'uid_family',
    proposedByName: 'Claire Vance',
    aiSummary: '',
    createdAt: null,
    updatedAt: null,
  },
];

const mockAppts: Appointment[] = [];
const mockCheckIns: CheckIn[] = [];

describe('UI Components & Accessibility Contracts', () => {
  it('LandingView renders core value proposition, accessible images, and triggers sign-in', async () => {
    const onSignIn = vi.fn().mockResolvedValue(undefined);
    const root = createRoot(container);

    await act(async () => {
      root.render(<LandingView onSignIn={onSignIn} signingIn={false} authError="Test auth alert" />);
    });

    expect(container.textContent).toContain('Shared medication clarity');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Test auth alert');

    const images = Array.from(container.querySelectorAll('img'));
    expect(images.length).toBeGreaterThanOrEqual(3);
    for (const img of images) {
      expect(img.getAttribute('alt')?.trim().length).toBeGreaterThan(10);
    }

    const ctaBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Start or Join')
    );
    expect(ctaBtn).toBeDefined();

    await act(async () => {
      ctaBtn?.click();
    });
    expect(onSignIn).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it('SeniorModeView renders pending approval queue, large-print toggle, and accessible form labels', async () => {
    const onUnlock = vi.fn();
    const onReportError = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SeniorModeView
          profile={mockProfile}
          currentUid="uid_senior"
          currentUserName="Elena Vance"
          isOwnerOrSenior={true}
          members={mockMembers}
          medications={mockMeds}
          doseLogs={[]}
          appointments={mockAppts}
          checkIns={mockCheckIns}
          onRequestCaregiverUnlock={onUnlock}
          onReportError={onReportError}
        />
      );
    });

    expect(container.textContent).toContain('Hello, Elena Vance');
    expect(container.textContent).toContain('Changes Waiting for Your Approval (1)');
    expect(container.textContent).toContain('Vitamin D3');
    expect(container.textContent).toContain('Lisinopril');

    // Toggle Large Print button and check aria-pressed updates
    const textBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Text Size:')
    );
    expect(textBtn?.getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      textBtn?.click();
    });
    expect(textBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(textBtn?.textContent).toContain('Standard');

    // Verify Energy slider & note textarea have proper label associations
    const energyInput = container.querySelector('#energy-level-slider');
    const energyLabel = container.querySelector('label[for="energy-level-slider"]');
    expect(energyInput).not.toBeNull();
    expect(energyLabel).not.toBeNull();

    const noteTextarea = container.querySelector('#checkin-note-input');
    const noteLabel = container.querySelector('label[for="checkin-note-input"]');
    expect(noteTextarea).not.toBeNull();
    expect(noteLabel).not.toBeNull();

    // Verify Care Circle unlock button triggers callback
    const unlockBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Care Circle View')
    );
    await act(async () => {
      unlockBtn?.click();
    });
    expect(onUnlock).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });
});
