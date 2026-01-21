
'use client';

import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useProjects } from '@/contexts/projects-context';
import { useToast } from '@/hooks/use-toast';
import { FileUp, Loader2, Upload, X, ArrowRight } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import type { ProjectActivity } from '@/lib/types';

type Step = 'upload' | 'review' | 'importing';

interface ImportProjectDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export default function ImportProjectDialog({ isOpen, onOpenChange }: ImportProjectDialogProps) {
  const { importProjectFromCSV } = useProjects();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [projectName, setProjectName] = useState('');
  const [parsedActivities, setParsedActivities] = useState<Omit<ProjectActivity, 'id'>[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setStep('upload');
    setFile(null);
    setProjectName('');
    setParsedActivities([]);
    onOpenChange(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      if (e.target.files[0].type !== 'text/csv') {
        toast({ variant: 'destructive', title: 'Archivo no válido', description: 'Por favor, sube un archivo CSV.' });
        return;
      }
      setFile(e.target.files[0]);
    }
  };

  const handleParse = () => {
    if (!file || !projectName) {
      toast({ variant: 'destructive', title: 'Faltan datos', description: 'Por favor, proporciona un nombre de proyecto y un archivo CSV.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const rows = text.split('\n').filter(row => row.trim() !== '');
        const headers = rows[0].split(',').map(h => h.trim());
        const expectedHeaders = ['ID Actividad', 'Nombre Actividad', 'Fecha Inicio', 'Duracion (dias)', 'Dependencia (ID)', 'Costo Presupuestado'];
        
        // Basic header check
        if (expectedHeaders.some(h => !headers.includes(h))) {
             toast({ variant: 'destructive', title: 'Cabeceras incorrectas', description: `El CSV debe tener las columnas: ${expectedHeaders.join(', ')}` });
             return;
        }
        
        const activities: Omit<ProjectActivity, 'id'>[] = rows.slice(1).map(row => {
          const values = row.split(',');
          const activityData: any = {};
          headers.forEach((header, index) => {
              activityData[header] = values[index].trim();
          });
          
          return {
            name: activityData['Nombre Actividad'],
            startDate: new Date(activityData['Fecha Inicio']).toISOString(),
            durationDays: parseInt(activityData['Duracion (dias)'], 10),
            dependencyId: activityData['Dependencia (ID)'] || null,
            budgetedCost: parseFloat(activityData['Costo Presupuestado']),
            actualCost: 0,
            progress: 0,
          };
        });

        setParsedActivities(activities);
        setStep('review');
      } catch (error) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error al procesar', description: 'El formato del archivo CSV no es correcto.' });
      }
    };
    reader.readAsText(file);
  };
  
  const handleImport = async () => {
    setStep('importing');
    await importProjectFromCSV(projectName, parsedActivities);
    handleClose();
  };

  const renderContent = () => {
    if (step === 'importing') {
      return (
        <div className="flex flex-col items-center justify-center text-center p-12 space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <h3 className="text-lg font-semibold">Importando Proyecto...</h3>
        </div>
      );
    }
    
    if (step === 'review') {
        return (
            <div className="space-y-4">
                <Alert>
                    <AlertTitle>Revisa los Datos a Importar</AlertTitle>
                    <AlertDescription>Se creará el proyecto "{projectName}" con {parsedActivities.length} actividades. Verifica que los datos sean correctos.</AlertDescription>
                </Alert>
                <div className="max-h-[50vh] overflow-y-auto border rounded-lg">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Actividad</TableHead>
                                <TableHead>Inicio</TableHead>
                                <TableHead>Duración</TableHead>
                                <TableHead>Costo</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {parsedActivities.map((act, i) => (
                                <TableRow key={i}>
                                    <TableCell>{act.name}</TableCell>
                                    <TableCell>{new Date(act.startDate).toLocaleDateString()}</TableCell>
                                    <TableCell>{act.durationDays} días</TableCell>
                                    <TableCell>${act.budgetedCost.toLocaleString()}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        );
    }
    
    return (
      <div className="space-y-4">
        <div className="space-y-2">
            <Label htmlFor="projectName">Nombre del Nuevo Proyecto</Label>
            <Input id="projectName" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Ej. Remodelación Oficina Central" />
        </div>
        <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors">
          <FileUp className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <h3 className="font-semibold">Haz clic para seleccionar el archivo CSV</h3>
          <p className="text-sm text-muted-foreground">O arrastra y suelta el archivo aquí</p>
          <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileChange} />
        </div>
        {file && (
          <div className="flex items-center justify-between text-sm bg-muted/50 p-2 rounded-md">
            <span>{file.name}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFile(null)}><X className="h-4 w-4" /></Button>
          </div>
        )}
      </div>
    );
  };

  const renderFooter = () => {
    if (step === 'upload') {
        return (
            <>
                <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
                <Button onClick={handleParse} disabled={!file || !projectName}>
                    Continuar <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
            </>
        );
    }
     if (step === 'review') {
        return (
            <>
                <Button variant="ghost" onClick={() => setStep('upload')}>Volver</Button>
                <Button onClick={handleImport}>
                    <Upload className="mr-2 h-4 w-4" /> Confirmar e Importar
                </Button>
            </>
        );
    }
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar Proyecto desde CSV</DialogTitle>
          <DialogDescription>
            Crea un proyecto y todas sus actividades subiendo un archivo CSV.
          </DialogDescription>
        </DialogHeader>
        {renderContent()}
        <DialogFooter className="pt-4 mt-4 border-t">
           {renderFooter()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    