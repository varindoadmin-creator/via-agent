import { redirect } from 'next/navigation';

/** Legacy route retained for bookmarks; JARVIS is the single intelligence identity. */
export default function LegacySidekickRedirect() {
  redirect('/dashboard');
}
