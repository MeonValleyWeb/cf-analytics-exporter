import { Show, UserButton } from '@clerk/astro/react';

export default function AuthButtons() {
  return (
    <>
      <Show when="signed-out">
        <a
          href="/sign-in"
          className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 transition-colors"
        >
          Sign In
        </a>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </>
  );
}
