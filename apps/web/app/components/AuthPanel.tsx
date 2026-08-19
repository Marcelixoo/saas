'use client';

import { FormEvent, useState } from 'react';
import { ApiError, login, register } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/use-toast';

type Props = {
  onAuthenticated: (token: string) => void;
};

const MIN_PASSWORD_LENGTH = 8;

export default function AuthPanel({ onAuthenticated }: Props) {
  const { toast } = useToast();

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
      const result = await register(signupEmail, signupPassword, signupName || 'New User');
      onAuthenticated(result.token);
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Sign up failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
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
      toast({
        variant: 'error',
        title: 'Log in failed',
        description: err instanceof ApiError ? err.message : 'Check your email and password and try again.',
      });
    } finally {
      setLoginBusy(false);
    }
  }

  return (
    <div className="grid w-full gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader className="flex-col items-start gap-1">
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Set up a workspace and start searching in seconds.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3.5" onSubmit={handleSignup} noValidate>
            <FormField
              label="Email"
              type="email"
              placeholder="you@company.com"
              data-testid="signup-email"
              autoComplete="email"
              value={signupEmail}
              onChange={(e) => setSignupEmail(e.target.value)}
              required
            />
            <FormField
              label="Name"
              type="text"
              placeholder="Ada Lovelace"
              hint="Shown to teammates you invite later."
              data-testid="signup-name"
              autoComplete="name"
              value={signupName === 'New User' ? '' : signupName}
              onChange={(e) => setSignupName(e.target.value)}
            />
            <FormField
              label="Password"
              type="password"
              placeholder="At least 8 characters"
              hint="Use 8+ characters with a mix of letters and numbers."
              minLength={MIN_PASSWORD_LENGTH}
              data-testid="signup-password"
              autoComplete="new-password"
              value={signupPassword}
              onChange={(e) => setSignupPassword(e.target.value)}
              required
            />
            <Button
              variant="primary"
              type="submit"
              data-testid="signup-submit"
              disabled={signupBusy}
              className="mt-1"
            >
              {signupBusy ? <Spinner size="sm" /> : null}
              {signupBusy ? 'Creating account…' : 'Create account'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-col items-start gap-1">
          <CardTitle>Log in</CardTitle>
          <CardDescription>Welcome back — pick up right where you left off.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3.5" onSubmit={handleLogin} noValidate>
            <FormField
              label="Email"
              type="email"
              placeholder="you@company.com"
              data-testid="login-email"
              autoComplete="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
            />
            <FormField
              label="Password"
              type="password"
              placeholder="Your password"
              data-testid="login-password"
              autoComplete="current-password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
            />
            <Button
              type="submit"
              data-testid="login-submit"
              disabled={loginBusy}
              className="mt-1"
            >
              {loginBusy ? <Spinner size="sm" /> : null}
              {loginBusy ? 'Logging in…' : 'Log in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
