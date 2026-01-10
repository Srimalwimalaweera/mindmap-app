import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Youtube, Facebook, Instagram, Video, Camera } from 'lucide-react';

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-[linear-gradient(135deg,#1e1e2e_0%,#2d1b3d_100%)] text-white p-6 md:p-12 font-sans flex items-center justify-center">
            <div className="max-w-3xl w-full backdrop-blur-md bg-white/5 p-8 md:p-12 rounded-3xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.4)] text-center relative overflow-hidden">

                {/* Decorative Background Elements */}
                <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                <div className="absolute bottom-0 right-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none"></div>

                <Link href="/" className="absolute top-6 left-6 inline-flex items-center gap-2 text-white/50 hover:text-white transition-colors">
                    <ArrowLeft size={24} />
                </Link>

                <div className="relative z-10">
                    <div className="w-32 h-32 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-full p-1 shadow-2xl mb-6 overflow-hidden relative">
                        <Image
                            src="https://firebasestorage.googleapis.com/v0/b/visual-markmap-studio.firebasestorage.app/o/app_images%2Fabout_page%2F463489416_1072771157562320_3683418608164601466_n.jpg?alt=media&token=3b1f2228-3011-482a-8215-3e6348e83d63"
                            alt="Dilum Srimal Wimalaweera"
                            fill
                            className="object-cover rounded-full pointer-events-none"
                            onContextMenu={(e) => e.preventDefault()}
                        />
                    </div>

                    <h1 className="text-4xl md:text-5xl font-bold mb-2 text-white tracking-tight">Dilu Creation Studio</h1>
                    <p className="text-lg text-blue-200 mb-8 font-medium">Created by Dilum Srimal Wimalaweera</p>

                    <div className="text-gray-300 leading-relaxed max-w-xl mx-auto mb-10">
                        <p>
                            Welcome to Visual Mind Map. This application is crafted with passion by Dilu Creation Studio to help you visualize your ideas efficiently.
                            We specialize in creative digital solutions, photography, and videography.
                        </p>
                    </div>

                    <h3 className="text-sm uppercase tracking-wider text-gray-500 font-bold mb-6">Connect with Me</h3>

                    <div className="flex flex-wrap justify-center gap-4">
                        <a
                            href="https://www.youtube.com/channel/UC5_j2uPXQ3e5laTlTSvZ1zg"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-full flex items-center gap-2 transition-transform hover:scale-105 shadow-lg"
                        >
                            <Youtube size={20} />
                            <span>YouTube</span>
                        </a>

                        <a
                            href="https://web.facebook.com/dilumsrimalwimalaweera/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-[#1877F2] hover:bg-[#166fe5] text-white px-6 py-3 rounded-full flex items-center gap-2 transition-transform hover:scale-105 shadow-lg"
                        >
                            <Facebook size={20} />
                            <span>Facebook</span>
                        </a>

                        <a
                            href="https://www.tiktok.com/@levis_photography_"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-black hover:bg-gray-900 text-white px-6 py-3 rounded-full flex items-center gap-2 transition-transform hover:scale-105 shadow-lg border border-white/10"
                        >
                            <Video size={20} />
                            <span>TikTok</span>
                        </a>

                        <a
                            href="https://www.instagram.com/srimalwimalaweera/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-gradient-to-br from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white px-6 py-3 rounded-full flex items-center gap-2 transition-transform hover:scale-105 shadow-lg"
                        >
                            <Instagram size={20} />
                            <span>Instagram</span>
                        </a>
                    </div>

                    <footer className="mt-12 text-white/20 text-xs">
                        © {new Date().getFullYear()} Dilu Creation Studio. All rights reserved.
                    </footer>
                </div>
            </div>
        </div>
    );
}
