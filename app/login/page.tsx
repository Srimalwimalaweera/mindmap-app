'use client';

import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useState } from "react";
import Link from 'next/link';
import styles from './login.module.css';

export default function LoginPage() {
    const [view, setView] = useState<'login' | 'signup' | 'forgot-password'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleGoogleLogin = async () => {
        setLoading(true);
        setError(null);
        try {
            await signInWithPopup(auth, googleProvider);
            window.location.href = '/';
        } catch (err: unknown) {
            console.error(err);
            setError("Google login failed");
        } finally {
            setLoading(false);
        }
    };

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            if (view === 'login') {
                await signInWithEmailAndPassword(auth, email, password);
                window.location.href = '/';
            } else if (view === 'signup') {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                if (name) {
                    await updateProfile(userCredential.user, { displayName: name });
                }
                window.location.href = '/';
            } else if (view === 'forgot-password') {
                await sendPasswordResetEmail(auth, email);
                setSuccess("Password reset email sent! Check your inbox.");
                setLoading(false); // Don't redirect, let them see the message
                return;
            }
        } catch (err: unknown) {
            console.error(err);
            if (err instanceof Error) {
                // Map common firebase errors to user-friendly messages
                if (err.message.includes('auth/invalid-email')) setError('Invalid email address.');
                else if (err.message.includes('auth/user-not-found')) setError('No account found with this email.');
                else if (err.message.includes('auth/wrong-password')) setError('Incorrect password.');
                else if (err.message.includes('auth/email-already-in-use')) setError('Email already in use.');
                else if (err.message.includes('auth/weak-password')) setError('Password should be at least 6 characters.');
                else setError(err.message);
            } else {
                setError("Authentication failed");
            }
        } finally {
            if (view !== 'forgot-password') setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[linear-gradient(135deg,#1e1e2e_0%,#2d1b3d_100%)] font-sans relative overflow-hidden">

            {/* Top Left Title */}
            <div className="absolute top-8 left-8 z-20">
                <Link href="/">
                    <h1 className={`${styles.title} text-2xl md:text-3xl font-bold tracking-wide select-none cursor-pointer`}>VISUAL MIND MAP</h1>
                </Link>
            </div>

            {/* Ambient Background Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/20 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/20 rounded-full blur-[120px] pointer-events-none animate-pulse delay-1000"></div>

            <div className="w-full max-w-md p-8 space-y-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-[30px] shadow-[0_20px_60px_rgba(0,0,0,0.4)] relative z-10 mx-4">
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/5 backdrop-blur-md shadow-lg shadow-blue-500/20 mb-6 animate-float border border-white/10">
                        <svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
                            viewBox="0 0 128 128" enableBackground="new 0 0 128 128" xmlSpace="preserve" className="w-12 h-12">
                            <defs>
                                <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="1" />
                                    <stop offset="100%" stopColor="#9333ea" stopOpacity="1" />
                                </linearGradient>
                            </defs>
                            <path fill="url(#logoGradient)" opacity="1.000000" stroke="none"
                                d="M76.688866,109.921104 C88.050018,115.331482 100.131790,117.192719 112.584740,117.125877 C117.595360,117.098984 120.788620,114.305405 121.104477,109.904366 C121.439659,105.234016 118.474678,101.801880 113.419678,101.228683 C111.275566,100.985550 109.030663,101.381645 106.940926,100.953491 C99.494377,99.427811 91.778465,98.498268 84.753601,95.805984 C74.877594,92.020988 69.684692,83.908684 68.234291,73.078300 C70.384644,73.078300 72.207634,73.078644 74.030617,73.078247 C86.858322,73.075493 99.686478,73.133377 112.513527,73.040070 C117.709305,73.002274 120.970772,69.862900 121.039032,65.258537 C121.107437,60.644268 117.884323,57.419498 112.785179,57.093300 C111.125771,56.987152 109.454391,57.064369 107.788483,57.064228 C94.648399,57.063137 81.508308,57.063622 68.322067,57.063622 C69.945129,45.040371 75.792297,36.744892 87.154800,33.278618 C95.306870,30.791729 104.059700,30.155739 112.593239,29.080770 C117.983620,28.401745 121.287643,25.539717 121.122673,20.684353 C120.966324,16.082565 117.653831,12.969757 112.453003,13.059167 C107.634552,13.142003 102.803261,13.490462 98.013023,14.033926 C71.598251,17.030745 56.428867,30.937811 51.926388,56.118473 C51.879574,56.380272 51.563141,56.593864 51.183678,57.063988 C40.724709,57.063988 30.076698,57.042259 19.428833,57.072033 C12.907690,57.090271 8.991345,60.245888 9.110775,65.284119 C9.227548,70.210205 12.886068,73.054855 19.251369,73.070534 C30.057989,73.097160 40.864723,73.077866 51.840267,73.077866 C53.987484,89.401680 61.400532,101.920280 76.688866,109.921104 z" />
                            <path fill="#F5E41C" opacity="1.000000" stroke="none"
                                d="M76.354416,109.751411 C61.400532,101.920280 53.987484,89.401680 51.840267,73.077866 C40.864723,73.077866 30.057989,73.097160 19.251369,73.070534 C12.886068,73.054855 9.227548,70.210205 9.110775,65.284119 C8.991345,60.245888 12.907690,57.090271 19.428833,57.072033 C30.076698,57.042259 40.724709,57.063988 51.183678,57.063988 C51.563141,56.593864 51.879574,56.380272 51.926388,56.118473 C56.428867,30.937811 71.598251,17.030745 98.013023,14.033926 C102.803261,13.490462 107.634552,13.142003 112.453003,13.059167 C117.653831,12.969757 120.966324,16.082565 121.122673,20.684353 C121.287643,25.539717 117.983620,28.401745 112.593239,29.080770 C104.059700,30.155739 95.306870,30.791729 87.154800,33.278618 C75.792297,36.744892 69.945129,45.040371 68.322067,57.063622 C81.508308,57.063622 94.648399,57.063137 107.788483,57.064228 C109.454391,57.064369 111.125771,56.987152 112.785179,57.093300 C117.884323,57.419498 121.107437,60.644268 121.039032,65.258537 C120.970772,69.862900 117.709305,73.002274 112.513527,73.040070 C99.686478,73.133377 86.858322,73.075493 74.030617,73.078247 C72.207634,73.078644 70.384644,73.078300 68.234291,73.078300 C69.684692,83.908684 74.877594,92.020988 84.753601,95.805984 C91.778465,98.498268 99.494377,99.427811 106.940926,100.953491 C109.030663,101.381645 111.275566,100.985550 113.419678,101.228683 C118.474678,101.801880 121.439659,105.234016 121.104477,109.904366 C120.788620,114.305405 117.595360,117.098984 112.584740,117.125877 C100.131790,117.192719 88.050018,115.331482 76.354416,109.751411 z" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">
                        {view === 'login' && 'Welcome Back'}
                        {view === 'signup' && 'Create Account'}
                        {view === 'forgot-password' && 'Reset Password'}
                    </h1>
                    <p className="text-gray-400 text-sm">
                        {view === 'login' && 'Enter your details to access your workspace'}
                        {view === 'signup' && 'Start your visual thinking journey today'}
                        {view === 'forgot-password' && 'We will send you a link to reset your password'}
                    </p>
                </div>

                <form onSubmit={handleEmailAuth} className="space-y-5">
                    {/* Name Input (Signup Only) */}
                    {view === 'signup' && (
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-300 ml-1">Full Name</label>
                            <input
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                placeholder="John Doe"
                            />
                        </div>
                    )}

                    {/* Email Input */}
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-300 ml-1">Email Address</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                            placeholder="name@example.com"
                        />
                    </div>

                    {/* Password Input (Login & Signup) */}
                    {view !== 'forgot-password' && (
                        <div className="space-y-1">
                            <div className="flex justify-between items-center ml-1">
                                <label className="text-xs font-medium text-gray-300">Password</label>
                                {view === 'login' && (
                                    <button
                                        type="button"
                                        onClick={() => setView('forgot-password')}
                                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                    >
                                        Forgot password?
                                    </button>
                                )}
                            </div>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                placeholder="••••••••"
                            />
                        </div>
                    )}

                    {/* Error / Success Messages */}
                    {error && (
                        <div className="p-3 text-sm text-red-200 bg-red-900/20 border border-red-500/20 rounded-lg animate-in fade-in slide-in-from-top-1">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="p-3 text-sm text-green-200 bg-green-900/20 border border-green-500/20 rounded-lg animate-in fade-in slide-in-from-top-1">
                            {success}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex items-center justify-center px-4 py-3.5 text-sm font-bold text-white transition-all bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            view === 'login' ? 'Sign In' :
                                view === 'signup' ? 'Create Account' :
                                    'Send Reset Link'
                        )}
                    </button>
                </form>

                {/* Divider */}
                <div className="relative flex items-center py-2">
                    <div className="flex-grow border-t border-white/10"></div>
                    <span className="flex-shrink-0 mx-4 text-gray-500 text-xs">Or continue with</span>
                    <div className="flex-grow border-t border-white/10"></div>
                </div>

                {/* Google Login */}
                <button
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full flex items-center justify-center px-4 py-3 text-sm font-medium text-white transition-all bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-white/20 active:scale-[0.98] disabled:opacity-50"
                >
                    <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Google
                </button>

                {/* View Switcher */}
                <div className="text-center">
                    {view === 'login' ? (
                        <p className="text-sm text-gray-400">
                            Don't have an account?{' '}
                            <button onClick={() => setView('signup')} className="text-blue-400 font-medium hover:text-blue-300 transition-colors">
                                Sign up
                            </button>
                        </p>
                    ) : (
                        <p className="text-sm text-gray-400">
                            Already have an account?{' '}
                            <button onClick={() => setView('login')} className="text-blue-400 font-medium hover:text-blue-300 transition-colors">
                                Sign in
                            </button>
                        </p>
                    )}
                </div>
            </div>

            {/* Footer Links */}
            <div className="absolute bottom-6 flex gap-6 text-xs text-gray-500 z-10">
                <Link href="/terms" className="hover:text-white transition-colors">Terms & Conditions</Link>
                <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
                <Link href="/about" className="hover:text-white transition-colors">About</Link>
            </div>
        </div>
    );
}
