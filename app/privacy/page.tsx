import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-[linear-gradient(135deg,#1e1e2e_0%,#2d1b3d_100%)] text-white p-6 md:p-12 font-sans">
            <div className="max-w-4xl mx-auto backdrop-blur-md bg-white/5 p-8 rounded-2xl border border-white/10 shadow-2xl">
                <Link href="/" className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-6 transition-colors font-medium">
                    <ArrowLeft size={20} /> Back to Home
                </Link>

                <h1 className="text-3xl md:text-4xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Privacy Policy</h1>

                <div className="space-y-6 text-gray-300 leading-relaxed">
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">1. Information Collection</h2>
                        <p>We collect information you provide directly to us, such as when you create an account, create a mind map, or contact us for support.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">2. Use of Information</h2>
                        <p>We use the information to provide, maintain, and improve our services, including processing transactions and sending you related information.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">3. Data Security</h2>
                        <p>We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, modification, or destruction.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">4. Third-Party Services</h2>
                        <p>We may use third-party services (such as Firebase) that collect, monitor and analyze this type of information in order to increase our service's functionality.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">5. Cookies</h2>
                        <p>We use cookies and similar tracking technologies to track the activity on our Service and hold certain information.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">6. Changes to Policy</h2>
                        <p>We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.</p>
                    </section>

                    <div className="mt-8 pt-6 border-t border-white/10 text-sm text-gray-500">
                        Last updated: {new Date().toLocaleDateString()}
                    </div>
                </div>
            </div>
        </div>
    );
}
