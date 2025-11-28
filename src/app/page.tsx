'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';

import {
  SidebarProvider,
  Sidebar,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';

import { TasksProvider } from '@/contexts/tasks-context';
import BoardView from '@/components/app/board-view';
import PlanningView from '@/components/app/planning-view';
import SidebarNav from '@/components/app/sidebar-nav';
import AppHeader from '@/components/app/header';
import type { Task } from '@/lib/types';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import TeamView from '@/components/app/team-view';
import { ThemeToggle } from '@/components/theme-toggle';
import { Skeleton } from '@/components/ui/skeleton';

export type View = 'board' | 'planning' | 'team';

function Dashboard() {
  const [view, setView] = useState<View>('board');
  const [activeTaskForPomodoro, setActiveTaskForPomodoro] = useState<Task | null>(
    null
  );
  const { user } = useUser();

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
            {view === 'team' && (
              <TeamView />
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TasksProvider>
  );
}

function AuthWrapper() {
  const { user, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Skeleton className="h-24 w-24 rounded-full" />
      </div>
    );
  }

  return <Dashboard />;
}


export default function Home() {
  return (
    <FirebaseClientProvider>
      <AuthWrapper />
    </FirebaseClientProvider>
  );
}
