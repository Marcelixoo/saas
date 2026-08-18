'use client';

import { FormEvent, useState } from 'react';
import { ApiError, login, register } from '../../lib/api';

type Props = {
  onAuthenticated: (token: string) => void;
  onError: (message: string) => void;
};

const boxStyle: React.CSSProperties = {
  border: '1px solid #d8d8dc',
  borderRadius: 8,
  padding: '1.25rem',
  background: '#fff',
  maxWidth: 360,
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '0.5rem',
  marginBottom: '0.75rem',
  boxSizing: 'border-box',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  cursor: 'pointer',
};

export default function AuthPanel({ onAuthenticated, onError }: Props) {
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName, setSignupName] = useState('New User');
  const [signupBusy, setSignupBusy] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setSignupBusy(true);
    try {
      const result = await register(signupEmail, signupPassword, signupName);
      onAuthenticated(result.token);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Sign up failed');
    } finally {
      setSignupBusy(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginBusy(true);
    try {
      const result = await login(loginEmail, loginPassword);
      onAuthenticated(result.token);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoginBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
      <form style={boxStyle} onSubmit={handleSignup}>
        <h2>Sign up</h2>
        <label htmlFor="signup-email">Email</label>
        <input
          id="signup-email"
          data-testid="signup-email"
          type="email"
          style={inputStyle}
          value={signupEmail}
          onChange={(e) => setSignupEmail(e.target.value)}
          required
        />
        <label htmlFor="signup-name">Name</label>
        <input
          id="signup-name"
          type="text"
          style={inputStyle}
          value={signupName}
          onChange={(e) => setSignupName(e.target.value)}
        />
        <label htmlFor="signup-password">Password</label>
        <input
          id="signup-password"
          data-testid="signup-password"
          type="password"
          style={inputStyle}
          value={signupPassword}
          onChange={(e) => setSignupPassword(e.target.value)}
          required
        />
        <button
          data-testid="signup-submit"
          type="submit"
          style={buttonStyle}
          disabled={signupBusy}
        >
          Create account
        </button>
      </form>

      <form style={boxStyle} onSubmit={handleLogin}>
        <h2>Log in</h2>
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          data-testid="login-email"
          type="email"
          style={inputStyle}
          value={loginEmail}
          onChange={(e) => setLoginEmail(e.target.value)}
          required
        />
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          data-testid="login-password"
          type="password"
          style={inputStyle}
          value={loginPassword}
          onChange={(e) => setLoginPassword(e.target.value)}
          required
        />
        <button
          data-testid="login-submit"
          type="submit"
          style={buttonStyle}
          disabled={loginBusy}
        >
          Log in
        </button>
      </form>
    </div>
  );
}
