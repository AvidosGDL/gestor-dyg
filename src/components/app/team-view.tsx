
'use client';

import React, { useState, useRef, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Trash2, Edit, Loader2, ImageUp, Wand2, LogIn, Send } from 'lucide-react';
import { type TeamMember } from '@/lib/types';
import { useCollection, useUser, useFirestore, useMemoFirebase, useAuth } from '@/firebase';
import { collection, deleteDoc, doc, updateDoc, writeBatch, getDocs, query, where, collectionGroup } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '../ui/alert-dialog';
import { Textarea } from '../ui/textarea';


const AVATAR_OPTIONS = 7;
const avatarCollection = 'lorelei';
const generateAvatarUrl = (seed: string) => `https://api.dicebear.com/8.x/${avatarCollection}/svg?seed=${seed}`;

const memberSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('El correo electrónico no es válido'),
  role: z.string().min(1, 'El rol es requerido'),
  phone: z.string().optional(),
  avatarUrl: z.string().url('Por favor, selecciona un avatar'),
  uid: z.string(),
});

type MemberFormValues = z.infer<typeof memberSchema>;

const testEmailSchema = z.object({
    to: z.string().email('El correo electrónico del destinatario no es válido.'),
    subject: z.string().min(1, 'El asunto es requerido.'),
    message: z.string().min(1, 'El mensaje es requerido.'),
});

type TestEmailFormValues = z.infer<typeof testEmailSchema>;


