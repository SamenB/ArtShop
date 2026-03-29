"use client";
import { useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { useUser } from "@/context/UserContext";
import { X } from "lucide-react";
import { getApiUrl } from "@/utils";

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [error, setError] = useState("");
    const { refreshUser } = useUser();

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        const endpoint = isLogin ? "/auth/login" : "/auth/register";
        const payload = isLogin
            ? { email, password }
            : { username, email, password };

        try {
            const resp = await fetch(`${getApiUrl()}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include"
            });
            if (resp.ok) {
                if (!isLogin) {
                    // auto switch to login
                    setIsLogin(true);
                    setError("Registration successful! Please log in.");
                } else {
                    await refreshUser();
                    onClose();
                }
            } else {
                const err = await resp.json();
                setError(err.detail || "Authentication Failed");
            }
        } catch (err) {
            setError("Network err");
        }
    };

    const handleGoogleSuccess = async (tokenResponse: any) => {
        try {
            const res = await fetch(`${getApiUrl()}/auth/google`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: tokenResponse.credential }),
                credentials: "include"
            });
            if (res.ok) {
                await refreshUser();
                onClose();
            } else {
                setError("Google authentication failed");
            }
        } catch (e) {
            setError("Google authentication failed");
        }
    };

    // The custom hook requires access_token, but our backend expects id_token.
    // It's easier to use the standard button. We will import GoogleLogin.
    // But wait, we can just use the provided GoogleLogin component directly inside the form.
    return (
        <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-md rounded-2xl bg-[#1C1916] border border-[#2D2A26] p-8 shadow-2xl">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>

                <h2 className="text-3xl font-serif text-[#F7F3EC] mb-6 text-center">
                    {isLogin ? "Welcome Back" : "Create Account"}
                </h2>

                {error && (
                    <div className="mb-4 p-3 rounded-xl bg-red-900/30 border border-red-500/30 text-red-200 text-sm italic text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {!isLogin && (
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs uppercase tracking-widest text-zinc-500 font-medium">Username</label>
                            <input
                                className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-[#F7F3EC]/40 transition-colors"
                                required
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                placeholder="Samen Bondarenko"
                            />
                        </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs uppercase tracking-widest text-zinc-500 font-medium">Email</label>
                        <input
                            className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-[#F7F3EC]/40 transition-colors"
                            required
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="you@example.com"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs uppercase tracking-widest text-zinc-500 font-medium">Password</label>
                        <input
                            className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-[#F7F3EC]/40 transition-colors"
                            required
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full mt-2 py-3.5 rounded-xl bg-[#F7F3EC] text-black font-semibold tracking-wide hover:bg-[#EAE5D9] transition-colors"
                    >
                        {isLogin ? "Sign In" : "Sign Up"}
                    </button>
                </form>

                <div className="mt-6 mb-6 flex items-center w-full">
                    <div className="grow border-t border-zinc-800"></div>
                    <span className="mx-4 text-xs tracking-widest text-zinc-500 uppercase">Or continue with</span>
                    <div className="grow border-t border-zinc-800"></div>
                </div>

                <div className="flex justify-center">
                    <GoogleLoginWrapper handleSuccess={handleGoogleSuccess} />
                </div>

                <p className="mt-8 text-center text-sm text-zinc-500">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-[#F7F3EC] hover:underline cursor-pointer transition-colors"
                    >
                        {isLogin ? "Sign Up" : "Sign In"}
                    </button>
                </p>

            </div>
        </div>
    );
}

// Separated into component to avoid top-level issues
import { GoogleLogin } from '@react-oauth/google';

function GoogleLoginWrapper({ handleSuccess }: any) {
    return (
        <GoogleLogin
            onSuccess={handleSuccess}
            onError={() => {
                console.log('Login Failed');
            }}
            theme="filled_black"
            shape="pill"
        />
    )
}
