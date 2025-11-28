'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Lightbulb, LoaderCircle, Repeat } from 'lucide-react';
import type { Task } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { generateFocusTips } from '@/ai/flows/generate-focus-tips';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface PomodoroTimerProps {
  activeTask: Task | null;
}

export default function PomodoroTimer({ activeTask }: PomodoroTimerProps) {
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'focus' | 'shortBreak'>('focus');
  const [focusTips, setFocusTips] = useState<string[]>([]);
  const [isFetchingTips, setIsFetchingTips] = useState(false);
  const [isTipsDialogOpen, setIsTipsDialogOpen] = useState(false);
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
    }
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      if (mode === 'focus') {
        toast({
          title: "¡Sesión completada!",
          description: "Tómate un merecido descanso.",
        });
        audioRef.current?.play().catch(e => console.log("Audio play blocked by browser"));
        // Automatically switch to short break
        setMode('shortBreak');
        setTimeLeft(5 * 60);
      } else {
        toast({
          title: "¡Descanso terminado!",
          description: "Es hora de volver a enfocarse.",
        });
        audioRef.current?.play().catch(e => console.log("Audio play blocked by browser"));
        // Switch back to focus
        setMode('focus');
        setTimeLeft(25 * 60);
      }
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, timeLeft, mode, toast]);

  const toggleTimer = () => setIsActive(!isActive);

  const resetTimer = () => {
    setIsActive(false);
    if (mode === 'focus') setTimeLeft(25 * 60);
    if (mode === 'shortBreak') setTimeLeft(5 * 60);
  };

  const switchMode = (newMode: 'focus' | 'shortBreak') => {
    setMode(newMode);
    setIsActive(false);
    setTimeLeft(newMode === 'focus' ? 25 * 60 : 5 * 60);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