function EditMemberDialog({
  member,
  isOpen,
  onOpenChange,
  onSave,
}: {
  member: TeamMember | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (id: string, data: MemberFormValues) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customAvatarFile, setCustomAvatarFile] = useState<string | null>(null);
  const [customAvatarPreview, setCustomAvatarPreview] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema),
  });

  const selectedAvatarUrl = watch('avatarUrl');

  const avatarOptions = React.useMemo(() => {
    return Array.from({ length: AVATAR_OPTIONS }, (_, i) => generateAvatarUrl(`avatar-${i}`));
  }, []);

  React.useEffect(() => {
    if (member && isOpen) {
      reset(member);
      if (member.avatarUrl && !avatarOptions.includes(member.avatarUrl)) {
        setCustomAvatarPreview(member.avatarUrl);
      } else {
        setCustomAvatarPreview(null);
      }
      setCustomAvatarFile(null);
    }
  }, [member, isOpen, reset, avatarOptions]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setCustomAvatarFile(dataUrl);
        setCustomAvatarPreview(dataUrl);
        setValue('avatarUrl', dataUrl, { shouldValidate: true });
      };
      reader.readAsDataURL(file);
    }
  };
  
  const uploadAvatar = async (email: string, dataUrl: string): Promise<string> => {
    const storage = getStorage();
    const avatarRef = storageRef(storage, `avatars/${email}/${Date.now()}`);
    await uploadString(avatarRef, dataUrl, 'data_url');
    return getDownloadURL(avatarRef);
  }

  const handleSave: SubmitHandler<MemberFormValues> = async (data) => {
    if (member) {
      let finalAvatarUrl = data.avatarUrl;
      if (customAvatarFile) {
        finalAvatarUrl = await uploadAvatar(member.email, customAvatarFile);
      }
      onSave(member.id, {...data, avatarUrl: finalAvatarUrl});
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Miembro del Equipo</DialogTitle>
          <DialogDescription>
            Actualiza los detalles y el avatar del miembro del equipo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
          <div className="space-y-2">
            <Label>Avatar</Label>
            <div className="grid grid-cols-4 gap-4">
              {avatarOptions.map((url, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    setValue('avatarUrl', url, { shouldValidate: true });
                    setCustomAvatarPreview(null);
                  }}
                  className={cn(
                    "rounded-full p-1 transition-all",
                    selectedAvatarUrl === url && !customAvatarPreview
                      ? 'ring-2 ring-primary ring-offset-2'
                      : 'ring-1 ring-transparent hover:ring-primary/50'
                  )}
                >
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={url} alt={`Avatar ${index + 1}`} />
                  </Avatar>
                </button>
              ))}
               <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "rounded-full p-1 transition-all flex items-center justify-center bg-muted hover:bg-border",
                    customAvatarPreview
                      ? 'ring-2 ring-primary ring-offset-2'
                      : 'ring-1 ring-transparent hover:ring-primary/50'
                  )}
                >
                  <Avatar className="h-16 w-16">
                    {customAvatarPreview ? (
                      <AvatarImage src={customAvatarPreview} alt="Avatar personalizado" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageUp className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                  </Avatar>
                </button>
                <Input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/png, image/jpeg, image/gif"
                  onChange={handleFileChange}
                />
            </div>
            {errors.avatarUrl && (
              <p className="text-sm text-destructive">{errors.avatarUrl.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-name">Nombre Completo</Label>
            <Input
              id="edit-name"
              placeholder="Ej. Juan Pérez"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-email">Correo Electrónico</Label>
            <Input
              id="edit-email"
              type="email"
              placeholder="juan.perez@tuempresa.com"
              {...register('email')}
              disabled
              className="disabled:opacity-100 disabled:cursor-not-allowed bg-muted/50"
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-role">Rol</Label>
            <Input
              id="edit-role"
              placeholder="Ej. Diseñador Gráfico"
              {...register('role')}
            />
            {errors.role && (
              <p className="text-sm text-destructive">{errors.role.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-phone">Teléfono</Label>
            <Input
              id="edit-phone"
              placeholder="Ej. +1 234 567 890"
              {...register('phone')}
            />
            {errors.phone && (
              <p className="text-sm text-destructive">{errors.phone.message}</p>
            )}
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

export default function TeamView() {
  const { user, loading: userLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [impersonationEmail, setImpersonationEmail] = useState('');

  const collectionPath = user ? `users/${user.uid}/teamMembers` : null;
  const membersCollectionRef = useMemoFirebase(() => {
    return collectionPath ? collection(firestore, collectionPath) : null;
  }, [collectionPath, firestore]);
  
  const { data: members, loading: membersLoading } =
    useCollection<TeamMember>(membersCollectionRef);

  const [isEditMemberDialogOpen, setIsEditMemberDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  
  const {
    register: registerTestEmail,
    handleSubmit: handleSubmitTestEmail,
    formState: { errors: testEmailErrors, isSubmitting: isSendingTestEmail },
    reset: resetTestEmailForm,
  } = useForm<TestEmailFormValues>({
      resolver: zodResolver(testEmailSchema),
  });

  const editMember = (member: TeamMember) => {
    setSelectedMember(member);
    setIsEditMemberDialogOpen(true);
  };

  const handleSaveMember = async (id: string, data: MemberFormValues) => {
    if (!collectionPath) return;
    const docRef = doc(firestore, collectionPath, id);
    const updatedData = { ...data };
    try {
      await updateDoc(docRef, updatedData);
      toast({
        title: 'Miembro Actualizado',
        description: `Los datos de ${updatedData.name} han sido actualizados.`,
      });
      setIsEditMemberDialogOpen(false);
      setSelectedMember(null);
    } catch (serverError) {
      const permissionError = new FirestorePermissionError({
        path: docRef.path,
        operation: 'update',
        requestResourceData: updatedData,
      });
      errorEmitter.emit('permission-error', permissionError);
    }
  };

  const deleteMember = (id: string) => {
    if (!collectionPath) return;
    const docRef = doc(firestore, collectionPath, id);
    deleteDoc(docRef).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: docRef.path,
        operation: 'delete',
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  };

  const handleMigration = async () => {
    if (!firestore || !user) return;
    setIsProcessing(true);
    toast({ title: 'Iniciando migración global...', description: 'Corrigiendo `delegateToId` en todas las tareas.' });

    try {
        const allUsersRef = collection(firestore, "users");
        const allUsersSnap = await getDocs(allUsersRef);
        const emailToUidMap = new Map<string, string>();
        allUsersSnap.forEach(doc => {
            const userData = doc.data();
            if (userData.email) {
                emailToUidMap.set(userData.email, doc.id);
            }
        });
        
        const tasksToFixQuery = query(
            collection(firestore, "tasks"), 
            where('delegateToEmail', '!=', null),
            where('delegateToId', '==', null)
        );
        
        const tasksSnap = await getDocs(tasksToFixQuery);
        
        const batch = writeBatch(firestore);
        let updatedCount = 0;

        tasksSnap.forEach(taskDoc => {
            const task = taskDoc.data() as any;
            if (task.delegateToEmail) {
                const correctUid = emailToUidMap.get(task.delegateToEmail);
                if (correctUid) {
                    const taskRef = doc(firestore, "tasks", taskDoc.id);
                    batch.update(taskRef, { delegateToId: correctUid });
                    updatedCount++;
                }
            }
        });


        if (updatedCount > 0) {
            await batch.commit();
            toast({ title: '¡Migración Global Completada!', description: `${updatedCount} tareas han sido actualizadas en toda la plataforma.` });
        } else {
            toast({ title: 'Migración Global Finalizada', description: 'No se encontraron tareas delegadas para actualizar.' });
        }

    } catch (error: any) {
        console.error("Error durante la migración global: ", error);
        toast({
            variant: "destructive",
            title: 'Error en la Migración Global',
            description: error.message || 'Ocurrió un error inesperado.'
        });
    } finally {
        setIsProcessing(false);
    }
};

  const handleSyncUids = async () => {
    setIsProcessing(true);
    toast({ title: 'Sincronizando UIDs para todos los equipos...', description: 'Este proceso puede tardar unos momentos.' });

    try {
        const functions = getFunctions();
        const syncUidsFn = httpsCallable(functions, 'syncAllTeamMemberUIDs');
        const result: any = await syncUidsFn();

        const { updatedCount } = result.data;
        
        if (updatedCount > 0) {
            toast({ title: '¡Sincronización Global Completada!', description: `${updatedCount} miembros del equipo han sido actualizados en toda la plataforma.` });
        } else {
            toast({ title: 'Sincronización Finalizada', description: 'Todos los UIDs en todos los equipos ya estaban correctos.' });
        }
    } catch (error: any) {
        console.error("Error durante la sincronización global de UIDs: ", error);
        toast({
            variant: "destructive",
            title: 'Error en la Sincronización Global',
            description: error.message || 'Ocurrió un error inesperado.'
        });
    } finally {
        setIsProcessing(false);
    }
  };


  const handleImpersonate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!impersonationEmail.trim() || !auth) return;

    setIsProcessing(true);
    toast({ title: 'Iniciando suplantación...', description: `Solicitando acceso como ${impersonationEmail}`});

    try {
        const functions = getFunctions();
        const createImpersonationToken = httpsCallable(functions, 'createImpersonationToken');
        const result: any = await createImpersonationToken({ email: impersonationEmail });
        
        const { token } = result.data;

        await signInWithCustomToken(auth, token);
        
        toast({ title: '¡Éxito!', description: 'Has iniciado sesión como otro usuario. Recargando...' });
        
        localStorage.setItem('impersonator_uid', user!.uid);
        window.location.href = '/';

    } catch (error: any) {
        console.error('Error al suplantar:', error);
        toast({
            variant: 'destructive',
            title: 'Error de Suplantación',
            description: error.message || 'No se pudo completar la operación.',
        });
    } finally {
        setIsProcessing(false);
    }
  }

  const onSendTestEmail: SubmitHandler<TestEmailFormValues> = async (data) => {
    toast({ title: 'Enviando correo de prueba...', description: `A: ${data.to}` });
    try {
      const functions = getFunctions();
      const sendTestEmailFn = httpsCallable(functions, 'sendTestEmail');
      await sendTestEmailFn(data);
      toast({
        title: '¡Correo Enviado!',
        description: 'El correo de prueba se ha enviado correctamente.',
      });
      resetTestEmailForm();
    } catch (error: any) {
      console.error('Error enviando correo de prueba:', error);
      toast({
        variant: 'destructive',
        title: 'Error al enviar correo',
        description: error.message || 'Ocurrió un error inesperado.',
      });
    }
  };
  
  const handleMigrateOwnerIds = async () => {
    setIsProcessing(true);
    toast({ title: 'Iniciando migración de dueños...', description: 'Esto asignará un jefe a todos los miembros de equipo existentes.' });

    try {
        const functions = getFunctions();
        const migrateOwnerIdsFn = httpsCallable(functions, 'migrateOwnerIds');
        const result: any = await migrateOwnerIdsFn();
        
        const { updatedCount } = result.data;
        toast({ title: '¡Migración Completada!', description: `${updatedCount} miembros de equipo han sido actualizados con su respectivo jefe.` });

    } catch (error: any) {
        console.error("Error durante la migración de ownerId: ", error);
        toast({
            variant: "destructive",
            title: 'Error en la Migración',
            description: error.message || 'Ocurrió un error inesperado.'
        });
    } finally {
        setIsProcessing(false);
    }
  }


  const isLoading = userLoading || membersLoading;
  const isAdmin = user?.uid === 'fKZUAAXTENPcUeEA4tUXFEV4xbr1';

  return (
    <>
      <div className="h-full space-y-4">
        {isAdmin && (
            <Card>
                 <CardHeader>
                    <CardTitle>Panel de Administrador</CardTitle>
                    <CardDescription>Herramientas especiales para la gestión, diagnóstico y reparación de datos.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4 p-4 border rounded-lg">
                     <h4 className="font-semibold">Suplantación de Usuario</h4>
                     <form onSubmit={handleImpersonate} className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                        <div className="w-full sm:w-auto flex-grow">
                          <Label htmlFor="impersonate-email" className="sr-only">Correo electrónico</Label>
                          <Input
                            id="impersonate-email" 
                            type="email"
                            placeholder="Email del usuario a suplantar"
                            value={impersonationEmail}
                            onChange={(e) => setImpersonationEmail(e.target.value)}
                            disabled={isProcessing}
                          />
                        </div>
                        <Button type="submit" disabled={isProcessing || !impersonationEmail}>
                           {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                           Iniciar Sesión Como
                        </Button>
                     </form>
                     <p className="text-xs text-muted-foreground mt-2">
                        Inicia sesión como cualquier usuario del sistema para verificar su funcionalidad.
                     </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button disabled={isProcessing} variant="secondary" className="w-full justify-start">
                                    <Wand2 className="mr-2 h-4 w-4" />
                                    Sincronizar Jefes (Migración)
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Confirmar Migración de Jefes de Equipo?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta acción recorrerá todos los equipos y asignará un jefe (`ownerId`) a cada miembro que no lo tenga. Es un paso crucial para que los miembros antiguos puedan delegar tareas a sus jefes.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleMigrateOwnerIds} disabled={isProcessing}>Sí, iniciar migración</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        <p className="text-xs text-muted-foreground mt-2">
                           Actualiza todos los miembros de equipo existentes para asignarles su jefe.
                        </p>
                    </div>
                    <div>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button disabled={isProcessing} className="w-full justify-start">
                                    <Wand2 className="mr-2 h-4 w-4" />
                                    Sincronizar UIDs del Equipo (Global)
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Confirmar Sincronización Global de UIDs?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta acción escaneará TODOS los equipos de TODOS los usuarios en la plataforma. Verificará que el UID de cada miembro sea el correcto y lo corregirá si es necesario. Esto es fundamental para la integridad de los datos en toda la aplicación.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleSyncUids} disabled={isProcessing}>Sí, sincronizar todo</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        <p className="text-xs text-muted-foreground mt-2">
                           Repara los UIDs incorrectos de los miembros de todos los equipos.
                        </p>
                    </div>
                     <div>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button disabled={isProcessing} variant="secondary" className="w-full justify-start">
                                    <Wand2 className="mr-2 h-4 w-4" />
                                    Migrar Delegaciones (Global)
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Confirmar Migración de Datos Global?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta acción buscará en TODAS las tareas de la plataforma aquellas que tengan un correo de delegación pero no un UID. Intentará asignar el UID correcto basado en el correo. Ejecútala después de sincronizar los UIDs para asegurar que la información es correcta.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleMigration} disabled={isProcessing}>Sí, iniciar migración global</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        <p className="text-xs text-muted-foreground mt-2">
                           Corrige todas las tareas delegadas antiguas que no tienen el UID asignado.
                        </p>
                    </div>
                  </div>
                   <div className="space-y-4 p-4 border rounded-lg">
                     <h4 className="font-semibold">Enviar Correo de Prueba</h4>
                     <form onSubmit={handleSubmitTestEmail(onSendTestEmail)} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                             <div className="space-y-2">
                                <Label htmlFor="test-email-to">Destinatario</Label>
                                <Input id="test-email-to" type="email" placeholder="destinatario@ejemplo.com" {...registerTestEmail("to")} />
                                {testEmailErrors.to && <p className="text-sm text-destructive">{testEmailErrors.to.message}</p>}
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="test-email-subject">Asunto</Label>
                                <Input id="test-email-subject" placeholder="Asunto del correo" {...registerTestEmail("subject")} />
                                {testEmailErrors.subject && <p className="text-sm text-destructive">{testEmailErrors.subject.message}</p>}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="test-email-message">Mensaje</Label>
                            <Textarea id="test-email-message" placeholder="Escribe tu mensaje aquí..." {...registerTestEmail("message")} />
                            {testEmailErrors.message && <p className="text-sm text-destructive">{testEmailErrors.message.message}</p>}
                        </div>
                        <Button type="submit" disabled={isSendingTestEmail}>
                           {isSendingTestEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                           Enviar Correo de Prueba
                        </Button>
                     </form>
                  </div>
                </CardContent>
            </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Miembros del Equipo</CardTitle>
            <CardDescription>
              Aquí puedes ver y administrar los miembros de tu equipo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Miembro</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">
                      <div className="flex justify-center items-center p-4">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading &&
                  members &&
                  members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage
                              src={member.avatarUrl}
                              alt={member.name}
                            />
                            <AvatarFallback>
                              {member.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{member.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {member.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{member.role}</Badge>
                      </TableCell>
                       <TableCell>
                         <Badge variant="outline">Activo</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); editMember(member); }}
                        >
                          <Edit className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción no se puede deshacer. Se eliminará permanentemente al miembro <span className="font-bold">{member.name}</span> del equipo. Las tareas delegadas no se verán afectadas pero no se podrán re-delegar a este usuario.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMember(member.id)} className="bg-destructive hover:bg-destructive/90">Eliminar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                {!isLoading && (!members || members.length === 0) && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-10 text-muted-foreground"
                    >
                      No hay miembros en el equipo todavía. Haz clic en "Nuevo Miembro" para agregar uno.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <EditMemberDialog
        isOpen={isEditMemberDialogOpen}
        onOpenChange={setIsEditMemberDialogOpen}
        member={selectedMember}
        onSave={handleSaveMember}
      />
    </>
  );
}
