'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Upload,
  Sparkles,
  Loader2,
  FileUp,
  X,
  Plus,
  ArrowRight,
  ListPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { recognizeTasksFromImage } from '@/ai/flows/recognize-tasks-flow';
import NewTaskDialog from './new-task-dialog';
import { useTasks } from '@/contexts/tasks-context';

interface RecognizedTask {
  id: string;
  title: string;
}

export default function ImportView() {
  const { addTask } = useTasks();
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognizedTasks, setRecognizedTasks] = useState<RecognizedTask[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (showCamera) {
      const getCameraPermission = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          setHasCameraPermission(true);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (error) {
          console.error('Error accessing camera:', error);
          setHasCameraPermission(false);
          toast({
            variant: 'destructive',
            title: 'Acceso a la cámara denegado',
            description: 'Por favor, activa los permisos de cámara en tu navegador para usar esta función.',
          });
          setShowCamera(false);
        }
      };
      getCameraPermission();
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    }
  }, [showCamera, toast]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageSrc(e.target?.result as string);
        setShowCamera(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      context?.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      const dataUrl = canvas.toDataURL('image/jpeg');
      setImageSrc(dataUrl);
      setShowCamera(false);
    }
  };

  const handleRecognize = async () => {
    if (!imageSrc) return;
    setIsRecognizing(true);
    try {
      const result = await recognizeTasksFromImage({ imageDataUri: imageSrc });
      setRecognizedTasks(result.tasks.map(t => ({ id: crypto.randomUUID(), title: t.title })));
      toast({
        title: '¡Tareas reconocidas!',
        description: 'Revisa la lista y completa la información.',
      });
    } catch (error) {
      console.error('Error recognizing tasks:', error);
      toast({
        variant: 'destructive',
        title: 'Error de Reconocimiento',
        description: 'No se pudieron reconocer las tareas de la imagen. Inténtalo con una foto más clara.',
      });
    } finally {
      setIsRecognizing(false);
    }
  };

  const handleImportTask = (taskTitle: string, index: number) => {
    addTask({
      title: taskTitle,
      description: 'Importada desde imagen.',
      status: 'pendiente',
      priority: 'medium',
      progress: 0,
      value: 0,
      probability: 50,
      client: '',
      dueDate: '',
    });
    setRecognizedTasks(prev => prev.filter((_, i) => i !== index));
    toast({
      title: 'Tarea Importada',
      description: `"${taskTitle}" ha sido añadida a tu tablero.`,
    });
  };

  return (
    <div className="h-full overflow-y-auto p-2">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Columna de Captura */}
        <Card>
          <CardHeader>
            <CardTitle>1. Captura tu lista de Tareas</CardTitle>
            <CardDescription>Toma una foto o sube una imagen de tu lista de tareas escrita a mano.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-4 min-h-[300px] flex items-center justify-center relative bg-muted/20">
              {imageSrc && !showCamera && (
                <>
                  <img src={imageSrc} alt="Preview" className="max-h-[400px] w-auto rounded-md" />
                  <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={() => setImageSrc(null)}>
                    <X size={16} />
                  </Button>
                </>
              )}
              {showCamera && (
                <div className="w-full">
                  <video ref={videoRef} className="w-full aspect-video rounded-md" autoPlay muted playsInline />
                  {!hasCameraPermission && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertTitle>Se requiere acceso a la cámara</AlertTitle>
                      <AlertDescription>Por favor, permite el acceso a la cámara para usar esta función.</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
              {!imageSrc && !showCamera && (
                <div className="text-center text-muted-foreground">
                  <FileUp size={48} className="mx-auto mb-2" />
                  <p>Sube una imagen o usa tu cámara</p>
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="flex gap-4">
              <Button onClick={() => fileInputRef.current?.click()} className="flex-1">
                <Upload className="mr-2" size={18} /> Subir Archivo
              </Button>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />

              {showCamera ? (
                <>
                  <Button onClick={handleCapture} className="flex-1" variant="secondary" disabled={!hasCameraPermission}>
                    <Camera className="mr-2" size={18} /> Tomar Foto
                  </Button>
                  <Button onClick={() => setShowCamera(false)} variant="ghost">Cancelar</Button>
                </>
              ) : (
                <Button onClick={() => setShowCamera(true)} className="flex-1" variant="secondary">
                  <Camera className="mr-2" size={18} /> Usar Cámara
                </Button>
              )}
            </div>

            <Button onClick={handleRecognize} disabled={!imageSrc || isRecognizing} className="w-full" size="lg">
              {isRecognizing ? <Loader2 className="mr-2 animate-spin" /> : <Sparkles className="mr-2" />}
              Reconocer Tareas con IA
            </Button>
          </CardContent>
        </Card>

        {/* Columna de Importación */}
        <Card>
          <CardHeader>
            <CardTitle>2. Tareas a Importar</CardTitle>
            <CardDescription>Revisa las tareas reconocidas y añádelas a tu tablero.</CardDescription>
          </CardHeader>
          <CardContent>
            {recognizedTasks.length > 0 ? (
              <ul className="space-y-3">
                {recognizedTasks.map((task, index) => (
                  <li key={task.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <span className="flex-1 font-medium">{task.title}</span>
                    <Button size="sm" onClick={() => handleImportTask(task.title, index)}>
                      <Plus className="mr-2" size={16} /> Importar
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-10 text-muted-foreground/60 border-2 border-dashed rounded-xl">
                <ListPlus className="mx-auto mb-2" />
                <p className="text-sm">Aquí aparecerán las tareas reconocidas.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
