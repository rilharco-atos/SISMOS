'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ComunicadosRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/'); }, []);
  return null;
}
