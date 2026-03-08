import { useState, useEffect } from 'react';
import { authApi } from '../services/api';

interface User {
  id?: string;
  name?: string;
  email?: string;
  displayName?: string;
}

interface AuthState {
  user: User | null;
  authenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    authenticated: false,
    isAdmin: false,
    loading: true,
  });

  useEffect(() => {
    authApi
      .getStatus()
      .then((res) => {
        const data = res.data;
        setState({
          user: data.user || null,
          authenticated: data.authenticated === true,
          isAdmin: data.isAdmin === true,
          loading: false,
        });
      })
      .catch(() => {
        setState({ user: null, authenticated: false, isAdmin: false, loading: false });
      });
  }, []);

  return state;
}
