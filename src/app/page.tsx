'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { SidebarProvider, Sidebar, SidebarInset } from '@/components/ui/sidebar';
import { TasksProvider } from '@/contexts/tasks-context';
import BoardView from '@/components/app/board-view';
import PlanningView from '@/components/app/planning-view';
import SidebarNav from '@/components/app/sidebar-nav';
import AppHeader from '@/components/app/header';
import type { Task } from '@/lib/types';
import TeamView from '@/components/app/team-view';
import { ThemeToggle } from '@/components/theme-toggle';

export type View = 'board' | 'planning' | 'team';

function Dashboard() {
  const [view, setView] = useState<View>('board');
  const [activeTaskForPomodoro, setActiveTaskForPomodoro] = useState<Task | null>(
    null
  );

  return (
    <TasksProvider>
      <SidebarProvider>
        <Sidebar
          variant="sidebar"
          collapsible="icon"
          className="bg-sidebar text-sidebar-foreground z-20"
        >
          <div className="flex h-full flex-col">
            <div className="p-4 lg:p-6 flex items-center gap-3 text-white">
              <div className="w-8 h-8 bg-gradient-to-tr from-primary to-accent rounded-lg flex items-center justify-center font-bold">
                G
              </div>
              <div className="group-data-[collapsible=icon]:hidden">
                <span className="font-bold text-lg block">Gestor Pro</span>
                <span className="font-semibold text-sm block">Roberto DO IT</span>
              </div>
            </div>
            <SidebarNav view={view} setView={setView} />
            <div className="p-4 mt-auto">
              <div className="bg-sidebar-accent rounded-xl p-4 space-y-4 flex flex-col items-center group-data-[collapsible=icon]:p-2">
                <div className="group-data-[collapsible=icon]:hidden">
                  <h5 className="text-xs font-bold text-muted-foreground uppercase mb-2">
                    Consejo Productividad
                  </h5>
                  <p className="text-xs text-sidebar-foreground/80 italic">
                    "Si tarda menos de 2 minutos, hazlo ahora. Si no, ponlo en el backlog."
                  </p>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </Sidebar>

        <SidebarInset>
          <AppHeader
            view={view}
            activeTaskForPomodoro={activeTaskForPomodoro}
          />

          <main className="flex-1 overflow-hidden p-4 md:p-6 bg-background">
            {view === 'board' && (
              <BoardView setActiveTaskForPomodoro={setActiveTaskForPomodoro} />
            )}
            {view === 'planning' && (
              <PlanningView
                activeTaskForPomodoro={activeTaskForPomodoro}
                setActiveTaskForPomodoro={setActiveTaskForPomodoro}
              />
            )}
            {view === 'team' && <TeamView />}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TasksProvider>
  );
}

function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    // If auth is not loading and there's no user, redirect to login.
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  // While auth state is loading, show a global loading screen.
  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="space-y-4 w-full max-w-sm">
           <p className="text-center text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  // If there's a user, render the protected content.
  if (user) {
    return <>{children}</>;
  }

  // If no user and not loading (which means the redirect is in progress), return null.
  return null;
}


export default function Home() {
  return (
    <AuthWrapper>
      <Dashboard />
    </AuthWrapper>
  );
}
