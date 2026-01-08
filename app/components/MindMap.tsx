'use client';

import { useEffect, useRef } from 'react';
import { Markmap } from 'markmap-view';
import { Transformer } from 'markmap-lib';

const transformer = new Transformer();

export default function MindMap({ content }: { content: string }) {
    const ref = useRef<SVGSVGElement>(null);
    const mm = useRef<Markmap | null>(null);

    useEffect(() => {
        if (ref.current && !mm.current) {
            mm.current = Markmap.create(ref.current);
        }
    }, []);

    useEffect(() => {
        if (mm.current && content) {
            const { root } = transformer.transform(content);
            mm.current.setData(root);
            mm.current.fit();
        }
    }, [content]);

    return (
        <svg className="w-full h-full" ref={ref} />
    );
}
