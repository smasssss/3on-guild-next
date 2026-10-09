import { redirect } from 'next/navigation';
import { FRONTEND } from '../../lib/store';
export default function Connect(){redirect(FRONTEND+'#settings');}
