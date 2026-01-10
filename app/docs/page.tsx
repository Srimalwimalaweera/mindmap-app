import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Edit, Save, Trash2, Pin } from 'lucide-react';

export default function DocsPage() {
    return (
        <div className="min-h-screen bg-[linear-gradient(135deg,#1e1e2e_0%,#2d1b3d_100%)] text-white p-6 md:p-12 font-sans">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors">
                        <ArrowLeft size={24} />
                    </Link>
                    <h1 className="text-4xl font-bold">Documentation</h1>
                </div>

                <div className="grid gap-8">
                    {/* Getting Started */}
                    <div className="backdrop-blur-md bg-white/5 p-8 rounded-2xl border border-white/10 shadow-lg">
                        <h2 className="text-2xl font-bold mb-4 text-blue-400">Getting Started</h2>
                        <p className="text-gray-300 mb-4">
                            Visual Mind Map is a powerful tool to organize your thoughts. Start by creating a new project from the dashboard.
                        </p>
                        <ul className="list-disc list-inside text-gray-300 space-y-2">
                            <li>Click <span className="font-bold text-white">Create New Project</span> on the dashboard.</li>
                            <li>Select "Mind Map" or "Digital Book".</li>
                            <li>Give your project a name to begin.</li>
                        </ul>
                    </div>

                    {/* How to Use */}
                    <div className="backdrop-blur-md bg-white/5 p-8 rounded-2xl border border-white/10 shadow-lg">
                        <h2 className="text-2xl font-bold mb-4 text-purple-400">How to Use the Editor</h2>

                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2"><Plus size={18} /> Adding Nodes</h3>
                                <p className="text-gray-400 text-sm">
                                    • <strong>Right Click</strong> on a node to add a child node.<br />
                                    • Press <strong>Tab</strong> to quickly add a child node.<br />
                                    • Press <strong>Enter</strong> to add a sibling node.
                                </p>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2"><Edit size={18} /> Editing</h3>
                                <p className="text-gray-400 text-sm">
                                    • Click any node to edit its text.<br />
                                    • Use the popup toolbar to format text (Bold, Italic, Link).<br />
                                    • Add images or lists from the toolbar options.
                                </p>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2"><Save size={18} /> Saving</h3>
                                <p className="text-gray-400 text-sm">
                                    • Changes are saved automatically periodically.<br />
                                    • You can manually save by clicking the <strong>Save</strong> button in the header.
                                </p>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2"><Trash2 size={18} /> Organization</h3>
                                <p className="text-gray-400 text-sm">
                                    • Drag and drop nodes to rearrange them.<br />
                                    • Use <strong>Pin</strong> in the dashboard to keep important projects at the top.<br />
                                    • Projects in <strong>Trash</strong> remain for 30 days.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Shortcuts */}
                    <div className="backdrop-blur-md bg-white/5 p-8 rounded-2xl border border-white/10 shadow-lg">
                        <h2 className="text-2xl font-bold mb-4 text-green-400">Keyboard Shortcuts</h2>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex justify-between border-b border-white/5 pb-2">
                                <span className="text-gray-400">Add Child Node</span>
                                <span className="font-mono text-white bg-white/10 px-2 py-0.5 rounded">Tab</span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-2">
                                <span className="text-gray-400">Add Sibling Node</span>
                                <span className="font-mono text-white bg-white/10 px-2 py-0.5 rounded">Enter</span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-2">
                                <span className="text-gray-400">Delete Node</span>
                                <span className="font-mono text-white bg-white/10 px-2 py-0.5 rounded">Del / Backspace</span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-2">
                                <span className="text-gray-400">Undo</span>
                                <span className="font-mono text-white bg-white/10 px-2 py-0.5 rounded">Ctrl + Z</span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-2">
                                <span className="text-gray-400">Redo</span>
                                <span className="font-mono text-white bg-white/10 px-2 py-0.5 rounded">Ctrl + Y</span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-2">
                                <span className="text-gray-400">Zoom In/Out</span>
                                <span className="font-mono text-white bg-white/10 px-2 py-0.5 rounded">Ctrl + Scroll</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="text-center mt-8 text-gray-500 text-sm">
                    Have more questions? Contact support via the About page.
                </div>
            </div>
        </div>
    );
}
