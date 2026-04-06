"use client";
import { useState } from "react";
import { useUser } from "@/context/UserContext";
import { X } from "lucide-react";
import { getApiUrl } from "@/utils";
import { GoogleLogin } from "@react-oauth/google";

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Парсит ошибки от FastAPI: может быть строкой (detail: "...") или
// массивом Pydantic-ошибок (detail: [{msg: "..."}, ...])
function parseApiError(data: any): string {
    if (!data?.detail) return "Authentication failed";
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
        // Pydantic validation errors — берём первое сообщение
        const first = data.detail[0];
        return first?.msg?.replace("Value error, ", "") ?? "Validation error";
    }
    return "Authentication failed";
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const { refreshUser } = useUser();

    if (!isOpen) return null;

    const resetForm = () => {
        setEmail("");
        setPassword("");
        setUsername("");
        setError("");
    };

    const switchMode = (login: boolean) => {
        setIsLogin(login);
        setError("");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        const endpoint = isLogin ? "/auth/login" : "/auth/register";
        const payload = isLogin
            ? { email, password }
            : { username, email, password };

        try {
            const resp = await fetch(`${getApiUrl()}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include",
            });

            if (resp.ok) {
                // И логин, и регистрация теперь сразу выдают cookies → авто-логин
                await refreshUser();
                resetForm();
                onClose();
            } else {
                const data = await resp.json().catch(() => ({}));
                setError(parseApiError(data));
            }
        } catch {
            setError("Network error — please try again");
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSuccess = async (credentialResponse: any) => {
        setError("");
        setIsLoading(true);
        try {
            const res = await fetch(`${getApiUrl()}/auth/google`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: credentialResponse.credential }),
                credentials: "include",
            });
            if (res.ok) {
                await refreshUser();
                resetForm();
                onClose();
            } else {
                setError("Google authentication failed");
            }
        } catch {
            setError("Google authentication failed");
        } finally {
            setIsLoading(false);
        }
    };

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
                                placeholder="Your name"
                                autoComplete="name"
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
                            autoComplete="email"
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
                            autoComplete={isLogin ? "current-password" : "new-password"}
                        />
                        {!isLogin && (
                            <span className="text-xs text-zinc-600 mt-0.5">
                                Min 8 characters, at least one letter and one digit
                            </span>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full mt-2 py-3.5 rounded-xl bg-[#F7F3EC] text-black font-semibold tracking-wide hover:bg-[#EAE5D9] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isLoading ? "Please wait…" : isLogin ? "Sign In" : "Sign Up"}
                    </button>
                </form>

                <div className="mt-6 mb-6 flex items-center w-full">
                    <div className="grow border-t border-zinc-800"></div>
                    <span className="mx-4 text-xs tracking-widest text-zinc-500 uppercase">Or continue with</span>
                    <div className="grow border-t border-zinc-800"></div>
                </div>

                <div className="flex justify-center">
                    <GoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={() => setError("Google authentication failed")}
                        theme="filled_black"
                        shape="pill"
                    />
                </div>

                <p className="mt-8 text-center text-sm text-zinc-500">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                    <button
                        onClick={() => switchMode(!isLogin)}
                        className="text-[#F7F3EC] hover:underline cursor-pointer transition-colors"
                    >
                        {isLogin ? "Sign Up" : "Sign In"}
                    </button>
                </p>
            </div>
        </div>
    );
}
