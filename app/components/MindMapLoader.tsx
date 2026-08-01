'use client';

import dynamic from 'next/dynamic';

const MindMapEditor = dynamic(() => import('./AstMindMapEditor'), { ssr: false });

export default MindMapEditor;
