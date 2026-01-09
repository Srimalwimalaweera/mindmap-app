import React, { useState, useRef } from 'react';

interface MediaInputProps {
    onInsert: (markdown: string) => void;
    onCancel: () => void;
}

export default function MediaInput({ onInsert, onCancel }: MediaInputProps) {
    const [activeTab, setActiveTab] = useState<'upload' | 'url'>('url');
    const [mediaDetails, setMediaDetails] = useState({
        url: '',
        alt: '',
        type: 'image' as 'image' | 'video'
    });
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = (file: File) => {
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');

        if (!isImage && !isVideo) {
            alert('Please upload an image or video file.');
            return;
        }

        const maxSize = isImage ? 4 * 1024 * 1024 : 15 * 1024 * 1024; // 4MB or 15MB
        if (file.size > maxSize) {
            alert(`File too large. Max size: ${isImage ? '4MB' : '15MB'}`);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            setMediaDetails({
                ...mediaDetails,
                url: result,
                type: isImage ? 'image' : 'video',
                alt: file.name
            });
        };
        reader.readAsDataURL(file);
    };

    const handleInsert = () => {
        if (!mediaDetails.url) return;

        let markdown = '';
        if (mediaDetails.type === 'image') {
            markdown = `![${mediaDetails.alt}](${mediaDetails.url})`;
        } else {
            // Simple video link for now, or HTML video tag if supported by renderer
            // Defaulting to Markdown link for safety, but user asked for "load video" btn
            // We'll use a specific syntax or HTML if Markmap supports it.
            // Markmap supports HTML.
            markdown = `<video src="${mediaDetails.url}" controls width="300"></video>`;
        }
        onInsert(markdown);
    };

    return (
        <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-700 animate-in slide-in-from-bottom-2">
            <div className="flex gap-2 mb-3">
                <button
                    onClick={() => setActiveTab('url')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${activeTab === 'url' ? 'bg-blue-500 text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                >
                    Link URL
                </button>
                <button
                    onClick={() => setActiveTab('upload')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${activeTab === 'upload' ? 'bg-blue-500 text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                >
                    Upload
                </button>
            </div>

            {activeTab === 'url' ? (
                <div className="space-y-2">
                    <input
                        type="text"
                        placeholder="Media URL (http://...)"
                        className="w-full p-2 text-sm rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={mediaDetails.url}
                        onChange={(e) => setMediaDetails({ ...mediaDetails, url: e.target.value })}
                    />
                    <div className="flex gap-2">
                        <select
                            className="p-2 text-sm rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 outline-none"
                            value={mediaDetails.type}
                            onChange={(e) => setMediaDetails({ ...mediaDetails, type: e.target.value as 'image' | 'video' })}
                        >
                            <option value="image">Image</option>
                            <option value="video">Video</option>
                        </select>
                        <input
                            type="text"
                            placeholder="Description / Alt Text"
                            className="flex-1 p-2 text-sm rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-blue-500 outline-none"
                            value={mediaDetails.alt}
                            onChange={(e) => setMediaDetails({ ...mediaDetails, alt: e.target.value })}
                        />
                    </div>
                </div>
            ) : (
                <div
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${dragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-zinc-300 dark:border-zinc-700 hover:border-blue-400'}`}
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setDragActive(false);
                        if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*,video/*"
                        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                    />
                    <div className="text-zinc-500 text-sm">
                        {mediaDetails.url && activeTab === 'upload' ? (
                            <span className="text-green-500 font-medium">{mediaDetails.alt} selected</span>
                        ) : (
                            <>
                                <p>Click or Drag to Upload</p>
                                <p className="text-xs opacity-70 mt-1">Images (max 4MB) or Videos (max 15MB)</p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Preview */}
            {mediaDetails.url && (
                <div className="mt-3 relative rounded overflow-hidden bg-black/5 dark:bg-black/20 max-h-32 flex items-center justify-center">
                    {mediaDetails.type === 'image' ? (
                        <img src={mediaDetails.url} alt="Preview" className="max-h-32 object-contain" />
                    ) : (
                        <video src={mediaDetails.url} className="max-h-32" controls />
                    )}
                </div>
            )}

            <div className="flex justify-end gap-2 mt-3">
                <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
                    Cancel
                </button>
                <button
                    onClick={handleInsert}
                    disabled={!mediaDetails.url}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Insert Media
                </button>
            </div>
        </div>
    );
}
