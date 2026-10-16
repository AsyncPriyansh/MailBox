import { request } from './http';

export interface AuthUser {
  email: string;
  name: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export const authApi = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    return request<LoginResponse>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  me: async (): Promise<{ user: AuthUser }> => {
    return request<{ user: AuthUser }>('/v1/auth/me');
  },
};