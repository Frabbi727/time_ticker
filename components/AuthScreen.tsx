"use client";

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuthScreen() {
  const [pin, setPin] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const sanitizedPin = pin.trim();
    const sanitizedPassword = password.trim();
    if (!sanitizedPin || !sanitizedPassword) {
      setError('Please enter both PIN and Password.');
      return;
    }

    setIsLoading(true);

    // Check if env vars are present in the browser
    const isConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!isConfigured) {
      setError('Supabase credentials are not loaded in the browser. Please restart your Next.js development server (run npm run dev again) to load your .env.local file.');
      setIsLoading(false);
      return;
    }

    try {
      // 1. Resolve PIN to its registered email address in the database
      const { data: foundEmail, error: emailError } = await supabase.rpc('get_email_by_pin', {
        input_pin: sanitizedPin
      });

      if (emailError) {
        console.error('Email lookup error:', emailError);
        throw new Error('Failed to look up user email. Please try again.');
      }

      if (!foundEmail) {
        setError('This PIN is not registered. Please ask your administrator to pre-register your PIN.');
        setIsLoading(false);
        return;
      }

      // 2. Try logging in with the salted password (standard for users created via SQL/helper)
      const authPassword = `${sanitizedPassword}_secure_salt`;
      let { error: signInError } = await supabase.auth.signInWithPassword({
        email: foundEmail,
        password: authPassword,
      });

      // 3. Fallback: If it fails, try logging in with the raw password (for users created via Supabase Dashboard)
      if (signInError) {
        const { error: rawSignInError } = await supabase.auth.signInWithPassword({
          email: foundEmail,
          password: sanitizedPassword,
        });

        if (rawSignInError) {
          throw rawSignInError; // If both fail, throw the error
        }
      }

      setMessage('Welcome back! Logging you in...');
    } catch (err: unknown) {
      console.error('Authentication error:', err);
      let errorMessage = 'An unexpected error occurred during sign in.';
      
      if (err instanceof Error) {
        // Handle network/adblocker blocks (AuthRetryableFetchError)
        if (err.name === 'AuthRetryableFetchError' || err.message.toLowerCase().includes('fetch') || err.message.toLowerCase().includes('network')) {
          errorMessage = 'Network connection failed or blocked. If you are using Brave Shields or an adblocker, please disable it for this site and try again.';
        } else if (err.message === 'Invalid login credentials') {
          errorMessage = 'Invalid credentials. Please enter the correct PIN and Password.';
        } else {
          errorMessage = err.message;
        }
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[85vh] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-3xl border border-slate-100 bg-white p-8 shadow-xl">
        {/* Banner Logo */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-lg shadow-sky-200">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="mt-6 text-2xl font-black tracking-tight text-slate-900">
            Enterprise Tracker Login
          </h2>
          <p className="mt-2 text-xs text-slate-400">
            Enter your pre-registered PIN and Password to access your dashboard
          </p>
        </div>

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="pin" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              PIN Code
            </label>
            <input
              id="pin"
              name="pin"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="username"
              required
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="e.g. 0000"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-800 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none transition-all placeholder-slate-300"
              disabled={isLoading}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label htmlFor="current-password" className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-xs font-bold text-sky-600 hover:text-sky-700 cursor-pointer"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              id="current-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password (same as PIN)"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-800 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none transition-all placeholder-slate-300"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 border-l-4 border-rose-500 p-3.5 text-xs text-rose-700 font-semibold animate-in fade-in duration-200">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-xl bg-emerald-50 border-l-4 border-emerald-500 p-3.5 text-xs text-emerald-700 font-semibold animate-in fade-in duration-200">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-3 px-6 rounded-xl font-bold text-sm text-white transition-all shadow-md cursor-pointer ${
              isLoading
                ? 'bg-slate-300 cursor-not-allowed shadow-none'
                : 'bg-sky-600 hover:bg-sky-700 active:scale-[0.98]'
            }`}
          >
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
