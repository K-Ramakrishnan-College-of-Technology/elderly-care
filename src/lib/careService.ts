import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import {
  computePasscodeVerifier,
  computePassToken,
  db,
  generateCareCode,
  generateSafeId,
  generateSalt,
  handleFirestoreError,
  sanitizePayload,
} from './firebase';
import { OperationType } from '../types/kincare';
import type {
  Appointment,
  AppointmentStatus,
  ApprovalStatus,
  CareMember,
  CareProfile,
  CheckIn,
  CheckInMood,
  DoseLog,
  DoseStatus,
  EmailAlertType,
  EmailLog,
  Medication,
  MemberRole,
  TimeSlot,
  UserMembership,
} from '../types/kincare';

export function getTodayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function normalizeTimeHHMM(raw: string, fallback = '08:00'): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return fallback;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export async function ensureUserRecord(
  user: User,
  rolePreference: MemberRole = 'family'
): Promise<void> {
  const userPath = `users/${user.uid}`;
  const privatePath = `users/${user.uid}/private/info`;

  try {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const displayName = (user.displayName || user.email?.split('@')[0] || 'Care Member').slice(0, 80);
    const photoURL = (user.photoURL || '').slice(0, 500);

    if (!snap.exists()) {
      await setDoc(
        userRef,
        sanitizePayload({
          uid: user.uid,
          displayName,
          photoURL,
          rolePreference,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    } else {
      await updateDoc(
        userRef,
        sanitizePayload({
          displayName,
          photoURL,
          updatedAt: serverTimestamp(),
        })
      );
    }

    const privateRef = doc(db, 'users', user.uid, 'private', 'info');
    const privSnap = await getDoc(privateRef);
    const email = (user.email || '').slice(0, 120);
    if (!privSnap.exists()) {
      await setDoc(
        privateRef,
        sanitizePayload({
          uid: user.uid,
          email,
          phone: '',
          updatedAt: serverTimestamp(),
        })
      );
    } else {
      await updateDoc(
        privateRef,
        sanitizePayload({
          email,
          updatedAt: serverTimestamp(),
        })
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${userPath} | ${privatePath}`);
  }
}

export function subscribeUserMemberships(
  uid: string,
  onData: (memberships: UserMembership[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/memberships`;
  const q = query(collection(db, 'users', uid, 'memberships'), orderBy('joinedAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as UserMembership);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export async function createCareProfile(params: {
  user: User;
  seniorName: string;
  age: number;
  passcode: string;
  creatorRole: MemberRole;
  relationship: string;
  requireSeniorApproval: boolean;
  allergies: string;
  conditions: string;
  doctorName: string;
  doctorEmail: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  includeStarterRoutine: boolean;
}): Promise<{ profileId: string; careCode: string }> {
  const profileId = generateSafeId('care');
  const careCode = generateCareCode();
  const salt = generateSalt();
  const passcodeVerifier = await computePasscodeVerifier(salt, params.passcode);
  const passToken = await computePassToken(careCode, params.passcode);
  const displayName = (params.user.displayName || params.user.email?.split('@')[0] || 'Care Member').slice(0, 80);
  const alertEmail = (params.user.email || '').slice(0, 120);

  const batch = writeBatch(db);

  batch.set(
    doc(db, 'careProfiles', profileId),
    sanitizePayload({
      profileId,
      ownerId: params.user.uid,
      seniorName: params.seniorName.trim().slice(0, 80),
      age: Math.max(18, Math.min(125, Math.round(params.age))),
      careCode,
      passcodeVerifier,
      passcodeSalt: salt,
      requireSeniorApproval: params.requireSeniorApproval,
      bloodType: '',
      allergies: params.allergies.trim().slice(0, 400),
      conditions: params.conditions.trim().slice(0, 400),
      doctorName: params.doctorName.trim().slice(0, 80),
      doctorEmail: params.doctorEmail.trim().slice(0, 120),
      emergencyContactName: params.emergencyContactName.trim().slice(0, 80),
      emergencyContactPhone: params.emergencyContactPhone.trim().slice(0, 40),
      preferredView: params.creatorRole === 'elderly' ? 'senior' : 'caregiver',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  batch.set(
    doc(db, 'carePasses', passToken),
    sanitizePayload({
      profileId,
      seniorName: params.seniorName.trim().slice(0, 80),
      careCode,
      ownerId: params.user.uid,
      createdAt: serverTimestamp(),
    })
  );

  batch.set(
    doc(db, 'careProfiles', profileId, 'members', params.user.uid),
    sanitizePayload({
      uid: params.user.uid,
      profileId,
      displayName,
      relationship: params.relationship.trim().slice(0, 60) || (params.creatorRole === 'elderly' ? 'Self' : 'Primary Caregiver'),
      role: params.creatorRole,
      canEditSchedule: true,
      alertEmail,
      notifyMissedDose: true,
      notifyUpcomingDose: true,
      notifyAppointments: true,
      status: 'active',
      passToken,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  batch.set(
    doc(db, 'users', params.user.uid, 'memberships', profileId),
    sanitizePayload({
      profileId,
      seniorName: params.seniorName.trim().slice(0, 80),
      careCode,
      role: params.creatorRole,
      joinedAt: serverTimestamp(),
    })
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `careProfiles/${profileId}`);
  }

  if (params.includeStarterRoutine) {
    const starterBatch = writeBatch(db);
    const todayKey = getTodayDateKey();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const nextApptDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(
      tomorrow.getDate()
    ).padStart(2, '0')}`;

    const starterMeds: Array<{
      name: string;
      dosage: string;
      frequency: string;
      timeSlot: TimeSlot;
      scheduledTime: string;
      instructions: string;
      purpose: string;
      pillColor: string;
      pillsRemaining: number;
    }> = [
      {
        name: 'Lisinopril',
        dosage: '10 mg',
        frequency: 'Once daily',
        timeSlot: 'morning',
        scheduledTime: '08:00',
        instructions: 'Take 1 tablet with a full glass of water after breakfast.',
        purpose: 'Supports healthy blood pressure',
        pillColor: 'Soft Peach',
        pillsRemaining: 24,
      },
      {
        name: 'Metformin ER',
        dosage: '500 mg',
        frequency: 'Once daily with meal',
        timeSlot: 'afternoon',
        scheduledTime: '13:00',
        instructions: 'Take with lunch to prevent stomach upset.',
        purpose: 'Helps balance daily blood sugar',
        pillColor: 'White Oval',
        pillsRemaining: 18,
      },
      {
        name: 'Atorvastatin',
        dosage: '20 mg',
        frequency: 'Every evening',
        timeSlot: 'bedtime',
        scheduledTime: '21:00',
        instructions: 'Take 1 tablet before bedtime.',
        purpose: 'Maintains heart and cholesterol health',
        pillColor: 'Light Blue',
        pillsRemaining: 6,
      },
    ];

    for (const med of starterMeds) {
      const medId = generateSafeId('med');
      starterBatch.set(
        doc(db, 'careProfiles', profileId, 'medications', medId),
        sanitizePayload({
          id: medId,
          profileId,
          name: med.name,
          dosage: med.dosage,
          frequency: med.frequency,
          timeSlot: med.timeSlot,
          scheduledTime: med.scheduledTime,
          instructions: med.instructions,
          purpose: med.purpose,
          prescriber: params.doctorName.trim().slice(0, 80) || 'Dr. Hannah Lin',
          pillColor: med.pillColor,
          pillsRemaining: med.pillsRemaining,
          refillThreshold: 7,
          approvalStatus: 'approved',
          proposedByUid: params.user.uid,
          proposedByName: displayName,
          aiSummary: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }

    const apptId = generateSafeId('appt');
    starterBatch.set(
      doc(db, 'careProfiles', profileId, 'appointments', apptId),
      sanitizePayload({
        id: apptId,
        profileId,
        title: 'Routine Cardiovascular & Medication Review',
        doctorName: params.doctorName.trim().slice(0, 80) || 'Dr. Hannah Lin',
        specialty: 'Internal Medicine',
        location: 'Oakridge Community Clinic, Suite 304',
        appointmentDate: nextApptDate,
        appointmentTime: '10:30',
        notes: `Bring updated blood pressure readings and discuss ${todayKey} refill needs.`,
        status: 'scheduled',
        prepBrief: '',
        reminder24hSent: false,
        reminder2hSent: false,
        createdByUid: params.user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    try {
      await starterBatch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `careProfiles/${profileId}/medications`);
    }
  }

  return { profileId, careCode };
}

export async function joinCareProfileWithPasscode(params: {
  user: User;
  careCode: string;
  passcode: string;
  role: 'caretaker' | 'family';
  relationship: string;
  alertEmail: string;
}): Promise<{ profileId: string; seniorName: string }> {
  const normalizedCode = params.careCode.trim().toUpperCase();
  const passToken = await computePassToken(normalizedCode, params.passcode);
  const passPath = `carePasses/${passToken}`;

  let passData: { profileId: string; seniorName: string; careCode: string } | null = null;
  try {
    const passSnap = await getDoc(doc(db, 'carePasses', passToken));
    if (!passSnap.exists()) {
      throw new Error('Invalid Care Code or 6-digit Passcode. Please verify with the profile owner.');
    }
    passData = passSnap.data() as { profileId: string; seniorName: string; careCode: string };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid Care Code')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.GET, passPath);
  }

  if (!passData) {
    throw new Error('Care Pass could not be verified.');
  }

  const displayName = (params.user.displayName || params.user.email?.split('@')[0] || 'Care Member').slice(0, 80);
  const batch = writeBatch(db);

  batch.set(
    doc(db, 'careProfiles', passData.profileId, 'members', params.user.uid),
    sanitizePayload({
      uid: params.user.uid,
      profileId: passData.profileId,
      displayName,
      relationship: params.relationship.trim().slice(0, 60) || 'Family Member',
      role: params.role,
      canEditSchedule: false,
      alertEmail: (params.alertEmail || params.user.email || '').trim().slice(0, 120),
      notifyMissedDose: true,
      notifyUpcomingDose: false,
      notifyAppointments: true,
      status: 'active',
      passToken,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  batch.set(
    doc(db, 'users', params.user.uid, 'memberships', passData.profileId),
    sanitizePayload({
      profileId: passData.profileId,
      seniorName: passData.seniorName,
      careCode: passData.careCode,
      role: params.role,
      joinedAt: serverTimestamp(),
    })
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `careProfiles/${passData.profileId}/members/${params.user.uid}`);
  }

  return { profileId: passData.profileId, seniorName: passData.seniorName };
}

export async function rotateCarePasscode(params: {
  profile: CareProfile;
  oldPasscode?: string;
  newPasscode: string;
  actorUid: string;
}): Promise<void> {
  const newSalt = generateSalt();
  const newVerifier = await computePasscodeVerifier(newSalt, params.newPasscode);
  const newToken = await computePassToken(params.profile.careCode, params.newPasscode);

  const batch = writeBatch(db);
  batch.set(
    doc(db, 'carePasses', newToken),
    sanitizePayload({
      profileId: params.profile.profileId,
      seniorName: params.profile.seniorName,
      careCode: params.profile.careCode,
      ownerId: params.actorUid,
      createdAt: serverTimestamp(),
    })
  );

  if (params.oldPasscode && /^\d{6}$/.test(params.oldPasscode.trim())) {
    const oldToken = await computePassToken(params.profile.careCode, params.oldPasscode);
    if (oldToken !== newToken) {
      batch.delete(doc(db, 'carePasses', oldToken));
    }
  }

  batch.update(
    doc(db, 'careProfiles', params.profile.profileId),
    sanitizePayload({
      passcodeVerifier: newVerifier,
      passcodeSalt: newSalt,
      updatedAt: serverTimestamp(),
    })
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `careProfiles/${params.profile.profileId}`);
  }
}

export function subscribeCareWorkspace(
  profileId: string,
  callbacks: {
    onProfile: (profile: CareProfile | null) => void;
    onMembers: (members: CareMember[]) => void;
    onMedications: (meds: Medication[]) => void;
    onDoseLogs: (logs: DoseLog[]) => void;
    onAppointments: (appts: Appointment[]) => void;
    onCheckIns: (checkIns: CheckIn[]) => void;
    onEmailLogs: (logs: EmailLog[]) => void;
    onError: (err: Error) => void;
  }
): () => void {
  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      doc(db, 'careProfiles', profileId),
      (snap) => {
        callbacks.onProfile(snap.exists() ? (snap.data() as CareProfile) : null);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, `careProfiles/${profileId}`);
        } catch (e) {
          callbacks.onError(e instanceof Error ? e : new Error(String(e)));
        }
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'careProfiles', profileId, 'members'), orderBy('joinedAt', 'asc')),
      (snap) => callbacks.onMembers(snap.docs.map((d) => d.data() as CareMember)),
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `careProfiles/${profileId}/members`);
        } catch (e) {
          callbacks.onError(e instanceof Error ? e : new Error(String(e)));
        }
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'careProfiles', profileId, 'medications'), orderBy('scheduledTime', 'asc')),
      (snap) => callbacks.onMedications(snap.docs.map((d) => d.data() as Medication)),
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `careProfiles/${profileId}/medications`);
        } catch (e) {
          callbacks.onError(e instanceof Error ? e : new Error(String(e)));
        }
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'careProfiles', profileId, 'doseLogs'), orderBy('loggedAt', 'desc')),
      (snap) => callbacks.onDoseLogs(snap.docs.map((d) => d.data() as DoseLog)),
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `careProfiles/${profileId}/doseLogs`);
        } catch (e) {
          callbacks.onError(e instanceof Error ? e : new Error(String(e)));
        }
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'careProfiles', profileId, 'appointments'), orderBy('appointmentDate', 'asc')),
      (snap) => callbacks.onAppointments(snap.docs.map((d) => d.data() as Appointment)),
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `careProfiles/${profileId}/appointments`);
        } catch (e) {
          callbacks.onError(e instanceof Error ? e : new Error(String(e)));
        }
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'careProfiles', profileId, 'checkIns'), orderBy('createdAt', 'desc')),
      (snap) => callbacks.onCheckIns(snap.docs.map((d) => d.data() as CheckIn)),
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `careProfiles/${profileId}/checkIns`);
        } catch (e) {
          callbacks.onError(e instanceof Error ? e : new Error(String(e)));
        }
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'careProfiles', profileId, 'emailLogs'), orderBy('sentAt', 'desc')),
      (snap) => callbacks.onEmailLogs(snap.docs.map((d) => d.data() as EmailLog)),
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `careProfiles/${profileId}/emailLogs`);
        } catch (e) {
          callbacks.onError(e instanceof Error ? e : new Error(String(e)));
        }
      }
    )
  );

  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}

export async function updateCareProfileSettings(
  profileId: string,
  updates: Partial<
    Pick<
      CareProfile,
      | 'seniorName'
      | 'age'
      | 'requireSeniorApproval'
      | 'bloodType'
      | 'allergies'
      | 'conditions'
      | 'doctorName'
      | 'doctorEmail'
      | 'emergencyContactName'
      | 'emergencyContactPhone'
      | 'preferredView'
    >
  >
): Promise<void> {
  const path = `careProfiles/${profileId}`;
  try {
    await updateDoc(
      doc(db, 'careProfiles', profileId),
      sanitizePayload({
        ...updates,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateMemberPermissions(
  profileId: string,
  memberId: string,
  updates: Partial<
    Pick<
      CareMember,
      | 'displayName'
      | 'relationship'
      | 'role'
      | 'canEditSchedule'
      | 'status'
      | 'alertEmail'
      | 'notifyMissedDose'
      | 'notifyUpcomingDose'
      | 'notifyAppointments'
    >
  >
): Promise<void> {
  const path = `careProfiles/${profileId}/members/${memberId}`;
  try {
    await updateDoc(
      doc(db, 'careProfiles', profileId, 'members', memberId),
      sanitizePayload({
        ...updates,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function upsertMedication(params: {
  profile: CareProfile;
  actorUid: string;
  actorName: string;
  isOwnerOrSenior: boolean;
  existingId?: string;
  data: {
    name: string;
    dosage: string;
    frequency: string;
    timeSlot: TimeSlot;
    scheduledTime: string;
    instructions: string;
    purpose: string;
    prescriber: string;
    pillColor: string;
    pillsRemaining: number;
    refillThreshold: number;
    aiSummary?: string;
  };
}): Promise<string> {
  const medId = params.existingId || generateSafeId('med');
  const path = `careProfiles/${params.profile.profileId}/medications/${medId}`;
  const approvalStatus: ApprovalStatus =
    !params.isOwnerOrSenior && params.profile.requireSeniorApproval ? 'pending_senior' : 'approved';

  const cleanPayload = sanitizePayload({
    name: params.data.name.trim().slice(0, 100),
    dosage: params.data.dosage.trim().slice(0, 60),
    frequency: params.data.frequency.trim().slice(0, 60),
    timeSlot: params.data.timeSlot,
    scheduledTime: normalizeTimeHHMM(params.data.scheduledTime, '08:00'),
    instructions: params.data.instructions.trim().slice(0, 300),
    purpose: params.data.purpose.trim().slice(0, 200),
    prescriber: params.data.prescriber.trim().slice(0, 80),
    pillColor: params.data.pillColor.trim().slice(0, 30) || 'White',
    pillsRemaining: Math.max(0, Math.min(1000, Math.round(Number(params.data.pillsRemaining) || 0))),
    refillThreshold: Math.max(1, Math.min(90, Math.round(Number(params.data.refillThreshold) || 7))),
    approvalStatus,
    aiSummary: (params.data.aiSummary || '').trim().slice(0, 600),
    updatedAt: serverTimestamp(),
  });

  try {
    if (params.existingId) {
      await updateDoc(doc(db, 'careProfiles', params.profile.profileId, 'medications', medId), cleanPayload);
    } else {
      await setDoc(
        doc(db, 'careProfiles', params.profile.profileId, 'medications', medId),
        sanitizePayload({
          ...cleanPayload,
          id: medId,
          profileId: params.profile.profileId,
          proposedByUid: params.actorUid,
          proposedByName: params.actorName.slice(0, 80),
          createdAt: serverTimestamp(),
        })
      );
    }
    return medId;
  } catch (error) {
    handleFirestoreError(error, params.existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function updateMedicationApproval(
  profileId: string,
  medId: string,
  approvalStatus: ApprovalStatus
): Promise<void> {
  const path = `careProfiles/${profileId}/medications/${medId}`;
  try {
    await updateDoc(
      doc(db, 'careProfiles', profileId, 'medications', medId),
      sanitizePayload({
        approvalStatus,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteMedication(profileId: string, medId: string): Promise<void> {
  const path = `careProfiles/${profileId}/medications/${medId}`;
  try {
    await deleteDoc(doc(db, 'careProfiles', profileId, 'medications', medId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function logDoseAndAdjustSupply(params: {
  profileId: string;
  medication: Medication;
  dateKey: string;
  status: DoseStatus;
  previousStatus?: DoseStatus;
  note: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const logId = `${params.dateKey}_${params.medication.id}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const path = `careProfiles/${params.profileId}/doseLogs/${logId}`;
  const batch = writeBatch(db);
  const logRef = doc(db, 'careProfiles', params.profileId, 'doseLogs', logId);

  const payload = sanitizePayload({
    id: logId,
    profileId: params.profileId,
    medicationId: params.medication.id,
    medicationName: params.medication.name,
    dosage: params.medication.dosage,
    dateKey: params.dateKey,
    scheduledTime: params.medication.scheduledTime,
    status: params.status,
    note: params.note.trim().slice(0, 240),
    loggedByUid: params.actorUid,
    loggedByName: params.actorName.slice(0, 80),
    loggedAt: serverTimestamp(),
  });

  if (params.previousStatus) {
    batch.update(logRef, {
      status: params.status,
      note: params.note.trim().slice(0, 240),
      loggedByUid: params.actorUid,
      loggedByName: params.actorName.slice(0, 80),
      loggedAt: serverTimestamp(),
    });
  } else {
    batch.set(logRef, payload);
  }

  let nextSupply = params.medication.pillsRemaining;
  if (params.status === 'taken' && params.previousStatus !== 'taken') {
    nextSupply = Math.max(0, nextSupply - 1);
  } else if (params.status !== 'taken' && params.previousStatus === 'taken') {
    nextSupply = Math.min(1000, nextSupply + 1);
  }

  if (nextSupply !== params.medication.pillsRemaining) {
    batch.update(
      doc(db, 'careProfiles', params.profileId, 'medications', params.medication.id),
      sanitizePayload({
        pillsRemaining: Math.round(nextSupply),
        updatedAt: serverTimestamp(),
      })
    );
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function upsertAppointment(params: {
  profileId: string;
  actorUid: string;
  existingId?: string;
  data: {
    title: string;
    doctorName: string;
    specialty: string;
    location: string;
    appointmentDate: string;
    appointmentTime: string;
    notes: string;
    status: AppointmentStatus;
    prepBrief?: string;
  };
}): Promise<string> {
  const apptId = params.existingId || generateSafeId('appt');
  const path = `careProfiles/${params.profileId}/appointments/${apptId}`;
  const clean = sanitizePayload({
    title: params.data.title.trim().slice(0, 120),
    doctorName: params.data.doctorName.trim().slice(0, 80),
    specialty: params.data.specialty.trim().slice(0, 80),
    location: params.data.location.trim().slice(0, 160),
    appointmentDate: params.data.appointmentDate,
    appointmentTime: normalizeTimeHHMM(params.data.appointmentTime, '09:00'),
    notes: params.data.notes.trim().slice(0, 500),
    status: params.data.status,
    prepBrief: (params.data.prepBrief || '').slice(0, 2000),
    updatedAt: serverTimestamp(),
  });

  try {
    if (params.existingId) {
      await updateDoc(doc(db, 'careProfiles', params.profileId, 'appointments', apptId), clean);
    } else {
      await setDoc(
        doc(db, 'careProfiles', params.profileId, 'appointments', apptId),
        sanitizePayload({
          ...clean,
          id: apptId,
          profileId: params.profileId,
          reminder24hSent: false,
          reminder2hSent: false,
          createdByUid: params.actorUid,
          createdAt: serverTimestamp(),
        })
      );
    }
    return apptId;
  } catch (error) {
    handleFirestoreError(error, params.existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function updateAppointmentFields(
  profileId: string,
  apptId: string,
  updates: Partial<Pick<Appointment, 'prepBrief' | 'status' | 'reminder24hSent' | 'reminder2hSent'>>
): Promise<void> {
  const path = `careProfiles/${profileId}/appointments/${apptId}`;
  try {
    await updateDoc(
      doc(db, 'careProfiles', profileId, 'appointments', apptId),
      sanitizePayload({
        ...updates,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAppointment(profileId: string, apptId: string): Promise<void> {
  const path = `careProfiles/${profileId}/appointments/${apptId}`;
  try {
    await deleteDoc(doc(db, 'careProfiles', profileId, 'appointments', apptId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createCheckIn(params: {
  profileId: string;
  mood: CheckInMood;
  energyLevel: number;
  note: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const checkInId = generateSafeId('chk');
  const path = `careProfiles/${params.profileId}/checkIns/${checkInId}`;
  try {
    await setDoc(
      doc(db, 'careProfiles', params.profileId, 'checkIns', checkInId),
      sanitizePayload({
        id: checkInId,
        profileId: params.profileId,
        mood: params.mood,
        energyLevel: Math.max(1, Math.min(5, Math.round(params.energyLevel))),
        note: params.note.trim().slice(0, 400),
        authorUid: params.actorUid,
        authorName: params.actorName.slice(0, 80),
        createdAt: serverTimestamp(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function recordEmailLog(params: {
  profileId: string;
  alertKey: string;
  type: EmailAlertType;
  recipients: string[];
  subject: string;
  bodyPreview: string;
  deliveryMode: 'smtp_sent' | 'outbox_queued';
  status: 'sent' | 'logged' | 'failed';
  actorUid: string;
}): Promise<void> {
  const logId = generateSafeId('eml');
  const path = `careProfiles/${params.profileId}/emailLogs/${logId}`;
  const cleanRecipients = params.recipients.map((r) => r.trim().slice(0, 120)).filter((r) => r.length > 0).slice(0, 10);
  if (cleanRecipients.length === 0) return;

  const safeAlertKey = params.alertKey.trim().slice(0, 128) || `alert_${Date.now()}`;
  const safeSubject = params.subject.trim().slice(0, 160) || 'KinCare Reminder';
  const safeBody = params.bodyPreview.trim().slice(0, 1200) || 'Care Circle notification.';
  const safeDeliveryMode: 'smtp_sent' | 'outbox_queued' =
    params.deliveryMode === 'smtp_sent' ? 'smtp_sent' : 'outbox_queued';
  const safeStatus: 'sent' | 'logged' | 'failed' =
    params.status === 'sent' || params.status === 'logged' || params.status === 'failed'
      ? params.status
      : 'logged';

  try {
    await setDoc(
      doc(db, 'careProfiles', params.profileId, 'emailLogs', logId),
      sanitizePayload({
        id: logId,
        profileId: params.profileId,
        alertKey: safeAlertKey,
        type: params.type,
        recipients: cleanRecipients,
        subject: safeSubject,
        bodyPreview: safeBody,
        deliveryMode: safeDeliveryMode,
        status: safeStatus,
        triggeredByUid: params.actorUid,
        sentAt: serverTimestamp(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
