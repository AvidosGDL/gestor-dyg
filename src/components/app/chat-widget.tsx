
'use client';

import React, { useState } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader } from '../ui/card';
import { cn } from '@/lib/utils';
import { useChat } from '@/contexts/chat-context';
import { useUser, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import type { TeamMember } from '@/lib/types';
import { collection } from 'firebase/firestore';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';

const ConversationList = ({ onSelectConversation, activeConversationId }: any) => {
    const { conversations, loading } = useChat();
    const { user } = useUser();

    if (loading) return <div className="p-4 text-center text-sm">Cargando...</div>;

    return (
        <div className="flex-1 overflow-y-auto">
            {conversations.map(convo => {
                const otherMemberId = convo.memberIds.find(id => id !== user?.uid);
                const otherMember = otherMemberId ? convo.members[otherMemberId] : null;
                const lastMessage = convo.lastMessage;

                return (
                    <div 
                        key={convo.id} 
                        onClick={() => onSelectConversation(convo.id)}
                        className={cn(
                            "flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 border-b",
                            activeConversationId === convo.id ? "bg-muted" : ""
                        )}
                    >
                        <Avatar className="h-10 w-10">
                            <AvatarImage src={otherMember?.avatarUrl} alt={otherMember?.name} />
                            <AvatarFallback>{otherMember?.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 truncate">
                            <p className="font-semibold text-sm truncate">{otherMember?.name || 'Usuario'}</p>
                            <p className="text-xs text-muted-foreground truncate">{lastMessage?.text || 'Sin mensajes aún'}</p>
                        </div>
                    </div>
                )
            })}
        </div>
    );
}

const MessageView = ({ conversationId }: any) => {
    const { getMessagesForConversation } = useChat();
    const { messages, loading } = getMessagesForConversation(conversationId);
    
    if (loading) return <div className="p-4 text-center">Cargando mensajes...</div>;
    
    return (
        <div className="flex-1 flex flex-col">
            <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                {messages.map(msg => <div key={msg.id}>{msg.text}</div>)}
            </div>
             <div className="p-2 border-t flex items-center gap-2">
                <input placeholder="Escribe un mensaje..." className="flex-1 bg-transparent focus:outline-none text-sm px-2"/>
                <Button size="icon"><Send size={16}/></Button>
            </div>
        </div>
    );
};


export default function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const { unreadCount } = useChat();
    const { user } = useUser();
    const firestore = useFirestore();

    const collectionPath = user ? `users/${user.uid}/teamMembers` : null;
    const membersCollectionRef = useMemoFirebase(() => {
        return collectionPath ? collection(firestore, collectionPath) : null;
    }, [collectionPath, firestore]);
    const { data: members } = useCollection<TeamMember>(membersCollectionRef);

    if (isOpen) {
        return (
            <Card className="fixed bottom-4 right-4 w-[600px] h-[500px] z-50 shadow-2xl flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
                    <h3 className="font-bold">Chat del Equipo</h3>
                    <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                        <X size={18} />
                    </Button>
                </CardHeader>
                <CardContent className="p-0 flex flex-1 overflow-hidden">
                    <div className="w-1/3 border-r flex flex-col">
                        <ConversationList 
                            activeConversationId={activeConversationId} 
                            onSelectConversation={setActiveConversationId} 
                        />
                    </div>
                    <div className="w-2/3 flex flex-col">
                        {activeConversationId ? (
                            <MessageView conversationId={activeConversationId} />
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                <p>Selecciona una conversación</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Button
            onClick={() => setIsOpen(true)}
            className="fixed bottom-4 right-4 h-16 w-16 rounded-full shadow-lg z-50"
        >
            <MessageSquare />
            {unreadCount > 0 && (
                <Badge className="absolute -top-1 -right-1 h-6 w-6 flex items-center justify-center bg-accent text-accent-foreground">
                    {unreadCount}
                </Badge>
            )}
        </Button>
    )
}
