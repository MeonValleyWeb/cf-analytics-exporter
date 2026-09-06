import { useEffect } from 'react';
import { useAuth } from '@clerk/astro/react';

type Props = {
  redirectTo?: string;
};

export default function AuthGate({ redirectTo = '/sign-in' }: Props) {
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded || isSignedIn) {
      return;
    }

    const returnUrl = `${window.location.pathname}${window.location.search}`;
    const next = `${redirectTo}?redirect_url=${encodeURIComponent(returnUrl)}`;
    window.location.replace(next);
  }, [isLoaded, isSignedIn, redirectTo]);

  if (!isLoaded) {
    return <div className="text-sm text-gray-600">Checking session...</div>;
  }

  if (!isSignedIn) {
    return <div className="text-sm text-gray-600">Redirecting to sign in...</div>;
  }

  return null;
}
