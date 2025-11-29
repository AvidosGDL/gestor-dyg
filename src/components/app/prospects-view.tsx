'use client';

import React, { useState } from 'react';
import { useProspects } from '@/contexts/prospects-context';
import { Prospect } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Edit, Phone, Mail, Calendar, Plus, Handshake } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '../ui/badge';
import EditProspectDialog from './edit-prospect-dialog';
import { format, isPast } from 'date-fns';
import { es } from 'date-fns/locale';

function ProspectCard({ prospect, onEdit }: { prospect: Prospect, onEdit: (prospect: Prospect) => void }) {
  const { deleteProspect } = useProspects();

  const nextContactDateFormatted = prospect.nextContactDate 
    ? format(new Date(prospect.nextContactDate), "d 'de' MMMM", { locale: es })
    : null;
  
  const isDatePast = prospect.nextContactDate ? isPast(new Date(prospect.nextContactDate)) && !new Date(prospect.nextContactDate).toDateString().includes(new Date().toDateString()) : false;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>{prospect.name}</CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <Mail size={14} className="text-muted-foreground" /> {prospect.email || 'Sin correo'}
            </CardDescription>
            <CardDescription className="flex items-center gap-2">
              <Phone size={14} className="text-muted-foreground" /> {prospect.phone || 'Sin teléfono'}
            </CardDescription>
          </div>
           <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8">
                  <Trash2 size={16} />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción no se puede deshacer. Se eliminará permanentemente el prospecto y todos sus datos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteProspect(prospect.id)} className="bg-destructive hover:bg-destructive/90">Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between">
        <div>
            <p className="text-sm text-muted-foreground mb-3">{prospect.businessDescription}</p>
            {nextContactDateFormatted && (
                <Badge variant={isDatePast ? 'destructive' : 'secondary'} className="flex items-center gap-2 w-fit">
                    <Calendar size={14} />
                    Próximo contacto: {nextContactDateFormatted}
                </Badge>
            )}
        </div>
        <Button variant="outline" className="w-full mt-4" onClick={() => onEdit(prospect)}>
          <Edit size={16} className="mr-2" /> Ver / Editar Historial
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ProspectsView() {
  const { prospects, loading } = useProspects();
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);

  const handleEdit = (prospect: Prospect) => {
    setEditingProspect(prospect);
  };
  
  const handleCloseDialog = () => {
    setEditingProspect(null);
  };


  if (loading) {
    return <p>Cargando prospectos...</p>;
  }

  return (
    <>
    <div className="h-full">
        {prospects.length > 0 ? (
            <ScrollArea className="h-full pb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {prospects.map(prospect => (
                    <ProspectCard key={prospect.id} prospect={prospect} onEdit={handleEdit} />
                    ))}
                </div>
            </ScrollArea>
        ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <Handshake size={48} className="mb-4" />
                <h3 className="text-lg font-semibold">No hay prospectos todavía</h3>
                <p className="text-sm">Haz clic en "Nuevo Prospecto" para empezar a registrar oportunidades.</p>
            </div>
        )}
    </div>
    {editingProspect && (
        <EditProspectDialog
            isOpen={!!editingProspect}
            onOpenChange={handleCloseDialog}
            prospect={editingProspect}
        />
    )}
    </>
  );
}
