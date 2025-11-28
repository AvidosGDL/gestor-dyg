'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Task } from '@/lib/types';
import { initialTasks } from '@/lib/initial-tasks';

interface TasksContextType {
  tasks: Task[];
  addTask: (taskData: Omit<Task, 'id'>) => void;
  updateTask: (id: number, updatedData: Partial<Task>) => void;
  deleteTask: (id: number) => void;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
}

const TasksContext = createContext<TasksContextType | undefined>(undefined);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    try {
      const savedTasks = window.localStorage.getItem('bizTasks');
      if (savedTasks) {
        setTasks(JSON.parse(savedTasks));
      } else {
        setTasks(initialTasks);
      }
    } catch (error) {
      console.error('Error reading from localStorage', error);
      setTasks(initialTasks);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) {
      try {
        window.localStorage.setItem('bizTasks', JSON.stringify(tasks));
      } catch (error) {
        console.error('Error writing to localStorage', error);
      }
    }
  }, [tasks, isInitialized]);

  const addTask = (taskData: Omit<Task, 'id'>) => {
    const newTask = { ...taskData, id: Date.now() };
    setTasks((prevTasks) => [...prevTasks, newTask]);
  };

  const updateTask = (id: number, updatedData: Partial<Task>) => {
    setTasks((prevTasks) =>
      prevTasks.map((task) =>
        task.id === id ? { ...task, ...updatedData } : task
      )
    );
  };

  const deleteTask = (id: number) => {
    setTasks((prevTasks) => prevTasks.filter((task) => task.id !== id));
  };
  
  const contextValue = {
    tasks,
    setTasks,
    addTask,
    updateTask,
    deleteTask,
  };

  return (
    <TasksContext.Provider value={contextValue}>
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (context === undefined) {
    throw new Error('useTasks must be used within a TasksProvider');
  }
  return context;
}
