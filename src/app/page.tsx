'use client';

import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User, signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import Dashboard from '@/components/Dashboard';
import AddCard from '@/components/AddCard';
import CardDetail from '@/components/CardDetail';
import type { Card } from '@/lib/types';

const isFirebaseConfigured = !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [view, setView] = useState<'dashboard' | 'add' | 'detail'>('dashboard');
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    try {
      const unsub = onAuthStateChanged(auth(), (u) => {
        setUser(u);
        setLoading(false);
      }, (err) => {
        setAuthError(err.message);
        setLoading(false);
      });
      return () => unsub();
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Firebase init failed');
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-2xl">🇸🇬 Loading...</div>
      </div>
    );
  }

  if (!isFirebaseConfigured) {
    return <SetupScreen />;
  }

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Setup Required</h2>
          <p className="text-gray-600 mb-4">{authError}</p>
          <p className="text-sm text-gray-500">Please configure Firebase credentials in <code className="bg-gray-100 px-1 rounded">.env.local</code></p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            Top Up Lah 🇸🇬
          </h1>
          <div className="flex items-center gap-3">
            {user.photoURL && (
              <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
            )}
            <button
              onClick={() => signOut(auth())}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4">
        {view === 'dashboard' && (
          <Dashboard
            uid={user.uid}
            onAddCard={() => setView('add')}
            onSelectCard={(card) => {
              setSelectedCard(card);
              setView('detail');
            }}
            refreshKey={refreshKey}
          />
        )}
        {view === 'add' && (
          <AddCard
            uid={user.uid}
            onBack={() => setView('dashboard')}
            onSaved={() => {
              setRefreshKey(k => k + 1);
              setView('dashboard');
            }}
          />
        )}
        {view === 'detail' && selectedCard && (
          <CardDetail
            uid={user.uid}
            card={selectedCard}
            onBack={() => setView('dashboard')}
            onUpdated={() => {
              setRefreshKey(k => k + 1);
              setView('dashboard');
            }}
          />
        )}
      </main>
    </div>
  );
}

function LoginScreen() {
  const [signInError, setSignInError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setSignInError(null);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth(), provider);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setSignInError(message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full text-center">
        <div className="text-6xl mb-4">🇸🇬</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Top Up Lah</h1>
        <p className="text-gray-600 mb-8">
          Track your restaurant stored-value balances. Never lose track of your top-ups again.
        </p>
        <button
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-lg px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.65-2.07.01-2.77z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
        {signInError && (
          <p className="mt-3 text-sm text-red-600">{signInError}</p>
        )}
      </div>
    </div>
  );
}

function SetupScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center">
        <div className="text-6xl mb-4">🇸🇬</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Top Up Lah</h1>
        <p className="text-gray-600 mb-6">
          Track your restaurant stored-value balances.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-left">
          <h2 className="font-semibold text-amber-800 mb-3">⚡ Firebase Setup Required</h2>
          <p className="text-sm text-amber-700 mb-3">
            This app needs Firebase credentials to work. Create a <code className="bg-amber-100 px-1 rounded">.env.local</code> file:
          </p>
          <pre className="bg-amber-100 rounded-lg p-3 text-xs text-amber-900 overflow-x-auto mb-3">
{`NEXT_PUBLIC_FIREBASE_API_KEY=your-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id`}
          </pre>
          <p className="text-sm text-amber-700">
            Or set these as GitHub Secrets for deployment.
          </p>
        </div>
      </div>
    </div>
  );
}