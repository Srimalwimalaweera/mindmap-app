'use client';

import dynamic from 'next/dynamic';

const MindMapEditor = dynamic(() => import('./MindMapEditor'), { ssr: false });

export default MindMapEditor;
