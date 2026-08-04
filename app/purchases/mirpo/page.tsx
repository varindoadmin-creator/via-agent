import { redirect } from 'next/navigation';

export default function MirpoPage() {
  redirect('/purchases?view=mirpo');
}
