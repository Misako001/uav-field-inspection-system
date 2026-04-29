import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import { DashboardHeader } from './DashboardHeader';
import type { DashboardRealtimePayload } from '../types';

interface AppShellProps {
  dashboard: DashboardRealtimePayload | null;
  isBackendOnline: boolean;
  message: string;
  children: ReactNode;
}

const navItems = [
  { to: '/', label: '首页总览', end: true },
  { to: '/analysis', label: '分析工作台' },
  { to: '/history', label: '历史分析' },
];

export function AppShell({ dashboard, isBackendOnline, message, children }: AppShellProps) {
  return (
    <div className="dashboard-shell multi-page-shell">
      <DashboardHeader dashboard={dashboard} isBackendOnline={isBackendOnline} message={message} />

      <nav className="page-nav panel">
        <div className="page-nav__intro">
          <strong>功能导航</strong>
          <span>按任务阶段进入对应页面，避免把所有能力一次堆在同一个长页面里。</span>
        </div>
        <div className="page-nav__links">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `page-nav__link ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {children}
    </div>
  );
}
