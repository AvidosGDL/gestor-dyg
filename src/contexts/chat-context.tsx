
'use client';

import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import type { Chat, Message } from '@/lib/types';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import {
  collection,
  query,
  where,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface ChatContextType {
  conversations: Chat[];
  getMessagesForConversation: (chatId: string) => { messages: Message[], loading: boolean };
  sendMessage: (chatId: string, message: Partial<Message>) => void;
  createConversation: (memberId: string) => Promise<string | null>;
  unreadCount: number;
  loading: boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user } = useUser();

  const chatsCollectionRef = useMemoFirebase(() => {
    return firestore ? collection(firestore, 'chats') : null;
  }, [firestore]);

  const chatsQuery = useMemoFirebase(() => {
    if (!user || !chatsCollectionRef) return null;
    return query(
      chatsCollectionRef,
      where('memberIds', 'array-contains', user.uid),
      orderBy('lastMessage.timestamp', 'desc')
    );
  }, [user, chatsCollectionRef]);

  const { data: conversations, loading } = useCollection<Chat>(chatsQuery);
  
  const unreadCount = useMemo(() => {
    // This is a simplified unread count.
    // A more robust solution would involve a separate "unread" collection or aggregation.
    return (conversations || []).filter(c => 
      c.lastMessage && 
      c.lastMessage.senderId !== user?.uid
      // A proper implementation would check if the current user is in `readBy` array of lastMessage
    ).length;
  }, [conversations, user]);


  const getMessagesForConversation = (chatId: string) => {
    const messagesCollectionRef = useMemoFirebase(() => {
      if (!firestore) return null;
      return collection(firestore, `chats/${chatId}/messages`);
    }, [firestore, chatId]);

    const messagesQuery = useMemoFirebase(() => {
      if (!messagesCollectionRef) return null;
      return query(messagesCollectionRef, orderBy('timestamp', 'asc'));
    }, [messagesCollectionRef]);
    
    const { data: messages, loading } = useCollection<Message>(messagesQuery);
    
    return { messages: messages || [], loading };
  };
  
  const sendMessage = (chatId: string, message: Partial<Message>) => {
    if (!firestore || !user) return;
    
    const messagesCollectionRef = collection(firestore, `chats/${chatId}/messages`);
    const chatDocRef = doc(firestore, `chats/${chatId}`);

    const newMessage = {
      ...message,
      senderId: user.uid,
      timestamp: serverTimestamp(),
      readBy: [user.uid],
    };

    addDoc(messagesCollectionRef, newMessage).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: messagesCollectionRef.path,
        operation: 'create',
        requestResourceData: newMessage,
      });
      errorEmitter.emit('permission-error', permissionError);
    });

    // Update the last message on the chat document for sorting and previews
    updateDoc(chatDocRef, {
      lastMessage: {
        text: message.text,
        timestamp: serverTimestamp(),
        senderId: user.uid,
      },
    });
  };
  
  const createConversation = async (memberId: string): Promise<string | null> => {
    if (!firestore || !user || !chatsCollectionRef) return null;
    
    // Check if a chat already exists
    const existingChatQuery = query(
      chatsCollectionRef,
      where('memberIds', '==', [user.uid, memberId].sort())
    );
    const existingChatSnap = await getDocs(existingChatQuery);
    if (!existingChatSnap.empty) {
      return existingChatSnap.docs[0].id;
    }

    // Create a new chat
    try {
      const newChatDoc = await addDoc(chatsCollectionRef, {
        memberIds: [user.uid, memberId].sort(), // Sort for consistent querying
        members: {
          // You'd fetch this info, but for now we'll use placeholders
          [user.uid]: { name: user.displayName, avatarUrl: user.photoURL },
          [memberId]: { name: 'Fetching...', avatarUrl: '' }
        },
        lastMessage: null,
      });
      return newChatDoc.id;
    } catch (e) {
      console.error("Error creating conversation", e);
      return null;
    }
  }


  const contextValue = useMemo(() => ({
    conversations: conversations || [],
    loading,
    getMessagesForConversation,
    sendMessage,
    createConversation,
    unreadCount,
  }), [conversations, loading, unreadCount]);

  return (
    <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
