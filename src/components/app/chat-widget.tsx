
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Users, Paperclip, File, Film, Music, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader } from '../ui/card';
import { cn } from '@/lib/utils';
import { useChat } from '@/contexts/chat-context';
import { useUser } from '@/firebase';
import type { TeamMember, Message } from '@/lib/types';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { Separator } from '../ui/separator';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import Image from 'next/image';

const ConversationList = ({ onSelectConversation, activeConversationId }: any) => {
    const { conversations, teamMembers, loading, getOrCreateConversation } = useChat();
    const { user } = useUser();
    
    const handleSelectMember = async (member: TeamMember) => {
        const uid = member.uid ?? member.id;
        if (!uid) {
            console.error("TeamMember sin UID válido:", member);
            return;
        }
        const conversationId = await getOrCreateConversation(uid);
        if (conversationId) {
            onSelectConversation(conversationId);
        }
    }

    const existingConversationMemberIds = new Set(
        conversations.flatMap(c => c.memberIds)
    );

    const uncontactedMembers = teamMembers.filter(m => {
        const uid = m.uid ?? m.id;
        return uid !== user?.uid && !existingConversationMemberIds.has(uid);
    });

    if (loading) return <div className="p-4 text-center text-sm">Cargando...</div>;

    const renderLastMessage = (convo: any) => {
        const { lastMessage } = convo;
        if (!lastMessage) return 'Sin mensajes aún';
        if (lastMessage.mediaType === 'image') return '📷 Imagen';
        if (lastMessage.mediaType === 'video') return '📹 Video';
        if (lastMessage.mediaType === 'audio') return '🎵 Audio';
        if (lastMessage.mediaType === 'file') return '📄 Archivo';
        return lastMessage.text || '...';
    }

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
                            <p className={cn("text-xs text-muted-foreground truncate", isUnread && "text-foreground")}>{renderLastMessage(convo)}</p>
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
                            onClick={() => handleSelectMember(member)}
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
    const [fileToSend, setFileToSend] = useState<File | null>(null);
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<null | HTMLDivElement>(null);
    const fileInputRef = useRef<null | HTMLInputElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFileToSend(e.target.files[0]);
        }
    }

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!newMessage.trim() && !fileToSend) || isSending) return;

        setIsSending(true);
        try {
            await sendMessage(conversationId, { text: newMessage }, fileToSend || undefined);
            setNewMessage('');
            setFileToSend(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        } catch (error) {
            console.error("Error al enviar mensaje:", error);
        } finally {
            setIsSending(false);
        }
    }
    
    const renderMedia = (msg: Message) => {
        if (!msg.mediaUrl || !msg.mediaType) return null;

        if (msg.mediaType === 'image') {
            return (
                <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer">
                    <Image src={msg.mediaUrl} alt={msg.mediaName || 'Imagen adjunta'} width={200} height={200} className="rounded-lg object-cover mt-2"/>
                </a>
            )
        }
        if (msg.mediaType === 'video') {
             return (
                <video controls src={msg.mediaUrl} className="rounded-lg max-w-xs mt-2" />
            )
        }
        if (msg.mediaType === 'audio') {
            return <audio controls src={msg.mediaUrl} className="mt-2" />
        }
        return (
            <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-2 p-2 bg-background rounded-lg border">
                <File size={24} className="text-primary"/>
                <span className="text-sm font-medium underline truncate">{msg.mediaName || 'Archivo adjunto'}</span>
            </a>
        );
    }
    
    if (loading) return <div className="p-4 text-center">Cargando mensajes...</div>;
    
    return (
        <div className="flex-1 flex flex-col">
            <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                {messages.map(msg => (
                    <div key={msg.id} className={cn("flex items-end gap-2", msg.senderId === user?.uid ? "justify-end" : "justify-start")}>
                        <div className={cn("p-2 px-3 rounded-xl max-w-sm flex flex-col", msg.senderId === user?.uid ? "bg-primary text-primary-foreground" : "bg-muted")}>
                           {msg.text && <p className="text-sm">{msg.text}</p>}
                           {renderMedia(msg)}
                           <p className="text-xs opacity-70 mt-1 self-end">
                                {msg.timestamp ? formatDistanceToNow(msg.timestamp.toDate(), { addSuffix: true, locale: es }) : 'enviando...'}
                           </p>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
             <form onSubmit={handleSendMessage} className="p-2 border-t flex items-center gap-2">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                <Button type="button" size="icon" variant="ghost" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip size={18} />
                </Button>
                <div className="flex-1 relative">
                    <input 
                        placeholder={fileToSend ? fileToSend.name : "Escribe un mensaje..."} 
                        className="w-full bg-transparent focus:outline-none text-sm px-2 pr-10"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        disabled={!!fileToSend}
                    />
                    {fileToSend && (
                        <Button 
                            type="button" 
                            size="icon" 
                            variant="ghost" 
                            className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-6" 
                            onClick={() => { setFileToSend(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                        >
                            <X size={14}/>
                        </Button>
                    )}
                </div>
                <Button type="submit" size="icon" disabled={isSending}>
                    {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16}/>}
                </Button>
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
