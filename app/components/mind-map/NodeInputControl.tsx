'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
    Bold, Italic, Underline, Strikethrough, Highlighter,
    Link as LinkIcon, CheckSquare, Code, List, Table as TableIcon,
    Image as ImageIcon, Video, X, Check, Film, Plus,
    Type, Sparkles, Trash2, Edit2, Grid, Maximize2, Minimize2,
    MousePointer2, AppWindow
} from 'lucide-react';
import { useAuth } from '@/app/context/AuthProvider';
import TableEditorModal from './TableEditorModal';
import PricingModal from './PricingModal';
import { storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

interface NodeInputControlProps {
    initialValue: string;
    onSubmit: (value: string) => void;
    onCancel: () => void;
    nodeId: string;
}

type NodeCategory = 'text' | 'task' | 'link' | 'media' | 'table' | 'code' | 'button' | 'embed';

interface TaskItem {
    id: string;
    text: string;
    checked: boolean;
}

// Decode HTML Entities (e.g. &#xd85;... -> Sinhala/Unicode Text)
const decodeHtmlEntities = (text: string): string => {
    if (!text) return '';
    return text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
};

export default function NodeInputControl({ initialValue, onSubmit, onCancel, nodeId }: NodeInputControlProps) {
    const { userData } = useAuth();
    const userPlan = userData?.plan || 'free';

    // Decode initial value
    const decodedInitialValue = decodeHtmlEntities(initialValue);

    // Is Editing an Existing Node?
    const isNewNode = nodeId === 'NEW_CHILD' || nodeId === 'INSERT_PARENT' || nodeId === 'GHOST' || !decodedInitialValue || decodedInitialValue.includes('@[[ADD_NEW]]');
    const isEditingExisting = !isNewNode && decodedInitialValue.trim() !== '';

    // Action Titles
    const actionTitle = nodeId === 'NEW_CHILD'
        ? 'Add Child Node'
        : nodeId === 'INSERT_PARENT'
            ? 'Add Main Node'
            : isNewNode
                ? 'Create New Node'
                : 'Edit Node Content';

    const actionColor = nodeId === 'NEW_CHILD'
        ? 'from-blue-500 to-indigo-600'
        : nodeId === 'INSERT_PARENT'
            ? 'from-purple-500 to-pink-600'
            : 'from-amber-500 to-orange-600';

    // Parse Initial Content
    const htmlListMatch = decodedInitialValue.match(/^<(ul|ol)([\s\S]*)<\/\1>/);
    let isHtmlList = !!htmlListMatch;
    let htmlListType: 'bullet' | 'ordered' = htmlListMatch?.[1] === 'ol' ? 'ordered' : 'bullet';
    let cleanText = decodedInitialValue;

    if (isHtmlList && htmlListMatch) {
        const inner = htmlListMatch[2];
        const items = [...inner.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1]);
        if (htmlListType === 'ordered') {
            cleanText = items.map((item, i) => `${i + 1}. ${item}`).join('\n');
        } else {
            cleanText = items.map(item => `- ${item}`).join('\n');
        }
    }

    const taskRegex = /^\s*-\s\[( |x)\]\s/m;
    const htmlTaskRegex = /<ul class="checklist"/;
    const listRegex = /^\s*(-\s|\d+\.\s)/m;

    const taskMatch = cleanText.match(taskRegex);
    const htmlTaskMatch = decodedInitialValue.match(htmlTaskRegex);
    const listMatch = cleanText.match(listRegex);

    const initialIsTask = !!taskMatch || !!htmlTaskMatch;
    const initialIsList = isHtmlList || (!!listMatch && !initialIsTask);
    const initialListType = isHtmlList ? htmlListType : (listMatch ? (listMatch[1].trim().startsWith('1') ? 'ordered' : 'bullet') : 'bullet');

    if (initialIsTask) {
        cleanText = cleanText.replace(taskRegex, '');
    }

    // Generate Task Items
    const initialTaskItems: TaskItem[] = (() => {
        if (!initialIsTask) return [{ id: `item-1`, text: '', checked: false }];

        if (decodedInitialValue.includes('<ul class="checklist"')) {
            const matches = [...decodedInitialValue.matchAll(/<li[^>]*>\s*<input type="checkbox" (checked )?style="[^"]*" \/>\s*<span[^>]*>(.*?)<\/span>\s*<\/li>/g)];
            if (matches.length > 0) {
                return matches.map((m, i) => ({
                    id: `item-${Date.now()}-${i}`,
                    checked: !!m[1],
                    text: decodeHtmlEntities(m[2])
                }));
            }
        }

        const parsed = String(decodedInitialValue || '').split('\n')
            .filter(line => line.trim() !== '') // Ignore empty lines
            .map((line, i) => {
                const match = line.trim().match(/^-\s\[( |x)\]\s(.*)/);
                if (match) {
                    return {
                        id: `item-${Date.now()}-${i}`,
                        checked: match[1] === 'x',
                        text: decodeHtmlEntities(match[2])
                    };
                }
                return {
                    id: `item-${Date.now()}-${i}`,
                    checked: false,
                    text: decodeHtmlEntities(line)
                };
            });

        return parsed.length > 0 ? parsed : [{ id: `item-1`, text: '', checked: false }];
    })();

    // Robust Category Matching
    const isCodeContent = decodedInitialValue.includes('```') || (decodedInitialValue.startsWith('`') && decodedInitialValue.endsWith('`')) || decodedInitialValue.includes('data-category="code"');
    const isButtonContent = decodedInitialValue.includes('data-category="button"');
    const isEmbedContent = decodedInitialValue.includes('data-category="embed"');
    const isLinkContent = !isButtonContent && (decodedInitialValue.includes('data-category="link"') || !!decodedInitialValue.match(/\[.*?\]\(.*?\)/));
    const isMediaContent = decodedInitialValue.includes('<video') || decodedInitialValue.includes('![') || decodedInitialValue.includes('<img') || decodedInitialValue.includes('media-placeholder-container');
    const isTableContent = !isCodeContent && !isLinkContent && (decodedInitialValue.includes('<table>') || decodedInitialValue.includes('<table') || (decodedInitialValue.includes('|') && decodedInitialValue.includes('---')));

    const initialCategory: NodeCategory = isEditingExisting
        ? (initialIsTask ? 'task'
            : isCodeContent ? 'code'
                : isButtonContent ? 'button'
                : isEmbedContent ? 'embed'
                : isLinkContent ? 'link'
                    : isTableContent ? 'table'
                        : isMediaContent ? 'media'
                            : 'text')
        : 'text';

    const [category, setCategory] = useState<NodeCategory>(initialCategory);
    const [value, setValue] = useState(cleanText);
    const [taskItems, setTaskItems] = useState<TaskItem[]>(initialTaskItems);
    const [isList, setIsList] = useState(initialIsList);
    const [listType, setListType] = useState<'bullet' | 'ordered'>(initialListType as 'bullet' | 'ordered');
    const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const editorRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef(new Map<string, HTMLInputElement>());

    useEffect(() => {
        if (category === 'text' && editorRef.current) {
            if (editorRef.current.innerHTML !== value) {
                editorRef.current.innerHTML = value || '';
            }
        }
    }, [category]);

    const htmlLinkMatch = decodedInitialValue.match(/<a href="([^"]*)"[^>]*data-category="link"[^>]*>.*?<\/svg>(.*?)<\/a>/);
    const mdLinkMatch = decodedInitialValue.match(/\[(.*?)\]\((.*?)\)/);

    // Link State
    const [linkUrl, setLinkUrl] = useState(() => {
        if (htmlLinkMatch) return htmlLinkMatch[1];
        if (mdLinkMatch) return mdLinkMatch[2];
        return '';
    });
    const [linkText, setLinkText] = useState(() => {
        if (htmlLinkMatch) return htmlLinkMatch[2];
        if (mdLinkMatch) return mdLinkMatch[1];
        return '';
    });

    // Media State
    const [originalMediaUrl] = useState(() => {
        const matchImgMd = decodedInitialValue.match(/!\[.*?\]\((.*?)\)/);
        const matchSrc = decodedInitialValue.match(/src=["'](.*?)["']/);
        return matchImgMd ? matchImgMd[1] : matchSrc ? matchSrc[1] : '';
    });
    const [mediaUrl, setMediaUrl] = useState(originalMediaUrl);
    const [mediaType, setMediaType] = useState<'image' | 'video'>(() => {
        return (decodedInitialValue.includes('<video') || decodedInitialValue.includes('data-type="video"')) ? 'video' : 'image';
    });
    const [isCompressing, setIsCompressing] = useState(false);
    const [pendingFile, setPendingFile] = useState<Blob | File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showPricingModal, setShowPricingModal] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Table State
    const [tableRows, setTableRows] = useState(3);
    const [tableCols, setTableCols] = useState(3);
    const [isTableModalOpen, setIsTableModalOpen] = useState(false);

    const [mediaDimensions, setMediaDimensions] = useState<{width: number, height: number} | null>(null);

    // Code State
    const [codeContent, setCodeContent] = useState(() => {
        const htmlMatch = decodedInitialValue.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
        if (htmlMatch) return htmlMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
        const match = decodedInitialValue.match(/```([\s\S]*?)```/);
        return match ? match[1].trim() : decodedInitialValue.startsWith('`') ? decodedInitialValue.replace(/`/g, '') : '';
    });

    // Embed State
    const [embedCode, setEmbedCode] = useState(() => {
        const match = decodedInitialValue.match(/data-embedcode="([^"]*)"/);
        return match ? decodeURIComponent(match[1]) : '';
    });
    const [embedTitle, setEmbedTitle] = useState(() => {
        const match = decodedInitialValue.match(/data-embedtitle="([^"]*)"/);
        return match ? decodeURIComponent(match[1]) : '';
    });

    // Button State
    const [buttonText, setButtonText] = useState(() => {
        const match = decodedInitialValue.match(/data-category="button"[^>]*>(.*?)<\/(a|div)>/);
        return match ? match[1].replace(/<[^>]*>/g, '').trim() : '';
    });
    const [buttonUrl, setButtonUrl] = useState(() => {
        const divMatch = decodedInitialValue.match(/data-url="([^"]*)"/);
        if (divMatch) return divMatch[1];
        const aMatch = decodedInitialValue.match(/<a href="([^"]*)"[^>]*data-category="button"/);
        return aMatch ? aMatch[1] : '';
    });
    const [buttonStyle, setButtonStyle] = useState(() => {
        const match = decodedInitialValue.match(/data-styles="([^"]*)"/);
        if (match) {
            try { return JSON.parse(decodeURIComponent(match[1])); } catch (e) {}
        }
        return {
            bg: '#3b82f6',
            text: '#ffffff',
            radius: '8px',
            animPreset: 'none',
            animSpeed: 2,
            animColor: '#ffffff'
        };
    });

    const animScrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = animScrollRef.current;
        if (!el) return;
        const handleWheel = (e: WheelEvent) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                el.scrollLeft += e.deltaY;
            }
        };
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, []);

    // Client-Side Image Compression
    const compressImageToBlob = (file: File): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const maxDim = 1200;

                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error('Canvas to Blob failed'));
                    }, 'image/jpeg', 0.7);
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!userData) {
            alert("Please sign in to upload media.");
            return;
        }

        const isVideo = file.type.startsWith('video/');

        if (isVideo) {
            if (userPlan !== 'ultra') {
                setShowPricingModal(true);
                return;
            }
            if (file.size > 25 * 1024 * 1024) {
                alert("Video file size exceeds the 25MB limit.");
                return;
            }
        } else {
            if (userPlan === 'free') {
                setShowPricingModal(true);
                return;
            }
            if (file.size > 4 * 1024 * 1024) {
                alert("Image file size exceeds 4MB. Compressing image...");
            }
        }

        try {
            setIsCompressing(true);
            setUploadProgress(0);
            
            let blobToUpload: Blob | File = file;
            let ext = isVideo ? 'mp4' : 'jpg';

            if (!isVideo) {
                blobToUpload = await compressImageToBlob(file);
            }

            const localUrl = URL.createObjectURL(blobToUpload);
            setMediaUrl(localUrl);
            setMediaType(isVideo ? 'video' : 'image');
            setPendingFile(blobToUpload);
            
            if (isVideo) {
                const video = document.createElement('video');
                video.src = localUrl;
                video.onloadedmetadata = () => {
                    setMediaDimensions({ width: video.videoWidth, height: video.videoHeight });
                    setIsCompressing(false);
                };
            } else {
                const img = new Image();
                img.src = localUrl;
                img.onload = () => {
                    setMediaDimensions({ width: img.width, height: img.height });
                    setIsCompressing(false);
                };
            }

        } catch (err) {
            console.error("Processing error", err);
            alert("Error processing file.");
            setIsCompressing(false);
        }
    };

    const getFinalValue = (): string => {
        if (category === 'task') {
            const validTasks = taskItems.filter(t => t.text.trim() !== '');
            if (validTasks.length === 0) return value;
            const listItems = validTasks.map(item =>
                `<li style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; padding: 4px 8px; background: rgba(255,255,255,0.05); border-radius: 6px;">
                    <input type="checkbox" ${item.checked ? 'checked ' : ''}style="pointer-events: none; width: 14px; height: 14px; accent-color: #22c55e;" />
                    <span style="opacity: ${item.checked ? '0.85' : '1'}; font-size: 14px;">${item.text}</span>
                </li>`
            ).join('');
            return `<ul class="checklist" style="list-style: none; padding: 0; margin: 4px 0; display: flex; flex-direction: column; gap: 2px;">${listItems}</ul>`;
        }

        if (category === 'link') {
            if (!linkUrl.trim()) return value || linkText;
            const url = linkUrl.startsWith('http://') || linkUrl.startsWith('https://') ? linkUrl : `https://${linkUrl}`;
            const label = linkText.trim() || url;
            return `<a href="${url}" target="_blank" style="color: #3b82f6; text-decoration: underline; display: flex; align-items: center; gap: 4px;" data-category="link"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>${label}</a>`;
        }

        if (category === 'button') {
            if (!buttonUrl.trim()) return value || buttonText;
            const url = buttonUrl.startsWith('http://') || buttonUrl.startsWith('https://') ? buttonUrl : `https://${buttonUrl}`;
            const label = buttonText.trim() || url;
            const styleJson = encodeURIComponent(JSON.stringify(buttonStyle));
            
            // Animation styles
            let animStyle = '';
            if (buttonStyle.animPreset && buttonStyle.animPreset !== 'none') {
                animStyle = `animation: btn-${buttonStyle.animPreset} ${buttonStyle.animSpeed}s infinite; --btn-anim-color: ${buttonStyle.animColor || 'rgba(255,255,255,0.8)'};`;
            }
            
            // Output as a <div> with data-url instead of <a> to prevent instant browser navigation in visual mode.
            // Pointer-events are auto so hover works, but we prevent navigation in the SVG click handler.
            // Wrapped in an outer div with padding to prevent animation cropping in Markmap's foreignObject.
            return `<div style="padding: 16px; display: inline-block;">
                <div class="button-node-container" data-category="button" data-url="${url}" data-styles="${styleJson}" style="display: inline-block; padding: 6px 16px; background: ${buttonStyle.bg}; color: ${buttonStyle.text}; border-radius: ${buttonStyle.radius}; font-weight: 600; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2); cursor: default; transition: transform 0.1s; ${animStyle}" onmousedown="this.style.transform='scale(0.95)'" onmouseup="this.style.transform='scale(1)'" onmouseleave="this.style.transform='scale(1)'">${label}</div>
            </div>`;
        }

        if (category === 'embed') {
            if (!embedCode.trim()) return value;
            const encodedEmbed = encodeURIComponent(embedCode);
            
            // Auto-detect dimensions
            let w = 300;
            let h = 200;
            const wMatch = embedCode.match(/width=["']?(\d+)(px|%)?["']?/i);
            const hMatch = embedCode.match(/height=["']?(\d+)(px|%)?["']?/i);
            
            if (wMatch && wMatch[1]) {
                const parsedW = parseInt(wMatch[1]);
                // if it's a percentage or very large, cap it
                if (wMatch[2] === '%' || parsedW > 800) w = 600;
                else w = Math.max(200, parsedW);
            }
            if (hMatch && hMatch[1]) {
                const parsedH = parseInt(hMatch[1]);
                if (hMatch[2] === '%' || parsedH > 800) h = 400;
                else h = Math.max(100, parsedH);
            }
            
            // Constrain aspect ratio nicely if it's too large
            if (w > 600) {
                const ratio = h / w;
                w = 600;
                h = Math.round(600 * ratio);
            }

            const encodedTitle = encodeURIComponent(embedTitle.trim() || 'Embed Node');
            const displayTitle = embedTitle.trim() || 'Embed Node';
            
            // Generate marquee animation for long titles
            const titleHtml = displayTitle.length > 30 
                ? `<div class="embed-marquee-container" style="width: 100%; overflow: hidden; white-space: nowrap; position: relative;"><div class="embed-marquee" style="display: inline-block; padding-left: 100%; animation: embedMarquee 15s linear infinite; font-weight: 600; font-size: 15px;"><span>${displayTitle}</span></div></div>` 
                : `<div style="text-align: left; font-weight: 600; font-size: 15px; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayTitle}</div>`;

            return `<div class="embed-node-container" data-category="embed" data-embedcode="${encodedEmbed}" data-embedtitle="${encodedTitle}" style="position: relative; width: ${w}px; border-radius: 12px; overflow: hidden; background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5); display: flex; flex-direction: column;">
                <div class="embed-header" style="width: 100%; height: 32px; padding: 0 12px 0 16px; background: rgba(15, 23, 42, 0.9); color: rgba(255,255,255,0.9); border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: space-between; pointer-events: auto; cursor: pointer;">
                    <div style="flex: 1; overflow: hidden; display: flex; align-items: center;">
                        ${titleHtml}
                    </div>
                    <div class="embed-side-panel-btn" style="padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center; transition: background 0.2s; margin-left: 8px; color: rgba(255,255,255,0.7);" onmouseover="this.style.background='rgba(255,255,255,0.1)'; this.style.color='#fff'" onmouseout="this.style.background='transparent'; this.style.color='rgba(255,255,255,0.7)'">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>
                    </div>
                </div>
                <div class="embed-content-area" style="width: 100%; height: ${h}px; pointer-events: auto; overflow: hidden; position: relative;">
                    ${embedCode}
                    <button class="embed-fullscreen-btn" data-code="${encodedEmbed}" style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 4px; color: rgba(255,255,255,0.8); cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10;" onmouseover="this.style.color='#fff'; this.style.background='rgba(0,0,0,0.9)'" onmouseout="this.style.color='rgba(255,255,255,0.8)'; this.style.background='rgba(0,0,0,0.6)'">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                    </button>
                </div>
            </div>`;
        }

        if (category === 'media') {
            if (!mediaUrl.trim()) return value;
            if (mediaType === 'video' || mediaUrl.match(/\.(mp4|webm|mov)$/i)) {
                return `<video controls src="${mediaUrl}" width="${mediaDimensions?.width || 300}" height="${mediaDimensions?.height || 170}"></video>`;
            }
            return `![Media](${mediaUrl})<!-- width=${mediaDimensions?.width || 300} height=${mediaDimensions?.height || 170} -->`;
        }

        if (category === 'table') {
            let md = '\n';
            md += `| ${Array(tableCols).fill('Header').join(' | ')} |\n`;
            md += `| ${Array(tableCols).fill('---').join(' | ')} |\n`;
            for (let i = 0; i < tableRows; i++) {
                md += `| ${Array(tableCols).fill('Cell').join(' | ')} |\n`;
            }
            return md;
        }

        if (category === 'code') {
            if (!codeContent.trim()) return value;
            const safeContent = codeContent.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const encodedContent = encodeURIComponent(codeContent);
            return `<div class="code-node-container" style="background: #1e1e2e; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden; min-width: 250px; max-width: 500px; text-align: left; box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5); position: relative;" data-category="code">
  <div style="background: rgba(0,0,0,0.2); padding: 8px 12px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05);">
    <div style="width: 10px; height: 10px; border-radius: 50%; background: #ff5f56; box-shadow: inset 0 0 4px rgba(0,0,0,0.2);"></div>
    <div style="width: 10px; height: 10px; border-radius: 50%; background: #ffbd2e; box-shadow: inset 0 0 4px rgba(0,0,0,0.2);"></div>
    <div style="width: 10px; height: 10px; border-radius: 50%; background: #27c93f; box-shadow: inset 0 0 4px rgba(0,0,0,0.2);"></div>
    <span style="color: rgba(255,255,255,0.4); font-size: 10px; margin-left: auto; font-family: monospace; letter-spacing: 0.5px;">CODE</span>
    <button class="code-copy-btn" data-code="${encodedContent}" title="Copy Code" style="margin-left: 6px; background: transparent; border: none; padding: 2px; color: rgba(255,255,255,0.4); cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: 0.2s;" onmouseover="this.style.color='#fff'; this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.color='rgba(255,255,255,0.4)'; this.style.background='transparent'">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
    </button>
  </div>
  <div class="code-scroll-container" style="max-height: 270px; overflow-y: auto; overflow-x: auto;" onwheel="event.stopPropagation()">
    <pre style="margin: 0; padding: 16px; font-family: 'Fira Code', 'Cascadia Code', Consolas, monospace; font-size: 12px; color: #e2e8f0; white-space: pre-wrap; word-wrap: break-word; line-height: 1.5;">${safeContent}</pre>
  </div>
  <button class="code-fullscreen-btn" data-code="${encodedContent}" title="Full Screen" style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 4px; color: rgba(255,255,255,0.5); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;" onmouseover="this.style.color='#fff'; this.style.background='rgba(0,0,0,0.8)'" onmouseout="this.style.color='rgba(255,255,255,0.5)'; this.style.background='rgba(0,0,0,0.4)'">
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
  </button>
</div>`;
        }

        if (isList) {
            const lines = value.split('\n').filter(l => l.trim() !== '');
            if (lines.length === 0) return value;
            const openTag = listType === 'ordered' ? '<ol>' : '<ul>';
            const closeTag = listType === 'ordered' ? '</ol>' : '</ul>';
            const listItems = lines.map(l => `<li>${l.replace(/^(-\s|\d+\.\s)/, '')}</li>`).join('');
            return `${openTag}${listItems}${closeTag}`;
        }

        return value;
    };

    const handleFormSubmit = async () => {
        if (category === 'table') {
            // Open TableEditorModal immediately without saving an empty markdown table
            setIsTableModalOpen(true);
            return;
        }

        if (category === 'media' && pendingFile && userData) {
            setIsUploading(true);
            setUploadProgress(0);
            
            const isVideo = mediaType === 'video';
            const ext = isVideo ? 'mp4' : 'jpg';
            const fileId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
            const storageRef = ref(storage, `media/${userData.uid}/${isVideo ? 'videos' : 'images'}/${fileId}`);
            
            const uploadTask = uploadBytesResumable(storageRef, pendingFile as Blob);

            uploadTask.on('state_changed', 
                (snapshot) => {
                    const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                    setUploadProgress(progress);
                }, 
                (error) => {
                    console.error("Upload error", error);
                    alert("Error uploading file: " + error.message);
                    setIsUploading(false);
                }, 
                async () => {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    
                    // If replacing an existing media, delete the old one
                    if (originalMediaUrl && originalMediaUrl.includes('firebasestorage.googleapis.com')) {
                        try {
                            const matches = originalMediaUrl.match(/\/o\/(.*?)\?alt=media/);
                            if (matches && matches[1]) {
                                const filePath = decodeURIComponent(matches[1]);
                                const fileRef = ref(storage, filePath);
                                await deleteObject(fileRef);
                            }
                        } catch (e) {
                            console.error("Failed to delete replaced media", e);
                        }
                    }

                    let finalVal = '';
                    if (mediaType === 'video' || downloadURL.match(/\.(mp4|webm|mov)$/i)) {
                        finalVal = `<video controls src="${downloadURL}" data-size="${pendingFile.size}" width="${mediaDimensions?.width || 300}" height="${mediaDimensions?.height || 170}"></video>`;
                    } else {
                        finalVal = `![Media](${downloadURL})<!-- size=${pendingFile.size} width=${mediaDimensions?.width || 300} height=${mediaDimensions?.height || 170} -->`;
                    }
                    
                    setIsUploading(false);
                    onSubmit(finalVal);
                }
            );
            return;
        }

        // If they pasted a new URL manually or removed it, and there was an original Firebase media URL, delete it.
        if (category === 'media' && originalMediaUrl && originalMediaUrl !== mediaUrl && originalMediaUrl.includes('firebasestorage.googleapis.com')) {
            try {
                const matches = originalMediaUrl.match(/\/o\/(.*?)\?alt=media/);
                if (matches && matches[1]) {
                    const filePath = decodeURIComponent(matches[1]);
                    const fileRef = ref(storage, filePath);
                    await deleteObject(fileRef);
                }
            } catch (e) {
                console.error("Failed to delete replaced media URL", e);
            }
        }

        // Wait, if they replaced the text input URL but didn't choose a pending file,
        // we might also want to delete the old one, but we don't have the old URL easily here without storing it.
        // For simplicity, we just handle file replacement deletion.

        const finalVal = getFinalValue();
        onSubmit(finalVal);
    };

    const wrapText = (wrapper: string, endWrapper?: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selectedText = text.substring(start, end);
        if (!selectedText) return;

        const ew = endWrapper || wrapper;
        const newValue = text.substring(0, start) + wrapper + selectedText + ew + text.substring(end);
        setValue(newValue);
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + wrapper.length, end + wrapper.length);
        }, 0);
    };

    const toggleListMode = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const lines = value.split('\n');

        if (!isList) {
            setIsList(true);
            setListType('bullet');
            setValue(lines.map(l => l.startsWith('- ') ? l : `- ${l}`).join('\n'));
        } else if (listType === 'bullet') {
            setListType('ordered');
            setValue(lines.map((l, i) => `${i + 1}. ${l.replace(/^-\s/, '')}`).join('\n'));
        } else {
            setIsList(false);
            setValue(lines.map(l => l.replace(/^(\s*)([-*+]|\d+[\.\)])\s+/, '$1')).join('\n'));
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onCancel();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleFormSubmit();
            return;
        }
    };

    return (
        <>
            <div
                onKeyDown={handleKeyDown}
                className={
                    isEditorFullscreen 
                    ? "flex flex-col w-[95vw] h-[95vh] max-w-5xl bg-slate-900/95 backdrop-blur-xl text-white rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.8)] border border-slate-700/60 overflow-hidden ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-200"
                    : "flex flex-col w-[95vw] max-w-[430px] bg-slate-900/95 backdrop-blur-xl text-white rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.6)] border border-slate-700/60 overflow-hidden ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-200"
                }
            >
                {/* Header Badge */}
                <div className={`flex items-center justify-between px-4 py-2.5 bg-gradient-to-r ${actionColor} text-white shadow-md`}>
                    <div className="flex items-center gap-2">
                        <Sparkles size={16} className="animate-pulse" />
                        <span className="font-semibold text-xs tracking-wide uppercase">{actionTitle}</span>
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-1 rounded-full hover:bg-white/20 transition-colors"
                        title="Close (Esc)"
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* Visual Category Selector Bar */}
                <div className="p-2 bg-slate-800/80 border-b border-slate-700/50">
                    {isEditingExisting ? (
                        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-700/60 rounded-xl border border-slate-600/40 text-xs font-medium text-amber-300">
                            <span className="flex items-center gap-1.5">
                                <Edit2 size={13} className="text-amber-400" />
                                Editing <span className="font-bold uppercase text-white">{category}</span> Node
                            </span>
                            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
                                Context-Locked
                            </span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1">
                            {[
                                { id: 'text', label: 'Text', icon: Type, color: 'text-blue-400' },
                                { id: 'task', label: 'Checklist', icon: CheckSquare, color: 'text-emerald-400' },
                                { id: 'link', label: 'Link', icon: LinkIcon, color: 'text-cyan-400' },
                                { id: 'media', label: 'Media', icon: ImageIcon, color: 'text-purple-400' },
                                { id: 'table', label: 'Table', icon: TableIcon, color: 'text-amber-400' },
                                { id: 'code', label: 'Code', icon: Code, color: 'text-orange-400' },
                                { id: 'button', label: 'Button', icon: MousePointer2, color: 'text-pink-400' },
                                { id: 'embed', label: 'Embed', icon: AppWindow, color: 'text-indigo-400' },
                            ].map(cat => {
                                const Icon = cat.icon;
                                const isActive = category === cat.id;
                                return (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => setCategory(cat.id as NodeCategory)}
                                        className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[10px] font-medium transition-all ${isActive
                                                ? 'bg-slate-700/90 text-white shadow-inner border border-slate-500/50 scale-105'
                                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
                                            }`}
                                    >
                                        <Icon size={16} className={`mb-1 ${isActive ? cat.color : 'text-slate-400'}`} />
                                        <span>{cat.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

{/* Dynamic Content Area */}
                <div className={`p-3 ${isEditorFullscreen ? 'flex-1 h-full max-h-none overflow-hidden' : 'min-h-[140px] max-h-[340px] overflow-y-auto custom-thin-scrollbar'}`}>
                    {/* 1. TEXT MODE */}
                    {category === 'text' && (
                        <div className={`flex flex-col gap-2 ${isEditorFullscreen ? 'h-full' : ''}`}>
                            <div className="flex items-center gap-1 p-1 bg-slate-800/50 rounded-lg border border-slate-700/40 overflow-x-auto no-scrollbar flex-wrap">
                                <button onMouseDown={(e) => { e.preventDefault(); document.execCommand('bold', false); editorRef.current?.focus(); setValue(editorRef.current?.innerHTML || ''); }} className="p-1.5 hover:bg-slate-700/60 rounded text-slate-300 hover:text-white" title="Bold"><Bold size={13} /></button>
                                <button onMouseDown={(e) => { e.preventDefault(); document.execCommand('italic', false); editorRef.current?.focus(); setValue(editorRef.current?.innerHTML || ''); }} className="p-1.5 hover:bg-slate-700/60 rounded text-slate-300 hover:text-white" title="Italic"><Italic size={13} /></button>
                                <button onMouseDown={(e) => { e.preventDefault(); document.execCommand('underline', false); editorRef.current?.focus(); setValue(editorRef.current?.innerHTML || ''); }} className="p-1.5 hover:bg-slate-700/60 rounded text-slate-300 hover:text-white" title="Underline"><Underline size={13} /></button>
                                <button onMouseDown={(e) => { e.preventDefault(); document.execCommand('strikeThrough', false); editorRef.current?.focus(); setValue(editorRef.current?.innerHTML || ''); }} className="p-1.5 hover:bg-slate-700/60 rounded text-slate-300 hover:text-white" title="Strikethrough"><Strikethrough size={13} /></button>
                                
                                <div className="w-[1px] h-4 bg-slate-700 mx-1" />
                                
                                <button onMouseDown={(e) => { e.preventDefault(); document.execCommand('superscript', false); editorRef.current?.focus(); setValue(editorRef.current?.innerHTML || ''); }} className="px-1.5 py-0.5 font-mono text-xs hover:bg-slate-700/60 rounded text-slate-300 hover:text-white" title="Superscript">X²</button>
                                <button onMouseDown={(e) => { e.preventDefault(); document.execCommand('subscript', false); editorRef.current?.focus(); setValue(editorRef.current?.innerHTML || ''); }} className="px-1.5 py-0.5 font-mono text-xs hover:bg-slate-700/60 rounded text-slate-300 hover:text-white" title="Subscript">X₂</button>
                                
                                <div className="w-[1px] h-4 bg-slate-700 mx-1" />
                                
                                <select 
                                    onChange={(e) => { document.execCommand('fontSize', false, e.target.value); editorRef.current?.focus(); setValue(editorRef.current?.innerHTML || ''); }}
                                    className="bg-slate-700/60 text-[11px] rounded text-slate-200 border border-slate-600/50 px-1 py-1 focus:outline-none"
                                    title="Font Size"
                                    defaultValue="3"
                                >
                                    <option value="1">Small</option>
                                    <option value="3">Normal</option>
                                    <option value="5">Large</option>
                                    <option value="7">Huge</option>
                                </select>
                                
                                <div className="flex items-center gap-1 ml-auto">
                                    <label title="Text Color" className="flex items-center justify-center cursor-pointer w-6 h-6 rounded hover:bg-slate-700/60 overflow-hidden relative">
                                        <div className="absolute bottom-1 w-3 h-1 bg-current" style={{ color: 'white' }}></div>
                                        <span className="text-[10px] font-bold pb-1">A</span>
                                        <input 
                                            type="color" 
                                            onChange={(e) => { document.execCommand('foreColor', false, e.target.value); editorRef.current?.focus(); setValue(editorRef.current?.innerHTML || ''); }} 
                                            className="absolute opacity-0 w-full h-full cursor-pointer"
                                        />
                                    </label>
                                    
                                    <label title="Highlight Color" className="flex items-center justify-center cursor-pointer w-6 h-6 rounded hover:bg-slate-700/60 overflow-hidden relative">
                                        <Highlighter size={13} className="text-slate-300" />
                                        <input 
                                            type="color" 
                                            onChange={(e) => { 
                                                // Some browsers use hiliteColor, some use backColor
                                                document.execCommand('hiliteColor', false, e.target.value) || document.execCommand('backColor', false, e.target.value); 
                                                editorRef.current?.focus(); 
                                                setValue(editorRef.current?.innerHTML || ''); 
                                            }} 
                                            className="absolute opacity-0 w-full h-full cursor-pointer"
                                        />
                                    </label>

                                    <div className="w-[1px] h-4 bg-slate-700 mx-1" />

                                    <button 
                                        onClick={(e) => { e.preventDefault(); setIsEditorFullscreen(!isEditorFullscreen); }} 
                                        className="p-1.5 hover:bg-slate-700/60 rounded text-slate-300 hover:text-white" 
                                        title={isEditorFullscreen ? "Exit Fullscreen" : "Fullscreen Editor"}
                                    >
                                        {isEditorFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                    </button>
                                </div>
                            </div>

                            <div
                                ref={editorRef}
                                contentEditable
                                onInput={(e) => setValue(e.currentTarget.innerHTML)}
                                className={`w-full p-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-sans leading-normal break-words whitespace-pre-wrap overflow-auto code-scroll-container ${isEditorFullscreen ? 'flex-1 min-h-[300px]' : 'min-h-[100px]'}`}
                                style={isEditorFullscreen ? {} : { maxHeight: '200px' }}
                                data-placeholder="Type node content..."
                            />
                        </div>
                    )}

                    {/* 2. CHECKLIST MODE */}
                    {category === 'task' && (
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center px-1 text-xs text-emerald-400 font-medium">
                                <span>Checklist Items ({taskItems.filter(t => t.checked).length}/{taskItems.length})</span>
                                <button
                                    onClick={() => {
                                        const newItem = { id: `item-${Date.now()}`, text: '', checked: false };
                                        setTaskItems([...taskItems, newItem]);
                                    }}
                                    className="flex items-center gap-1 text-[11px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full transition-colors"
                                >
                                    <Plus size={12} /> Add Item
                                </button>
                            </div>

                            <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto custom-thin-scrollbar pr-1">
                                {taskItems.map((item, idx) => (
                                    <div key={item.id} className="flex items-center gap-2 bg-slate-800/60 p-2 rounded-xl border border-slate-700/50 group">
                                        <input
                                            type="checkbox"
                                            checked={item.checked}
                                            onChange={() => {
                                                const updated = [...taskItems];
                                                updated[idx].checked = !updated[idx].checked;
                                                setTaskItems(updated);
                                            }}
                                            className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                                        />
                                        <input
                                            ref={el => {
                                                if (el) itemRefs.current.set(item.id, el);
                                                else itemRefs.current.delete(item.id);
                                            }}
                                            type="text"
                                            placeholder={`Task ${idx + 1}...`}
                                            className={`flex-1 bg-transparent border-none text-sm text-slate-100 placeholder-slate-500 focus:outline-none ${item.checked ? 'line-through text-slate-500' : ''}`}
                                            value={item.text}
                                            onChange={e => {
                                                const updated = [...taskItems];
                                                updated[idx].text = e.target.value;
                                                setTaskItems(updated);
                                            }}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    const newItem = { id: `item-${Date.now()}`, text: '', checked: false };
                                                    const updated = [...taskItems];
                                                    updated.splice(idx + 1, 0, newItem);
                                                    setTaskItems(updated);
                                                    setTimeout(() => itemRefs.current.get(newItem.id)?.focus(), 0);
                                                }
                                            }}
                                        />
                                        {taskItems.length > 1 && (
                                            <button
                                                onClick={() => setTaskItems(taskItems.filter(t => t.id !== item.id))}
                                                className="p-1 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 3. LINK MODE */}
                    {category === 'link' && (
                        <div className="flex flex-col gap-3 p-1">
                            <div>
                                <label className="block text-[11px] font-medium text-cyan-400 mb-1">Web Address (URL)</label>
                                <input
                                    type="text"
                                    autoFocus
                                    placeholder="https://example.com"
                                    className="w-full p-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                    value={linkUrl}
                                    onChange={e => setLinkUrl(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-medium text-slate-400 mb-1">Display Label (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Visit Documentation"
                                    className="w-full p-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                    value={linkText}
                                    onChange={e => setLinkText(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {/* 4. MEDIA MODE */}
                    {category === 'media' && (
                        <div className="flex flex-col gap-3 p-1">
                            <div className="flex items-center gap-2 bg-slate-800/60 p-1.5 rounded-xl border border-slate-700/50">
                                <button
                                    onClick={() => setMediaType('image')}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${mediaType === 'image' ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                                >
                                    <ImageIcon size={13} />
                                    <span>Image</span>
                                    <span className="flex items-center justify-center bg-yellow-500/20 text-yellow-400 p-1 rounded-full border border-yellow-500/40">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M2 20h20v2H2z"/><path d="m2 18 3-11 4 4 3-8 3 8 4-4 3 11z"/></svg>
                                    </span>
                                </button>

                                <button
                                    onClick={() => setMediaType('video')}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${mediaType === 'video' ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                                >
                                    <Video size={13} />
                                    <span>Video</span>
                                    <span className="flex items-center justify-center bg-purple-500/20 text-purple-400 p-1 rounded-full border border-purple-500/40">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M2 20h20v2H2z"/><path d="m2 18 3-11 4 4 3-8 3 8 4-4 3 11z"/></svg>
                                    </span>
                                </button>
                            </div>

                            <div className="flex flex-col gap-2">
                                <div className="relative overflow-hidden rounded-xl">
                                    <div
                                        onClick={() => {
                                            const isImageLocked = mediaType === 'image' && userPlan === 'free';
                                            const isVideoLocked = mediaType === 'video' && userPlan !== 'ultra';
                                            if (!isImageLocked && !isVideoLocked) fileInputRef.current?.click();
                                        }}
                                        className={`border-2 border-dashed border-slate-700/80 hover:border-purple-500/60 rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer bg-slate-800/40 hover:bg-slate-800/80 transition-colors ${isCompressing || isUploading || (mediaType === 'image' && userPlan === 'free') || (mediaType === 'video' && userPlan !== 'ultra') ? 'opacity-40' : ''}`}
                                    >
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            className="hidden"
                                            accept={mediaType === 'image' ? 'image/*' : 'video/*'}
                                            onChange={handleFileUpload}
                                        />
                                        <Film size={20} className="text-purple-400 mb-1" />
                                        <span className="text-xs font-medium text-slate-200">
                                            {isCompressing ? "Processing file..." : mediaUrl ? `Click to Replace ${mediaType === 'image' ? 'Image (<4MB)' : 'Video (<25MB)'}` : `Click to Choose ${mediaType === 'image' ? 'Image (<4MB)' : 'Video (<25MB)'}`}
                                        </span>
                                        <span className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                            {mediaType === 'image' ? (
                                                <span className="text-yellow-400 flex items-center gap-1">⭐ Requires Pro Plan (Auto Compressed)</span>
                                            ) : (
                                                <span className="text-purple-400 flex items-center gap-1">⭐ Requires Ultra Plan (Max 25MB)</span>
                                            )}
                                        </span>
                                    </div>

                                    {/* Lock Overlay */}
                                    {((mediaType === 'image' && userPlan === 'free') || (mediaType === 'video' && userPlan !== 'ultra')) && (
                                        <div className={`absolute inset-0 backdrop-blur-[2px] flex flex-col items-center justify-center z-10 rounded-xl ${mediaType === 'image' ? 'bg-yellow-500/10' : 'bg-purple-500/10'}`}>
                                            <span className="text-xs font-bold text-white mb-2 drop-shadow-md">
                                                {mediaType === 'image' ? 'Unlock Image Attach Feature' : 'Unlock Video Attach Feature'}
                                            </span>
                                            <button 
                                                onClick={() => setShowPricingModal(true)}
                                                className={`px-4 py-1.5 rounded-full text-xs font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95 ${mediaType === 'image' ? 'bg-gradient-to-r from-yellow-500 to-amber-600 shadow-yellow-500/25' : 'bg-gradient-to-r from-purple-500 to-fuchsia-600 shadow-purple-500/25'}`}
                                            >
                                                {mediaType === 'image' ? 'Upgrade to Pro' : 'Upgrade to Ultra'}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Or paste Direct Media URL..."
                                        className="w-full p-2 bg-slate-800/60 border border-slate-700/60 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                        value={mediaUrl}
                                        onChange={e => setMediaUrl(e.target.value)}
                                    />
                                </div>
                            </div>

                            {mediaUrl.trim() && (
                                <div className="p-2 bg-slate-800/40 rounded-xl border border-slate-700/40 flex flex-col items-center justify-center">
                                    <span className="text-[10px] text-slate-400 mb-1">Live Preview</span>
                                    {mediaType === 'image' ? (
                                        <img src={mediaUrl} alt="Preview" className="max-h-24 rounded border border-slate-700 object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
                                    ) : (
                                        <video src={mediaUrl} className="max-h-24 rounded border border-slate-700" controls />
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 5. TABLE CREATION MODE WITH "SAVE & EDIT TABLE" BUTTON */}
                    {category === 'table' && (
                        <div className="flex flex-col gap-3 p-1">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1 bg-slate-800/50 p-2 rounded-xl border border-slate-700/50">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[11px] font-medium text-amber-400">Rows</label>
                                        <input
                                            type="number" min="1" max="15"
                                            value={tableRows}
                                            onChange={e => setTableRows(Math.max(1, Math.min(15, parseInt(e.target.value) || 1)))}
                                            className="w-12 px-1.5 py-0.5 text-xs text-center bg-slate-900 border border-slate-700 rounded text-amber-300 font-bold outline-none"
                                        />
                                    </div>
                                    <input
                                        type="range" min="1" max="5"
                                        value={tableRows <= 5 ? tableRows : 5}
                                        onChange={e => setTableRows(Number(e.target.value))}
                                        className="w-full accent-amber-500 cursor-pointer"
                                    />
                                </div>

                                <div className="flex flex-col gap-1 bg-slate-800/50 p-2 rounded-xl border border-slate-700/50">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[11px] font-medium text-amber-400">Columns</label>
                                        <input
                                            type="number" min="1" max="15"
                                            value={tableCols}
                                            onChange={e => setTableCols(Math.max(1, Math.min(15, parseInt(e.target.value) || 1)))}
                                            className="w-12 px-1.5 py-0.5 text-xs text-center bg-slate-900 border border-slate-700 rounded text-amber-300 font-bold outline-none"
                                        />
                                    </div>
                                    <input
                                        type="range" min="1" max="5"
                                        value={tableCols <= 5 ? tableCols : 5}
                                        onChange={e => setTableCols(Number(e.target.value))}
                                        className="w-full accent-amber-500 cursor-pointer"
                                    />
                                </div>
                            </div>

                            {/* Mini Grid Preview */}
                            <div className="p-2 bg-slate-800/60 rounded-xl border border-slate-700/50 flex flex-col items-center justify-center min-h-[70px]">
                                <span className="text-[10px] text-slate-400 mb-1.5 font-medium flex items-center gap-1">
                                    <Grid size={11} className="text-amber-400" /> Live Grid Preview ({tableRows} × {tableCols})
                                </span>
                                <div
                                    className="grid gap-1 bg-slate-700/50 p-1.5 rounded-lg w-full max-w-[210px] overflow-hidden"
                                    style={{ gridTemplateColumns: `repeat(${tableCols}, minmax(0, 1fr))` }}
                                >
                                    {Array.from({ length: Math.min(tableRows, 15) * Math.min(tableCols, 15) }).map((_, i) => (
                                        <div
                                            key={i}
                                            className={`h-3.5 rounded-[2px] transition-all ${i % Math.min(tableCols, 15) < tableCols
                                                    ? 'bg-amber-500/50 border border-amber-400/60 shadow-sm'
                                                    : 'bg-slate-600/50 border border-slate-500/30'
                                                }`}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Table Action Prompt */}
                            <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50 flex flex-col items-center justify-center text-center">
                                <span className="text-xs text-slate-300 font-medium mb-1">
                                    Click <span className="text-amber-400 font-bold">"Open Advanced Editor"</span> to enter cell data
                                </span>
                                <span className="text-[10px] text-slate-400">
                                    Creates empty table and launches visual spreadsheet editor
                                </span>
                            </div>
                        </div>
                    )}

                    {/* 6. CODE MODE */}
                    {category === 'code' && (
                        <div className="flex flex-col gap-2 p-1">
                            <label className="block text-[11px] font-medium text-slate-400">Code Snippet Editor</label>
                            <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-[#1e1e2e]">
                                <div className="bg-black/20 px-3 py-2 flex items-center gap-1.5 border-b border-white/5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] shadow-inner"></div>
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] shadow-inner"></div>
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f] shadow-inner"></div>
                                    <span className="text-white/40 text-[10px] ml-auto font-mono tracking-widest">CODE</span>
                                </div>
                                <textarea
                                    autoFocus
                                    rows={6}
                                    placeholder="// Write your code snippet here..."
                                    className="code-textarea w-full p-3 bg-transparent font-mono text-[11px] md:text-xs text-[#e2e8f0] placeholder-slate-600 focus:outline-none resize-none leading-relaxed"
                                    value={codeContent}
                                    onChange={e => setCodeContent(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {/* 7. BUTTON MODE */}
                    {category === 'button' && (
                        <div className="flex flex-col gap-3 p-1">
                            <div className="flex flex-col gap-1.5">
                                <label className="block text-[11px] font-medium text-slate-400">Button Text</label>
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Click me!"
                                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50"
                                    value={buttonText}
                                    onChange={e => setButtonText(e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="block text-[11px] font-medium text-slate-400">Target URL</label>
                                <input
                                    type="text"
                                    placeholder="https://example.com"
                                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50"
                                    value={buttonUrl}
                                    onChange={e => setButtonUrl(e.target.value)}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <label className="block text-[11px] font-medium text-slate-400">Background Color</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={buttonStyle.bg}
                                            onChange={e => setButtonStyle({ ...buttonStyle, bg: e.target.value })}
                                            className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0 p-0"
                                        />
                                        <input
                                            type="text"
                                            value={buttonStyle.bg}
                                            onChange={e => setButtonStyle({ ...buttonStyle, bg: e.target.value })}
                                            className="flex-1 px-2 py-1.5 bg-slate-900/50 border border-slate-700/50 rounded-lg text-xs text-white"
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="block text-[11px] font-medium text-slate-400">Text Color</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={buttonStyle.text}
                                            onChange={e => setButtonStyle({ ...buttonStyle, text: e.target.value })}
                                            className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0 p-0"
                                        />
                                        <input
                                            type="text"
                                            value={buttonStyle.text}
                                            onChange={e => setButtonStyle({ ...buttonStyle, text: e.target.value })}
                                            className="flex-1 px-2 py-1.5 bg-slate-900/50 border border-slate-700/50 rounded-lg text-xs text-white"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="block text-[11px] font-medium text-slate-400">Corner Radius (px)</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="30"
                                    value={parseInt(buttonStyle.radius) || 0}
                                    onChange={e => setButtonStyle({ ...buttonStyle, radius: e.target.value + 'px' })}
                                    className="w-full accent-pink-500"
                                />
                                <div className="text-right text-[10px] text-slate-500">{buttonStyle.radius}</div>
                            </div>
                            
                            {/* Animation Presets Swipe Container */}
                            <div className="flex flex-col gap-1.5 mt-2">
                                <label className="block text-[11px] font-medium text-slate-400">Animation Preset</label>
                                <div 
                                    ref={animScrollRef}
                                    className="flex overflow-x-auto gap-2 pb-2 snap-x custom-thin-scrollbar" 
                                >
                                    {[
                                        { id: 'none', label: 'None' },
                                        { id: 'pulse', label: 'Pulse' },
                                        { id: 'glow', label: 'Glow' },
                                        { id: 'float', label: 'Float' },
                                        { id: 'shake', label: 'Shake' },
                                        { id: 'heartbeat', label: 'Heartbeat' },
                                        { id: 'wiggle', label: 'Wiggle' },
                                        { id: 'rubberband', label: 'Rubber Band' },
                                        { id: 'flash', label: 'Flash' },
                                        { id: 'swing', label: 'Swing' },
                                        { id: 'border-pulse', label: 'Border Pulse' }
                                    ].map(preset => (
                                        <button
                                            key={preset.id}
                                            onClick={() => setButtonStyle({ ...buttonStyle, animPreset: preset.id })}
                                            className={`snap-start flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-medium border transition-colors ${buttonStyle.animPreset === preset.id ? 'bg-pink-500/20 border-pink-500/50 text-pink-300' : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-700/50'}`}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Animation Settings (Speed / Color) */}
                            {buttonStyle.animPreset && buttonStyle.animPreset !== 'none' && (
                                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-900/40 border border-slate-800">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="block text-[10px] font-medium text-slate-400">Animation Speed (s)</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="range"
                                                min="0.5"
                                                max="5"
                                                step="0.1"
                                                value={buttonStyle.animSpeed || 2}
                                                onChange={e => setButtonStyle({ ...buttonStyle, animSpeed: parseFloat(e.target.value) })}
                                                className="flex-1 accent-pink-500"
                                            />
                                            <span className="text-[10px] text-slate-300 w-6">{buttonStyle.animSpeed}s</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="block text-[10px] font-medium text-slate-400">Effect Color</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={buttonStyle.animColor || '#ffffff'}
                                                onChange={e => setButtonStyle({ ...buttonStyle, animColor: e.target.value })}
                                                className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                                            />
                                            <span className="text-[10px] text-slate-300 uppercase">{buttonStyle.animColor || '#FFFFFF'}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="mt-2 p-4 rounded-xl border border-slate-700/50 bg-slate-900/30 flex items-center justify-center overflow-hidden">
                                <button
                                    style={{
                                        background: buttonStyle.bg,
                                        color: buttonStyle.text,
                                        borderRadius: buttonStyle.radius,
                                        padding: '8px 20px',
                                        fontWeight: '600',
                                        fontSize: '14px',
                                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.2)',
                                        transition: 'transform 0.1s',
                                        animation: buttonStyle.animPreset && buttonStyle.animPreset !== 'none' ? `btn-${buttonStyle.animPreset} ${buttonStyle.animSpeed || 2}s infinite` : 'none',
                                        '--btn-anim-color': buttonStyle.animColor || 'rgba(255,255,255,0.8)'
                                    } as React.CSSProperties}
                                    onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
                                    onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    {buttonText || 'Preview Button'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 8. EMBED MODE */}
                    {category === 'embed' && (
                        <div className="flex flex-col gap-2 p-1">
                            <label className="block text-[11px] font-medium text-slate-400">Embed Title (Optional, max 200 chars)</label>
                            <input
                                type="text"
                                placeholder="E.g., Tutorial Video"
                                value={embedTitle}
                                onChange={(e) => setEmbedTitle(e.target.value.substring(0, 200))}
                                className="w-full p-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                            />
                            
                            <label className="block text-[11px] font-medium text-slate-400 mt-2">Embed iframe Code (YouTube, Figma, Maps, etc.)</label>
                            <textarea
                                autoFocus
                                rows={6}
                                placeholder='<iframe width="560" height="315" src="..." frameborder="0" allowfullscreen></iframe>'
                                className="w-full p-3 bg-slate-900/50 border border-slate-700/50 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 font-mono resize-none leading-relaxed"
                                value={embedCode}
                                onChange={e => setEmbedCode(e.target.value)}
                            />
                            {embedCode && (
                                <div className="mt-2 p-2 rounded-xl border border-slate-700/50 bg-slate-900/30">
                                    <div className="text-[10px] text-slate-400 mb-2 font-medium uppercase tracking-wider">Preview</div>
                                    <div className="w-full aspect-video rounded-lg overflow-hidden border border-white/10 bg-black/50 pointer-events-none" dangerouslySetInnerHTML={{ __html: embedCode }} />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Toolbar */}
                <div className="flex items-center justify-between p-3 bg-slate-800/90 border-t border-slate-700/60">
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1 bg-slate-700/60 px-2 py-0.5 rounded text-slate-300 border border-slate-600/40">
                            <kbd className="font-mono font-bold">Esc</kbd> Cancel
                        </span>
                        <span className="flex items-center gap-1 bg-slate-700/60 px-2 py-0.5 rounded text-slate-300 border border-slate-600/40">
                            <kbd className="font-mono font-bold">Ctrl+Enter</kbd> Save
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-700/60 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>

                        {category === 'table' ? (
                            <button
                                type="button"
                                onClick={handleFormSubmit}
                                className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-amber-500/25 transition-all active:scale-95"
                            >
                                <Sparkles size={14} />
                                Open Advanced Editor
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleFormSubmit}
                                disabled={isCompressing || isUploading}
                                className={`flex items-center gap-1.5 px-4 py-1.5 text-white text-xs font-semibold rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
                                    ${category === 'media' && pendingFile ? 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 shadow-purple-500/25' : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-blue-500/25'}`}
                            >
                                <Check size={14} />
                                {isUploading ? `Uploading... ${uploadProgress}%` : (category === 'media' && pendingFile ? 'Upload & Save' : 'Save Node')}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* INTERACTIVE SPREADSHEET TABLE EDITOR MODAL */}
            <TableEditorModal
                isOpen={isTableModalOpen}
                onClose={() => setIsTableModalOpen(false)}
                initialRows={tableRows}
                initialCols={tableCols}
                initialData={decodedInitialValue}
                onSubmit={(tableHtml) => {
                    onSubmit(tableHtml);
                    setIsTableModalOpen(false);
                }}
            />

            <PricingModal 
                isOpen={showPricingModal} 
                onClose={() => setShowPricingModal(false)} 
                currentPlan={userPlan as 'free' | 'pro' | 'ultra'} 
            />
        </>
    );
}
