"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useState, useId, useEffect } from "react";
import { Globe, CreditCard, MapPin } from "lucide-react";
import { getApiUrl, apiFetch } from "@/utils";

const InstagramLogo = ({ size = 24, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
        <path d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"/>
    </svg>
);

const TelegramLogo = ({ size = 24, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
);

const ThreadsLogo = ({ size = 24, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
        <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z"/>
    </svg>
);

const MailSolidLogo = ({ size = 24, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="1.5 3.5 17 13" fill={color} xmlns="http://www.w3.org/2000/svg">
        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
    </svg>
);

export default function Footer() {
    const year = new Date().getFullYear();
    const inputId = useId();
    const [email, setEmail] = useState("");
    const [subscribed, setSubscribed] = useState(false);
    const [settings, setSettings] = useState<any>(null);

    useEffect(() => {
        apiFetch(`${getApiUrl()}/settings`)
            .then(res => res.json())
            .then(data => setSettings(data))
            .catch(err => console.error("Error fetching footer settings:", err));
    }, []);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (email.trim()) { setSubscribed(true); setEmail(""); }
    };

    return (
        <footer className="footer-container">
            <style>{`
                .footer-container {
                    background: #111111;
                    color: rgba(255, 255, 255, 0.9);
                    font-family: var(--font-sans), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    border-top: 1px solid rgba(255,255,255,0.05);
                }
                
                .footer-wrap {
                    max-width: 1440px;
                    margin: 0 auto;
                    padding: 5rem 2rem 2.5rem;
                }

                .footer-top {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 6rem;
                    margin-bottom: 5rem;
                }

                @media (max-width: 1024px) {
                    .footer-top { 
                        grid-template-columns: 1fr 1fr; 
                        gap: 4rem;
                    }
                }

                @media (max-width: 768px) {
                    .footer-top { 
                        grid-template-columns: 1fr; 
                        gap: 3.5rem;
                    }
                    .footer-wrap {
                        padding: 4rem 1.5rem 2rem;
                    }
                }

                .footer-col-title {
                    font-family: '"Didot", "Bodoni MT", "Times New Roman", serif';
                    font-size: 1.35rem;
                    font-weight: 400;
                    margin-bottom: 1rem;
                    color: #FFFFFF;
                    letter-spacing: 0.02em;
                }

                .footer-col-desc {
                    font-size: 0.9rem;
                    line-height: 1.6;
                    color: rgba(255, 255, 255, 0.65);
                    margin-bottom: 1.2rem;
                    font-weight: 300;
                }

                .footer-col-link {
                    font-size: 0.9rem;
                    color: #FFFFFF;
                    text-decoration: underline;
                    text-underline-offset: 4px;
                    text-decoration-color: rgba(255,255,255,0.4);
                    transition: opacity 0.2s;
                    font-weight: 300;
                }

                .footer-col-link:hover {
                    opacity: 0.7;
                }
                
                .footer-divider {
                    height: 1px;
                    background: rgba(255, 255, 255, 0.12);
                    margin-bottom: 2.5rem;
                }

                .footer-bottom {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                    flex-wrap: wrap;
                    gap: 2rem;
                }

                .footer-brand {
                    display: block;
                    padding-bottom: 0.25rem;
                }
                
                .footer-brand img {
                    height: clamp(28px, 3.2vw, 42px);
                    width: auto;
                    filter: brightness(0) invert(1);
                    display: block;
                    opacity: 0.9;
                    transition: opacity 0.3s;
                }
                
                .footer-brand:hover img {
                    opacity: 1;
                }

                .footer-nav {
                    display: flex;
                    gap: 1.5rem;
                    align-items: center;
                    flex-wrap: wrap;
                }

                .footer-nav a {
                    font-size: 0.85rem;
                    color: rgba(255, 255, 255, 0.65);
                    text-decoration: none;
                    transition: color 0.2s;
                    font-weight: 300;
                    letter-spacing: 0.02em;
                }
                
                .footer-nav a:hover {
                    color: #FFFFFF;
                }
                
                .footer-copyright {
                    font-size: 0.85rem;
                    color: rgba(255, 255, 255, 0.3);
                }

                /* Layout for Icons */
                .features-wrapper {
                    display: flex;
                    flex-direction: column;
                    gap: 1.25rem;
                    margin-top: 1.5rem;
                }
                
                .feature-item {
                    display: flex;
                    align-items: flex-start;
                    gap: 0.85rem;
                }
                
                .feature-icon {
                    color: #FFFFFF;
                    opacity: 0.8;
                    margin-top: 0.15rem;
                }
                
                .feature-text p {
                    margin: 0;
                    font-size: 0.85rem;
                    font-weight: 300;
                    color: rgba(255, 255, 255, 0.65);
                    line-height: 1.4;
                }
                
                .feature-text strong {
                    color: #FFFFFF;
                    font-weight: 400;
                    display: block;
                    margin-bottom: 0.2rem;
                    font-size: 0.9rem;
                }

                .payment-icons {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-top: 0.6rem;
                    flex-wrap: wrap;
                }
                
                .payment-badge {
                    background: #FFFFFF;
                    padding: 0 0.5rem;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 26px;
                    box-sizing: border-box;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                }
                
                /* Mastercard circles within white badge */
                .mc-circles {
                    display: flex;
                    align-items: center;
                }
                .mc-circle-red {
                    width: 14px; height: 14px; border-radius: 50%; background: #EB001B; margin-right: -6px; z-index: 10;
                }
                .mc-circle-yellow {
                    width: 14px; height: 14px; border-radius: 50%; background: #F79E1B; opacity: 0.95;
                }
                
                .social-row {
                    display: flex;
                    gap: 1.75rem;
                    margin-top: 1.5rem;
                    align-items: center;
                }

                .social-link {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #FFFFFF;
                    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    opacity: 0.9;
                }
                
                .social-link:hover {
                    opacity: 1;
                    color: #FFFFFF;
                    transform: translateY(-5px) scale(1.1);
                    filter: drop-shadow(0 8px 16px rgba(255,255,255,0.3));
                }

                .social-desktop {
                    display: block;
                }

                .social-mobile {
                    display: none;
                }

                @media (max-width: 768px) {
                    .social-desktop {
                        display: none;
                    }
                    .social-mobile {
                        display: flex;
                        justify-content: center;
                        width: 100%;
                        margin-bottom: 2.5rem;
                    }
                    .social-mobile .social-row {
                        margin-top: 0;
                    }
                }

                /* Newsletter */
                .nl-input-group {
                    display: flex;
                    margin-top: 1.2rem;
                    border-bottom: 1px solid rgba(255,255,255,0.25);
                    transition: border-color 0.3s;
                }
                
                .nl-input-group:focus-within {
                    border-color: rgba(255,255,255,0.7);
                }
                
                .nl-input {
                    background: transparent;
                    border: none;
                    color: #FFF;
                    padding: 0.6rem 0;
                    flex: 1;
                    outline: none;
                    font-size: 0.95rem;
                }
                
                .nl-input::placeholder {
                    color: rgba(255, 255, 255, 0.35);
                }
                
                .nl-btn {
                    background: transparent;
                    border: none;
                    color: #FFF;
                    cursor: pointer;
                    padding: 0 0.5rem;
                    font-weight: 500;
                    font-size: 0.95rem;
                    transition: opacity 0.2s;
                }
                
                .nl-btn:hover {
                    opacity: 0.7;
                }
            `}</style>

            <div className="footer-wrap">
                <div className="social-mobile">
                    <div className="social-row">
                        <a href={settings?.social_instagram || "https://instagram.com/samen_bondarenko"} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Instagram">
                            <InstagramLogo size={40} />
                        </a>
                        <a href={settings?.social_telegram || "https://t.me/samen_bondarenko"} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Telegram">
                            <TelegramLogo size={40} />
                        </a>
                        <a href={settings?.social_threads || "https://threads.net/@samen_bondarenko"} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Threads">
                            <ThreadsLogo size={40} />
                        </a>
                        <a href={`mailto:${settings?.contact_email || "hello@samenbondarenko.com"}`} className="social-link" aria-label="Email">
                            <MailSolidLogo size={50} />
                        </a>
                    </div>
                </div>

                <div className="footer-top">
                    {/* Column 1 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                        <div className="social-desktop">
                            <h3 className="footer-col-title" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Connect
                            </h3>
                            <div className="social-row" style={{ marginTop: '0.75rem' }}>
                                <a href={settings?.social_instagram || "https://instagram.com/samen_bondarenko"} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Instagram">
                                    <InstagramLogo size={40} />
                                </a>
                                <a href={settings?.social_telegram || "https://t.me/samen_bondarenko"} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Telegram">
                                    <TelegramLogo size={40} />
                                </a>
                                <a href={settings?.social_threads || "https://threads.net/@samen_bondarenko"} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Threads">
                                    <ThreadsLogo size={40} />
                                </a>
                                <a href={`mailto:${settings?.contact_email || "hello@samenbondarenko.com"}`} className="social-link" aria-label="Email">
                                    <MailSolidLogo size={50} />
                                </a>
                            </div>
                        </div>
                        <div>
                            <h3 className="footer-col-title">Discover the Collection</h3>
                            <p className="footer-col-desc">
                                {settings?.footer_text_discover || "Welcome to a space where modern vision meets classical mastery. Explore an exclusive collection of original paintings and limited edition prints directly from the artist's studio."}
                            </p>
                            <Link href="/gallery" className="footer-col-link">Explore Gallery</Link>
                        </div>
                    </div>

                    {/* Column 2 */}
                    <div>
                        <div>
                            <h3 className="footer-col-title">Collector Services</h3>
                            <p className="footer-col-desc">
                                {settings?.footer_text_services || "We pride ourselves on providing a premium experience, offering worldwide delivery and secure payment options for all our collectors globally."}
                            </p>
                        </div>
                        
                        <div className="features-wrapper">
                            <div className="feature-item">
                                <Globe size={22} className="feature-icon" strokeWidth={1.5} />
                                <div className="feature-text">
                                    <strong>Worldwide Shipping</strong>
                                    <p>Fully insured international transit.</p>
                                </div>
                            </div>
                            <div className="feature-item">
                                <CreditCard size={22} className="feature-icon" strokeWidth={1.5} />
                                <div className="feature-text">
                                    <strong>Secure Payments</strong>
                                    <div className="payment-icons">
                                        {/* VISA */}
                                        <div className="payment-badge" style={{ fontStyle: "italic", fontFamily: "sans-serif", color: "#1A1F71", fontSize: "0.85rem", fontWeight: 800 }}>VISA</div>
                                        
                                        {/* Mastercard */}
                                        <div className="payment-badge mc-circles">
                                            <div className="mc-circle-red" />
                                            <div className="mc-circle-yellow" />
                                        </div>
                                        
                                        {/* Apple Pay */}
                                        <div className="payment-badge" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", color: "#000000", fontSize: "0.80rem", fontWeight: 600 }}>
                                            <svg viewBox="0 0 384 512" fill="currentColor" style={{ height: "13px", marginRight: "3px", transform: "translateY(-1px)" }}>
                                                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
                                            </svg>
                                            Pay
                                        </div>
                                        
                                        {/* Google Pay */}
                                        <div className="payment-badge" style={{ fontFamily: '"Product Sans", "Google Sans", Roboto, sans-serif', fontSize: "0.85rem" }}>
                                            <svg viewBox="0 0 24 24" style={{ height: "14px", width: "14px", marginRight: "1px" }}>
                                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                            </svg>
                                            <span style={{ color: "#5F6368", fontWeight: 500, letterSpacing: "-0.2px" }}>Pay</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="feature-item">
                                <MapPin size={22} className="feature-icon" strokeWidth={1.5} />
                                <div className="feature-text">
                                    <strong>Studio Location</strong>
                                    <p>{settings?.studio_address || "Kyiv, Ukraine"}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Column 3 */}
                    <div>
                        <h3 className="footer-col-title">Join our Circle</h3>
                        <p className="footer-col-desc">
                            {settings?.footer_text_circle || "Subscribe for early access to new works, exhibition announcements, and exclusive insights delivered to your inbox."}
                        </p>
                        {subscribed ? (
                             <p style={{ color: "#FFFFFF", fontStyle: "italic", marginTop: "1rem" }}>
                                Thank you. You're now on the list.
                             </p>
                        ) : (
                            <form onSubmit={submit} className="nl-input-group">
                                <label htmlFor={inputId} style={{ display: "none" }}>Email</label>
                                <input 
                                    id={inputId} 
                                    type="email" 
                                    placeholder="Your email address" 
                                    className="nl-input" 
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                                <button type="submit" className="nl-btn">Subscribe</button>
                            </form>
                        )}
                    </div>
                </div>

                <div className="footer-divider" />

                <div className="footer-bottom">
                    <Link href="/" className="footer-brand" aria-label="Home">
                        <Image
                            src="/logo-v5.png"
                            alt="Samen Bondarenko"
                            width={340}
                            height={80}
                            style={{ objectFit: 'contain' }}
                            priority
                        />
                    </Link>

                    <nav className="footer-nav">
                        <Link href="/about">About</Link>
                        <Link href="/contact">Contact</Link>
                        <Link href="/shipping">Shipping</Link>
                        <Link href="/terms">Terms</Link>
                        <Link href="/privacy">Privacy</Link>
                        <span className="footer-copyright">© {year}</span>
                    </nav>
                </div>
            </div>
        </footer>
    );
}
