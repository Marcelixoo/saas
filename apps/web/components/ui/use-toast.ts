'use client';

import * as React from 'react';
import type { ToastProps } from '@/components/ui/toast';

export type ToasterToast = Omit<ToastProps, 'onClose'> & {
  id: string;
  closing?: boolean;
};

const TOAST_LIMIT = 4;
const TOAST_DURATION_MS = 5000;
const TOAST_EXIT_ANIMATION_MS = 150;

type Action =
  | { type: 'ADD_TOAST'; toast: ToasterToast }
  | { type: 'DISMISS_TOAST'; toastId: string }
  | { type: 'REMOVE_TOAST'; toastId: string };

interface State {
  toasts: ToasterToast[];
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_TOAST':
      return { toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) };
    case 'DISMISS_TOAST':
      return {
        toasts: state.toasts.map((t) => (t.id === action.toastId ? { ...t, closing: true } : t)),
      };
    case 'REMOVE_TOAST':
      return { toasts: state.toasts.filter((t) => t.id !== action.toastId) };
    default:
      return state;
  }
}

// Intentional module-level singleton: toast state is global browser UI
// state (like a notification tray), not per-request data, so sharing it
// across every `useToast()` call site in the client is the correct
// pattern here (see: Avoid Shared Module State for Request Data — that
// rule is about server-render request scoping, which does not apply to
// this client-only store).
let memoryState: State = { toasts: [] };
const listeners = new Set<(state: State) => void>();

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => listener(memoryState));
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function dismissToast(toastId: string) {
  dispatch({ type: 'DISMISS_TOAST', toastId });
  setTimeout(() => dispatch({ type: 'REMOVE_TOAST', toastId }), TOAST_EXIT_ANIMATION_MS);
}

function toast(props: Omit<ToasterToast, 'id' | 'closing'>) {
  const id = genId();
  dispatch({ type: 'ADD_TOAST', toast: { ...props, id } });

  const timeout = setTimeout(() => dismissToast(id), TOAST_DURATION_MS);

  return {
    id,
    dismiss: () => {
      clearTimeout(timeout);
      dismissToast(id);
    },
  };
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return {
    toasts: state.toasts,
    toast,
    dismiss: dismissToast,
  };
}

export { useToast, toast };
