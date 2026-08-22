import { redirect } from 'next/navigation';

/** JARVIS now lives in the persistent floating drawer available across VIA. */
export default function JarvisPage() {
  redirect('/dashboard');
}
