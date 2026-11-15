# KinCare Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Master Gate Membership**: No user may read or write `medications`, `doseLogs`, `appointments`, `checkIns`, or `emailLogs` under `/careProfiles/{profileId}` unless `/careProfiles/{profileId}/members/{request.auth.uid}` exists and has `status == 'active'`.
2. **Zero-Enumeration Passcode Join**: `/careProfiles` and `/carePasses` strictly forbid `list` queries (`allow list: if false`). Joining requires knowledge of BOTH `careCode` and the 6-digit `passcode` to compute the SHA-256 `passToken` document ID.
3. **Senior-First Consent & Anti-Escalation**: Joining via `carePasses` only allows `role in ['caretaker', 'family']` and forces `canEditSchedule == false` until explicitly granted by the elderly person or profile owner. When `requireSeniorApproval == true`, caretaker medication creates/edits must carry `approvalStatus == 'pending_senior'`.
4. **PII Isolation**: Personal email/phone on user accounts is stored strictly in `/users/{userId}/private/info` and readable only by `request.auth.uid == userId`.
5. **Immutable Audit & Ownership**: `ownerId`, `createdAt`, `joinedAt`, `loggedByUid`, and `triggeredByUid` cannot be spoofed on create or mutated on update; server timestamps (`request.time`) are enforced on all timestamps.
6. **Terminal State Locking**: Appointments marked `completed` cannot be modified by non-owners.
7. **Verified Identity**: All write operations require `request.auth != null && request.auth.token.email_verified == true`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Profile Read**: `GET /careProfiles/profile_1` with `auth == null` -> `PERMISSION_DENIED`.
2. **Blanket Profile Scrape**: `LIST /careProfiles` by authenticated non-member -> `PERMISSION_DENIED`.
3. **Passcode Enumeration**: `LIST /carePasses` by authenticated user -> `PERMISSION_DENIED`.
4. **Privilege Escalation on Join**: `CREATE /careProfiles/profile_1/members/attackerUid` with `role: 'elderly'` or `canEditSchedule: true` via `carePasses` -> `PERMISSION_DENIED`.
5. **Ghost Field / Shadow Update**: `UPDATE /careProfiles/profile_1/medications/med_1` injecting extra field `isVerified: true` -> `PERMISSION_DENIED`.
6. **Owner Spoofing**: `CREATE /careProfiles/profile_2` with `ownerId: 'victimUid'` -> `PERMISSION_DENIED`.
7. **Cross-Profile Medication Injection**: `CREATE /careProfiles/profile_1/medications/med_x` by non-member -> `PERMISSION_DENIED`.
8. **Senior Approval Bypass**: `CREATE /careProfiles/profile_1/medications/med_x` by caretaker with `approvalStatus: 'approved'` when `requireSeniorApproval == true` -> `PERMISSION_DENIED`.
9. **ID Poisoning (1.5KB ID)**: `CREATE /careProfiles/{1500_char_id}` -> `PERMISSION_DENIED`.
10. **PII Cross-User Read**: `GET /users/victimUid/private/info` by `attackerUid` -> `PERMISSION_DENIED`.
11. **Timestamp Forgery**: `CREATE /careProfiles/profile_1/doseLogs/log_1` with backdated `loggedAt` not equal to `request.time` -> `PERMISSION_DENIED`.
12. **Unverified Email Spoof**: `CREATE /careProfiles/profile_1` with `email_verified: false` -> `PERMISSION_DENIED`.
