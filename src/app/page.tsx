'use client';

import React, { useState } from 'react';

import {
  SidebarProvider,
  Sidebar,
  SidebarInset,
} from '@/components/ui/sidebar';

import { TasksProvider } from '@/contexts/tasks-context';
import BoardView from '@/components/app/board-view';
import PlanningView from '@/components/app/planning-view';
import SidebarNav from '@/components/app/sidebar-nav';
import AppHeader from '@/components/app/header';
import type { Task } from '@/lib/types';

export type View = 'board' | 'planning';

export default function Home() {
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
          className="bg-sidebar text-sidebar-foreground"
        >
          <div className="flex h-full flex-col">
            <div className="p-4 lg:p-6 flex items-center gap-3 text-white">
              <div className="w-8 h-8 bg-gradient-to-tr from-primary to-accent rounded-lg flex items-center justify-center font-bold">
                G
              </div>
              <span className="font-bold text-lg hidden lg:block">
                Gestor Pro
              </span>
            </div>
            <SidebarNav view={view} setView={setView} />
            <div className="p-4 mt-auto">
              <div className="bg-sidebar-accent rounded-xl p-4 hidden lg:block">
                <h5 className="text-xs font-bold text-muted-foreground uppercase mb-2">
                  Consejo Productividad
                </h5>
                <p className="text-xs text-sidebar-foreground/80 italic">
                  "Si tarda menos de 2 minutos, hazlo ahora. Si no, ponlo en el backlog."
                </p>
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
            {view === 'board' ? (
              <BoardView setActiveTaskForPomodoro={setActiveTaskForPomodoro} />
            ) : (
              <PlanningView
                activeTaskForPomodoro={activeTaskForPomodoro}
                setActiveTaskForPomodoro={setActiveTaskForPomodoro}
              />
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TasksProvider>
  );
}
