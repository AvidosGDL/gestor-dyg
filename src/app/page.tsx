
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useMemoFirebase, useAuth } from '@/firebase';
import { SidebarProvider, Sidebar, SidebarInset, SidebarRail, SidebarTrigger } from '@/components/ui/sidebar';
import { TasksProvider } from '@/contexts/tasks-context';
import { ProspectsProvider } from '@/contexts/prospects-context';
import { HistoryProvider } from '@/contexts/history-context';
import { ChatProvider } from '@/contexts/chat-context';
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
import ChatWidget from '@/components/app/chat-widget';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';


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
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const [view, setView] = useState<View>('board');
  const [activeTaskForPomodoro, setActiveTaskForPomodoro] = useState<Task | null>(
    null
  );
  const [taskFilter, setTaskFilter] = useState<string>('me');
  const [currentTip, setCurrentTip] = useState(productivityTips[0]);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonatedUserName, setImpersonatedUserName] = useState('');

  useEffect(() => {
    const checkImpersonation = async () => {
      if (user) {
        const tokenResult = await user.getIdTokenResult();
        const impersonating = tokenResult.claims.impersonating === true;
        setIsImpersonating(impersonating);
        if (impersonating) {
          setImpersonatedUserName(user.displayName || 'Usuario');
        }
      }
    };
    checkImpersonation();
  }, [user]);

  const handleStopImpersonating = async () => {
    await signOut(auth);
    localStorage.removeItem('impersonator_uid');
    router.push('/login');
  };

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
          <ChatProvider>
             {isImpersonating && (
              <div className="bg-yellow-400 text-yellow-900 font-bold text-center p-2 flex items-center justify-center gap-4 fixed top-0 w-full z-50">
                <span>Estás viendo como <strong>{impersonatedUserName}</strong>.</span>
                <Button variant="ghost" size="sm" onClick={handleStopImpersonating} className="border border-yellow-800/50 hover:bg-yellow-500 h-auto">
                  <LogOut className="mr-2 h-4 w-4" /> Volver a mi cuenta
                </Button>
              </div>
            )}
            <SidebarProvider defaultOpen={true}>
              <Sidebar
                variant="sidebar"
                collapsible="icon"
                className={cn("text-sidebar-foreground z-20", isImpersonating && "pt-10")}
              >
                <div className="group flex h-full flex-col">
                  <div className="flex h-16 items-center justify-between p-4 group-data-[state=collapsed]:hidden">
                      <div className="flex items-center gap-3">
                          <span className="font-bold text-lg">Gestor D&G</span>
                      </div>
                  </div>

                  <SidebarRail />

                  <div className="flex flex-col h-full">
                    <SidebarNav view={view} setView={setView} />
                    <div className="p-4 mt-auto space-y-4">
                      <div className="bg-sidebar-border rounded-xl p-4 space-y-2 group-data-[state=collapsed]:hidden">
                        <div className="group-data-[collapsible=icon]:hidden">
                          <h5 className="text-xs font-bold text-muted-foreground uppercase mb-1">
                            Consejo Productividad
                          </h5>
                          <p className="text-sm text-sidebar-foreground/80 italic">
                            "{currentTip}"
                          </p>
                        </div>
                      </div>
                      <div className="flex justify-center items-center group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-4">
                          <ThemeToggle />
                        </div>
                    </div>
                  </div>
                </div>
              </Sidebar>

              <SidebarInset className={cn(isImpersonating && "pt-10")}>
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
              <ChatWidget />
            </SidebarProvider>
          </ChatProvider>
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
