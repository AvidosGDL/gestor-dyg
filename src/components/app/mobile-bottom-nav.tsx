'use client';

import React from 'react';
import { Layout, CalendarClock, Landmark, KanbanSquare, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { View } from '@/app/page';
import { useSidebar } from '@/components/ui/sidebar';

interface MobileBottomNavProps {
  currentView: View;
  setView: (view: View) => void;
}

export default function MobileBottomNav({ currentView, setView }: MobileBottomNavProps) {
  const { toggleSidebar } = useSidebar();

  const navItems = [
    { id: 'board', label: 'Tareas', icon: Layout },
    { id: 'calendar', label: 'Agenda', icon: CalendarClock },
    { id: 'banks', label: 'Bancos', icon: Landmark },
    { id: 'projects', label: 'Proyectos', icon: KanbanSquare },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-[50] bg-background/95 backdrop-blur-lg border-t border-border px-2 pb-safe-area-inset-bottom shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
      <div className="flex items-center justify-between h-16">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id as View)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1 flex-1 transition-all duration-200 active:scale-90 h-full",
              currentView === item.id ? "text-primary" : "text-muted-foreground"
            )}
          >
            <item.icon size={22} className={cn("transition-transform duration-200", currentView === item.id && "scale-110")} />
            <span className="text-[10px] font-bold uppercase tracking-tight leading-none">{item.label}</span>
            {currentView === item.id && (
              <div className="absolute top-0 w-8 h-0.5 bg-primary rounded-full animate-in fade-in slide-in-from-top-1" />
            )}
          </button>
        ))}
        <button
          onClick={toggleSidebar}
          className="flex flex-col items-center justify-center gap-1 flex-1 text-muted-foreground active:scale-90 h-full"
        >
          <Menu size={22} />
          <span className="text-[10px] font-bold uppercase tracking-tight leading-none">Más</span>
        </button>
      </div>
    </div>
  );
}
