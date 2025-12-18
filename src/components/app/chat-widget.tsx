
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Users } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader } from '../ui/card';
import { cn } from '@/lib/utils';
import { useChat } from '@/contexts/chat-context';
import { useUser } from '@/firebase';
import type { TeamMember } from '@/lib/types';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { Separator } from '../ui/separator';

const ConversationList = ({ onSelectConversation, activeConversationId }: any) => {
    const { conversations, teamMembers, loading, getOrCreateConversation } = useChat();
    const { user } = useUser();
    
    const handleSelectMember = async (memberId: string) => {
        const conversationId = await getOrCreateConversation(memberId);
        if (conversationId) {
            onSelectConversation(conversationId);
        }
    }

    const existingConversationMemberIds = new Set(
        conversations.flatMap(c => c.memberIds)
    );

    const uncontactedMembers = teamMembers.filter(
        m => m.uid !== user?.uid && !existingConversationMemberIds.has(m.uid)
    );

    if (loading) return <div className="p-4 text-center text-sm">Cargando...</div>;

    return (
        <div className="flex-1 overflow-y-auto">
             {conversations.length > 0 && conversations.map(convo => {
                const otherMemberId = convo.memberIds.find(id => id !== user?.uid);
                const otherMember = otherMemberId ? convo.members[otherMemberId] : null;
                const lastMessage = convo.lastMessage;
                const isUnread = lastMessage && lastMessage.senderId !== user?.uid && !lastMessage.readBy?.includes(user!.uid);

                return (
                    <div 
                        key={convo.id} 
                        onClick={() => onSelectConversation(convo.id)}
                        className={cn(
                            "flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50",
                            activeConversationId === convo.id ? "bg-muted" : ""
                        )}
                    >
                        <Avatar className="h-10 w-10">
                            <AvatarImage src={otherMember?.avatarUrl} alt={otherMember?.name} />
                            <AvatarFallback>{otherMember?.name?.[0] || '?'}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 truncate">
                            <p className={cn("font-semibold text-sm truncate", isUnread && "font-bold")}>{otherMember?.name || 'Usuario'}</p>
                            <p className={cn("text-xs text-muted-foreground truncate", isUnread && "text-foreground")}>{lastMessage?.text || 'Sin mensajes aún'}</p>
                        </div>
                        {isUnread && <div className="h-2 w-2 rounded-full bg-primary"></div>}
                    </div>
                )
            })}
            
            {uncontactedMembers.length > 0 && (
                <>
                    <Separator />
                    <div className="p-2 text-xs font-semibold text-muted-foreground flex items-center gap-2">
                        <Users size={14}/>
                        Miembros del Equipo
                    </div>
                    {uncontactedMembers.map(member => (
                         <div 
                            key={member.id} 
                            onClick={() => handleSelectMember(member.uid)}
                            className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50"
                        >
                            <Avatar className="h-10 w-10">
                                <AvatarImage src={member.avatarUrl} alt={member.name} />
                                <AvatarFallback>{member.name?.[0]}</AvatarFallback>
                            </Avatar>
                             <div className="flex-1 truncate">
                                <p className="font-semibold text-sm truncate">{member.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{member.role}</p>
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}

const MessageView = ({ conversationId }: any) => {
    const { getMessagesForConversation, sendMessage } = useChat();
    const { user } = useUser();
    const { messages, loading } = getMessagesForConversation(conversationId);
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<null | HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (newMessage.trim()) {
            sendMessage(conversationId, { text: newMessage });
            setNewMessage('');
        }
    }
    
    if (loading) return <div className="p-4 text-center">Cargando mensajes...</div>;
    
    return (
        <div className="flex-1 flex flex-col">
            <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                {messages.map(msg => (
                    <div key={msg.id} className={cn("flex", msg.senderId === user?.uid ? "justify-end" : "justify-start")}>
                        <div className={cn("p-2 px-3 rounded-xl max-w-sm", msg.senderId === user?.uid ? "bg-primary text-primary-foreground" : "bg-muted")}>
                           <p className="text-sm">{msg.text}</p>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
             <form onSubmit={handleSendMessage} className="p-2 border-t flex items-center gap-2">
                <input 
                    placeholder="Escribe un mensaje..." 
                    className="flex-1 bg-transparent focus:outline-none text-sm px-2"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                />
                <Button type="submit" size="icon"><Send size={16}/></Button>
            </form>
        </div>
    );
};


export default function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const { unreadCount } = useChat();

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
                                <p>Selecciona una conversación para empezar a chatear.</p>
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
