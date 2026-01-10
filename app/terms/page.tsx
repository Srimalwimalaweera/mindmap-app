import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-[linear-gradient(135deg,#1e1e2e_0%,#2d1b3d_100%)] text-white p-6 md:p-12 font-sans">
            <div className="max-w-4xl mx-auto backdrop-blur-md bg-white/5 p-8 rounded-2xl border border-white/10 shadow-2xl">
                <Link href="/" className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-6 transition-colors font-medium">
                    <ArrowLeft size={20} /> Back to Home
                </Link>

                <h1 className="text-3xl md:text-4xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Terms & Conditions</h1>

                <div className="space-y-6 text-gray-300 leading-relaxed">
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">1. Introduction</h2>
                        <p>Welcome to Visual Mind Map. By accessing our website and using our services, you agree to these Terms and Conditions. Please read them carefully.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">2. Use of Service</h2>
                        <p>Our service allows you to create, edit, and save mind maps. You are responsible for any content you create using our platform.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">3. User Accounts</h2>
                        <p>To access certain features, you may need to create an account. You responsible for maintaining the confidentiality of your account information.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">4. Pro & Ultra Plans</h2>
                        <p>Premium features are available via paid subscriptions. Subscriptions are billed in advance and are non-refundable unless stated otherwise. Plans automatically expire if not renewed.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">5. Intellectual Property</h2>
                        <p>The content, organization, graphics, design, and other matters related to the Site are protected under applicable copyrights and other proprietary laws.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">6. Limitation of Liability</h2>
                        <p>Visual Mind Map shall not be liable for any indirect, incidental, or consequential damages arising out of the use of our service.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">7. Contact Us</h2>
                        <p>If you have any questions about these Terms, please contact us at srimalwimalaweera@gmail.com.</p>
                    </section>

                    <div className="mt-8 pt-6 border-t border-white/10 text-sm text-gray-500">
                        Last updated: {new Date().toLocaleDateString()}
                    </div>
                </div>
            </div>
        </div>
    );
}
