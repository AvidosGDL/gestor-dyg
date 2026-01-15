
'use client';

import React, { useState } from 'react';
import { useInvestors } from '@/contexts/investors-context';
import { Investor } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Edit, Phone, Mail, Calendar, DollarSign, Percent, Landmark, Upload, Loader2, Sparkles, Plus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '../ui/badge';
// import EditInvestorDialog from './edit-investor-dialog'; // Will be created in a future step
import { format, parseISO } from 'date-fns';
import { recognizeInvestorsFromImage } from '@/ai/flows/recognize-investors-flow';
import { useToast } from '@/hooks/use-toast';

function InvestorCard({ investor, onEdit }: { investor: Investor, onEdit: (investor: Investor) => void }) {
  const { deleteInvestor } = useInvestors();

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>{investor.name}</CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <Mail size={14} className="text-muted-foreground" /> {investor.email || 'Sin correo'}
            </CardDescription>
            <CardDescription className="flex items-center gap-2">
              <Phone size={14} className="text-muted-foreground" /> {investor.phone || 'Sin teléfono'}
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
                    Esta acción no se puede deshacer. Se eliminará permanentemente al inversionista y todos sus datos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteInvestor(investor.id)} className="bg-destructive hover:bg-destructive/90">Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between">
        <div>
            <div className="text-sm text-muted-foreground mb-3 grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                    <DollarSign size={14} />
                    <span>${(investor.investmentAmount || 0).toLocaleString()}</span>
                </div>
                 <div className="flex items-center gap-2">
                    <Percent size={14} />
                    <span>{(investor.interestRate || 0)}% Interés</span>
                </div>
            </div>
            <Badge variant={investor.status === 'Activa' ? 'secondary' : 'outline'}>{investor.status}</Badge>
        </div>
        <Button variant="outline" className="w-full mt-4" onClick={() => onEdit(investor)}>
          <Edit size={16} className="mr-2" /> Ver / Editar
        </Button>
      </CardContent>
    </Card>
  );
}

const ImportFromImage = ({ onImport }: { onImport: (investors: Omit<Investor, 'id'>[]) => Promise<void> }) => {
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [isRecognizing, setIsRecognizing] = useState(false);
    const [recognizedInvestors, setRecognizedInvestors] = useState<Omit<Investor, 'id'>[]>([]);
    const { toast } = useToast();

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => setImageSrc(e.target?.result as string);
          reader.readAsDataURL(file);
        }
    };

    const handleRecognize = async () => {
        if (!imageSrc) return;
        setIsRecognizing(true);
        setRecognizedInvestors([]);
        try {
            const result = await recognizeInvestorsFromImage({ imageDataUri: imageSrc });
            setRecognizedInvestors(result.investors.map(inv => ({...inv})));
            toast({
                title: '¡Inversionistas Reconocidos!',
                description: `Se encontraron ${result.investors.length} inversionistas en la imagen. Por favor, verifica la información.`,
            });
        } catch (error) {
            console.error("Error recognizing investors:", error);
            toast({ variant: 'destructive', title: 'Error de Reconocimiento', description: 'No se pudo extraer la información de la imagen.' });
        } finally {
            setIsRecognizing(false);
        }
    };

    const handleConfirmImport = async () => {
        await onImport(recognizedInvestors);
        setRecognizedInvestors([]);
        setImageSrc(null);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Importar desde Imagen</CardTitle>
                <CardDescription>Sube una imagen de tu hoja de cálculo para importar inversionistas masivamente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-4">
                    <Button onClick={() => fileInputRef.current?.click()} className="flex-1">
                        <Upload className="mr-2" size={18} /> Subir Imagen
                    </Button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                    <Button onClick={handleRecognize} disabled={!imageSrc || isRecognizing} className="flex-1">
                        {isRecognizing ? <Loader2 className="mr-2 animate-spin" /> : <Sparkles className="mr-2" />}
                        Reconocer con IA
                    </Button>
                </div>
                {imageSrc && !isRecognizing && <img src={imageSrc} alt="Preview" className="max-h-40 w-auto rounded-md border" />}
                
                {recognizedInvestors.length > 0 && (
                    <div className="space-y-4 pt-4 border-t">
                        <h4 className="font-semibold">Verifica los datos a importar:</h4>
                        <ScrollArea className="h-60">
                            <ul className="space-y-2">
                                {recognizedInvestors.map((inv, idx) => (
                                    <li key={idx} className="text-sm p-2 bg-muted/50 rounded-md">
                                        <p className="font-bold">{inv.name}</p>
                                        <p>Monto: ${inv.investmentAmount.toLocaleString()}, Tasa: {inv.interestRate}%, Fecha: {inv.investmentDate}</p>
                                    </li>
                                ))}
                            </ul>
                        </ScrollArea>
                        <Button onClick={handleConfirmImport} className="w-full">
                            <Plus className="mr-2" /> Confirmar e Importar {recognizedInvestors.length} Inversionistas
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};


export default function InvestorsView() {
  const { investors, loading, bulkAddInvestors } = useInvestors();
  const [editingInvestor, setEditingInvestor] = useState<Investor | null>(null);

  const handleEdit = (investor: Investor) => {
    // setEditingInvestor(investor); // Will be enabled later
  };
  
  const handleCloseDialog = () => {
    setEditingInvestor(null);
  };


  if (loading) {
    return <p>Cargando inversionistas...</p>;
  }

  return (
    <>
    <div className="h-full space-y-6 overflow-y-auto p-2">
        <ImportFromImage onImport={bulkAddInvestors} />
        {investors.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {investors.map(investor => (
                <InvestorCard key={investor.id} investor={investor} onEdit={handleEdit} />
                ))}
            </div>
        ) : (
            <div className="flex flex-col items-center justify-center h-60 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                <Landmark size={48} className="mb-4" />
                <h3 className="text-lg font-semibold">No hay inversionistas registrados</h3>
                <p className="text-sm">Haz clic en "Nuevo Inversionista" o importa una imagen para empezar.</p>
            </div>
        )}
    </div>
    {/* {editingInvestor && (
        <EditInvestorDialog
            isOpen={!!editingInvestor}
            onOpenChange={handleCloseDialog}
            investor={editingInvestor}
        />
    )} */}
    </>
  );
}

