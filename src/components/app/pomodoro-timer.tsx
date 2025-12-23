'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Lightbulb, LoaderCircle, Repeat } from 'lucide-react';
import type { Task, FocusSession } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { generateFocusTips } from '@/ai/flows/generate-focus-tips';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useTasks } from '@/contexts/tasks-context';
import { useUser } from '@/firebase';

interface PomodoroTimerProps {
  activeTask: Task | null;
}

const FOCUS_DURATION = 25 * 60;
const BREAK_DURATION = 5 * 60;

export default function PomodoroTimer({ activeTask }: PomodoroTimerProps) {
  const { updateTask } = useTasks();
  const { user } = useUser();
  const [timeLeft, setTimeLeft] = useState(FOCUS_DURATION);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'focus' | 'shortBreak'>('focus');
  const [focusTips, setFocusTips] = useState<string[]>([]);
  const [isFetchingTips, setIsFetchingTips] = useState(false);
  const [isTipsDialogOpen, setIsTipsDialogOpen] = useState(false);
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
    }
  }, []);

  const handleSessionEnd = () => {
    setIsActive(false);
    audioRef.current?.play().catch(e => console.log("Audio play blocked by browser"));

    if (mode === 'focus') {
      if (activeTask && sessionStartTime) {
        const endTime = new Date();
        const newSession: FocusSession = {
          startTime: sessionStartTime.toISOString(),
          endTime: endTime.toISOString(),
        };
        const updatedSessions = [...(activeTask.focusSessions || []), newSession];
        // Pass user and newAttachments correctly
        updateTask(activeTask.id, { 
          focusSessions: updatedSessions,
          updatedAt: new Date().toISOString() // Explicitly set updatedAt
        }, user, []);

        const durationMs = endTime.getTime() - sessionStartTime.getTime();
        toast({
          title: "¡Sesión guardada!",
          description: `Se ha añadido ${formatDuration(durationMs)} a la tarea.`,
        });
      }
      switchMode('shortBreak', false);
    } else {
      toast({
        title: "¡Descanso terminado!",
        description: "Es hora de volver a enfocarse.",
      });
      switchMode('focus', false);
    }
    setSessionStartTime(null);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0 && isActive) {
      handleSessionEnd();
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, timeLeft, activeTask, sessionStartTime]); // Add dependencies

  const toggleTimer = () => {
    if (!isActive) {
      setSessionStartTime(new Date());
    }
    setIsActive(!isActive);
  };
  
  const resetTimer = () => {
    setIsActive(false);
    setSessionStartTime(null);
    setTimeLeft(mode === 'focus' ? FOCUS_DURATION : BREAK_DURATION);
  };

  const switchMode = (newMode: 'focus' | 'shortBreak', shouldDeactivate: boolean = true) => {
    setMode(newMode);
    if(shouldDeactivate) {
      setIsActive(false);
      setSessionStartTime(null);
    }
    setTimeLeft(newMode === 'focus' ? FOCUS_DURATION : BREAK_DURATION);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  const formatDuration = (milliseconds: number) => {
    if (isNaN(milliseconds) || milliseconds < 0) {
      return '0s';
    }
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let result = '';
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0) result += `${minutes}m `;
    if (seconds > 0 || (hours === 0 && minutes === 0)) result += `${seconds}s`;

    return result.trim();
  };

  const handleGetFocusTips = async () => {
    if (!activeTask) return;
    setIsFetchingTips(true);
    try {
      const result = await generateFocusTips({ taskDescription: activeTask.description || activeTask.title });
      setFocusTips(result.focusTips);
      setIsTipsDialogOpen(true);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error de IA",
        description: "No se pudieron generar los consejos.",
        variant: "destructive",
      });
    } finally {
      setIsFetchingTips(false);
    }
  };

  return (
    <div className="bg-sidebar text-sidebar-foreground p-6 rounded-2xl flex flex-col items-center justify-center space-y-6 h-full relative overflow-hidden shadow-xl">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-accent to-purple-500"></div>
      
      <div className="text-center z-10 w-full">
        <h3 className="text-sidebar-foreground/70 text-sm uppercase tracking-wider font-semibold mb-2">
          {mode === 'focus' ? 'Modo Enfoque Profundo' : 'Tiempo de Descanso'}
        </h3>
        {activeTask ? (
          <div className="bg-sidebar-accent/50 px-4 py-2 rounded-lg border border-sidebar-border mb-4">
             <span className="text-primary/80 text-sm">Trabajando en:</span>
             <p className="font-medium text-sidebar-foreground truncate max-w-[250px] mx-auto">{activeTask.title}</p>
          </div>
        ) : (
          <p className="text-sidebar-foreground/50 text-sm mb-4 italic h-[52px] flex items-center justify-center">Selecciona una tarea para enfocar</p>
        )}
        <div className="text-7xl font-mono font-bold tracking-tighter tabular-nums">
          {formatTime(timeLeft)}
        </div>
      </div>

      <div className="flex gap-3 z-10">
        <Button
          onClick={toggleTimer}
          size="lg"
          disabled={!activeTask && mode === 'focus'}
          className={`px-8 py-3 rounded-full font-bold transition-all transform hover:scale-105 ${isActive ? 'bg-destructive hover:bg-destructive/90' : 'bg-emerald-500 hover:bg-emerald-600'}`}
        >
          {isActive ? 'Pausar' : 'Iniciar'}
        </Button>
        <Button onClick={resetTimer} size="icon" variant="ghost" className="rounded-full bg-sidebar-accent hover:bg-sidebar-border">
          <Repeat size={20} />
        </Button>
        <Button onClick={handleGetFocusTips} disabled={!activeTask || isFetchingTips} size="icon" variant="ghost" className="rounded-full bg-sidebar-accent hover:bg-sidebar-border">
          {isFetchingTips ? <LoaderCircle size={20} className="animate-spin" /> : <Lightbulb size={20} />}
        </Button>
      </div>

      <div className="flex gap-2 text-xs font-medium z-10">
        <button onClick={() => switchMode('focus')} className={`px-3 py-1 rounded ${mode === 'focus' ? 'bg-sidebar-border text-sidebar-foreground' : 'text-sidebar-foreground/50'}`}>Pomodoro</button>
        <button onClick={() => switchMode('shortBreak')} className={`px-3 py-1 rounded ${mode === 'shortBreak' ? 'bg-sidebar-border text-sidebar-foreground' : 'text-sidebar-foreground/50'}`}>Descanso Corto</button>
      </div>

      <Dialog open={isTipsDialogOpen} onOpenChange={setIsTipsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lightbulb className="text-primary"/> Consejos de Enfoque para: {activeTask?.title}</DialogTitle>
            <DialogDescription>
              Aquí tienes algunas sugerencias generadas por IA para mantenerte concentrado en tu tarea.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-3 pt-4 list-disc pl-5">
            {focusTips.map((tip, index) => <li key={index}>{tip}</li>)}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
