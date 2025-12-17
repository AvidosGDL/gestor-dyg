'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { SidebarProvider, Sidebar, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { TasksProvider } from '@/contexts/tasks-context';
import { ProspectsProvider } from '@/contexts/prospects-context';
import { HistoryProvider } from '@/contexts/history-context';
import BoardView from '@/components/app/board-view';
import PlanningView from '@/components/app/planning-view';
import SidebarNav from '@/components/app/sidebar-nav';
import AppHeader from '@/components/app/header';
import type { Task, UserProfile } from '@/lib/types';
import TeamView from '@/components/app/team-view';
import ImportView from '@/components/app/import-view';
import { ThemeToggle } from '@/components/theme-toggle';
import ProspectsView from '@/components/app/prospects-view';
import AnalyticsView from '@/components/app/analytics-view';
import HistoryView from '@/components/app/history-view';
import { doc, getDoc } from 'firebase/firestore';


export type View = 'board' | 'planning' | 'team' | 'import' | 'prospects' | 'analytics' | 'history';

const productivityTips = [
  "Si tarda menos de 2 minutos, hazlo ahora. Si no, ponlo en el backlog.",
  "Agrupa tareas similares y realízalas en bloque.",
  "La regla 80/20: el 80% de los resultados provienen del 20% de los esfuerzos. ¡Prioriza!",
  "Usa la técnica Pomodoro: 25 minutos de enfoque intenso y 5 de descanso.",
  "Termina tu día de trabajo planificando las 3 tareas más importantes del día siguiente.",
  "Desactiva las notificaciones mientras trabajas en una tarea importante.",
  "Toma descansos cortos y regulares para mantener tu mente fresca y evitar el agotamiento."
];


function Dashboard() {
  const [view, setView] = useState<View>('board');
  const [activeTaskForPomodoro, setActiveTaskForPomodoro] = useState<Task | null>(
    null
  );
  const [taskFilter, setTaskFilter] = useState<string>('me');
  const [currentTip, setCurrentTip] = useState(productivityTips[0]);

  useEffect(() => {
    // Set an initial random tip
    setCurrentTip(productivityTips[Math.floor(Math.random() * productivityTips.length)]);

    // Change tip every 8 hours
    const intervalId = setInterval(() => {
      setCurrentTip(productivityTips[Math.floor(Math.random() * productivityTips.length)]);
    }, 8 * 60 * 60 * 1000); // 8 hours in milliseconds

    return () => clearInterval(intervalId);
  }, []);


  return (
    <TasksProvider>
      <ProspectsProvider>
        <HistoryProvider>
          <SidebarProvider defaultOpen={false}>
            <Sidebar
              variant="sidebar"
              collapsible="icon"
              className="bg-sidebar text-sidebar-foreground z-20"
            >
              <div className="flex h-full flex-col">
                <div className="p-4 lg:p-6 flex items-center justify-center group-data-[collapsible=icon]:justify-start gap-3 text-white">
                  <Image
                    src="https://firebasestorage.googleapis.com/v0/b/studio-8033020115-912ac.firebasestorage.app/o/public%2Flogo%20DyG.jpeg?alt=media&token=578d1bd8-b8a4-47b6-a97f-e7731dc39bf1"
                    alt="Gestor D&G Logo"
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-lg"
                  />
                  <div className="group-data-[collapsible=icon]:hidden">
                    <span className="font-bold text-lg block">Gestor D&G</span>
                  </div>
                </div>
                <SidebarNav view={view} setView={setView} />
                <div className="p-4 mt-auto space-y-4">
                  <div className="bg-sidebar-accent rounded-xl p-4 space-y-4 flex flex-col items-center group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:hidden">
                    <div className="group-data-[collapsible=icon]:hidden">
                      <h5 className="text-xs font-bold text-muted-foreground uppercase mb-2">
                        Consejo Productividad
                      </h5>
                      <p className="text-xs text-sidebar-foreground/80 italic">
                        "{currentTip}"
                      </p>
                    </div>
                  </div>
                   <div className="flex justify-between items-center group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-4">
                      <ThemeToggle />
                      <SidebarTrigger className="hidden lg:flex" />
                    </div>
                </div>
              </div>
            </Sidebar>

            <SidebarInset>
              <AppHeader
                view={view}
                activeTaskForPomodoro={activeTaskForPomodoro}
                taskFilter={taskFilter}
                setTaskFilter={setTaskFilter}
              />

              <main className="flex-1 overflow-hidden p-4 md:p-6 bg-background">
                {view === 'board' && (
                  <BoardView setActiveTaskForPomodoro={setActiveTaskForPomodoro} taskFilter={taskFilter} />
                )}
                {view === 'planning' && (
                  <PlanningView
                    activeTaskForPomodoro={activeTaskForPomodoro}
                    setActiveTaskForPomodoro={setActiveTaskForPomodoro}
                    taskFilter={taskFilter}
                  />
                )}
                {view === 'team' && <TeamView />}
                {view === 'import' && <ImportView />}
                {view === 'prospects' && <ProspectsView />}
                {view === 'analytics' && <AnalyticsView taskFilter={taskFilter} />}
                {view === 'history' && <HistoryView taskFilter={taskFilter} />}
              </main>
            </SidebarInset>
          </SidebarProvider>
        </HistoryProvider>
      </ProspectsProvider>
    </TasksProvider>
  );
}

function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="space-y-4 w-full max-w-sm">
           <p className="text-center text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}


export default function Home() {
  return (
    <AuthWrapper>
      <Dashboard />
    </AuthWrapper>
  );
}
