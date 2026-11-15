import { BellRing, Calendar, LayoutDashboard, Pill, UserCheck } from 'lucide-react';

export type DashboardTab = 'overview' | 'medications' | 'appointments' | 'emails' | 'circle';

export const DASHBOARD_NAV_ITEMS: Array<{
  id: DashboardTab;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'medications', label: 'Medications & AI', icon: Pill },
  { id: 'appointments', label: 'Appointments', icon: Calendar },
  { id: 'emails', label: 'Email Alerts', icon: BellRing },
  { id: 'circle', label: 'Care Circle', icon: UserCheck },
];
