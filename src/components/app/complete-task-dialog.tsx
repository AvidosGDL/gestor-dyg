'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useTasks } from '@/contexts/tasks-context';
import type { Task } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useStorage } from '@/hooks/use-storage';
import { Loader2, Upload, X, File as FileIcon } from 'lucide-react';
import { Progress } from '../ui/progress';

interface CompleteTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
}

export default function CompleteTaskDialog({ open, onOpenChange, task }: CompleteTaskDialogProps) {
  const { updateTask } = useTasks();
  const { toast } = useToast();
  const { uploadFiles, isUploading, progress } = useStorage();
  
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files ?? [])]);
    }
  };
  
  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    let evidenceUrls: string[] = [];
    
    if (files.length > 0) {
        try {
            const urls = await uploadFiles(files, `tasks/${task.id}`);
            evidenceUrls = urls;
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Error al subir archivos",
                description: "No se pudieron subir las evidencias. Inténtalo de nuevo.",
            });
            setIsSubmitting(false);
            return;
        }
    }

    const updateData: Partial<Task> = {
      status: 'completado',
      completionComment: comment,
      evidenceUrls: evidenceUrls,
    };

    updateTask(task.id, updateData);
    
    toast({
      title: '¡Tarea Completada!',
      description: `"${task.title}" ha sido marcada como completada.`,
    });
    
    setIsSubmitting(false);
    onOpenChange(false);
    setComment('');
    setFiles([]);
  };
  
  const isActionDisabled = isSubmitting || isUploading;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
        if (!isActionDisabled) {
            onOpenChange(isOpen);
        }
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Completar Tarea: {task.title}</DialogTitle>
          <DialogDescription>
            Agrega un comentario final y adjunta evidencias si es necesario.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="comment">Comentario de Cierre</Label>
            <Textarea
              id="comment"
              placeholder="Describe cómo se completó la tarea, resultados, etc."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={isActionDisabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="files">Evidencias (Fotos, PDFs, etc.)</Label>
            <div className="flex items-center justify-center w-full">
                <label htmlFor="dropzone-file" className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted ${isActionDisabled ? 'cursor-not-allowed opacity-50' : ''}`}>
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                        <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Click para subir</span> o arrastra y suelta</p>
                    </div>
                    <Input id="dropzone-file" type="file" className="hidden" multiple onChange={handleFileChange} disabled={isActionDisabled} />
                </label>
            </div>
          </div>
          
          {isUploading && (
             <div className="space-y-2">
                <Label>Subiendo archivos...</Label>
                <Progress value={progress} className="w-full" />
                <p className="text-sm text-muted-foreground text-center">{Math.round(progress)}%</p>
             </div>
          )}

          {files.length > 0 && !isUploading && (
            <div className="space-y-2">
              <Label>Archivos Seleccionados</Label>
              <div className="space-y-2">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                    <div className="flex items-center gap-2 truncate">
                      <FileIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm truncate">{file.name}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFile(index)} disabled={isActionDisabled}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isActionDisabled}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isActionDisabled}>
            {isActionDisabled && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Marcar como Completada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
