'use client';

import React, { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2 } from 'lucide-react';
import { useProjects } from '@/contexts/projects-context';
import { useToast } from '@/hooks/use-toast';
import type { Project } from '@/lib/types';

const projectSchema = z.object({
  name: z.string().min(1, 'El nombre del proyecto es requerido'),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

interface EditProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
}

export default function EditProjectDialog({
  open,
  onOpenChange,
  project
}: EditProjectDialogProps) {
  const { updateProject } = useProjects();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
  });

  useEffect(() => {
    if (project && open) {
      reset({ name: project.name });
    }
  }, [project, open, reset]);

  const onSubmit: SubmitHandler<ProjectFormValues> = async (data) => {
    try {
      await updateProject(project.id, data);
      toast({
        title: 'Proyecto Actualizado',
        description: `El proyecto ha sido renombrado a "${data.name}".`,
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al actualizar proyecto',
        description: error.message || 'Ocurrió un error inesperado.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Nombre del Proyecto</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del Proyecto</Label>
            <Input
              id="name"
              {...register('name')}
              disabled={isSubmitting}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
