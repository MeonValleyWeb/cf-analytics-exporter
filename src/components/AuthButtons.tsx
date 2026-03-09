import { SignedIn, SignedOut, UserButton } from '@clerk/astro/react';

export default function AuthButtons() {
  return (
    <>
      <SignedOut>
        <a
          href="/sign-in"
          className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 transition-colors"
        >
          Sign In
        </a>
      </SignedOut>
      <SignedIn>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </>
  );
}
