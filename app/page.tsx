

'use client';

import { useChat } from '@ai-sdk/react';
import { User, Bot, Send, Upload, Image as ImageIcon } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Chat() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState('');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  // Image upload states
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imageDescription, setImageDescription] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadStatus, setImageUploadStatus] = useState('');

  // Store images for the latest response
  const [latestImages, setLatestImages] = useState<any[]>([]);

  const fetchRelevantImages = async (query: string) => {
    try {
      const response = await fetch('/api/search-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.images && data.images.length > 0) {
          console.log('Setting images:', data.images);
          setLatestImages(data.images);
        } else {
          setLatestImages([]);
        }
      }
    } catch (error) {
      console.error('Error fetching images:', error);
      setLatestImages([]);
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);

    if (!file) {
      setUploadStatus('');
      return;
    }

    if (file.type !== 'application/pdf') {
      setSelectedFile(null);
      setUploadStatus('✗ Only PDF files are supported');
      return;
    }

    setUploadStatus(`Selected: ${file.name}`);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadStatus('✗ Please choose a PDF first');
      return;
    }

    setUploading(true);
    setUploadStatus('Uploading + vectorizing...');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile); // MUST be "file" (your API expects this)

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setUploadStatus(`✗ Error: ${data.error ?? 'Upload failed'}`);
        return;
      }

      setUploadStatus(`✓ ${data.message}`);
      setSelectedFile(null);
      setTimeout(() => setUploadStatus(''), 5000);
    } catch (e) {
      setUploadStatus('✗ Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedImage(file);

    if (!file) {
      setImageUploadStatus('');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setSelectedImage(null);
      setImageUploadStatus('✗ Only image files are supported');
      return;
    }

    setImageUploadStatus(`Selected: ${file.name}`);
  };

  const handleImageUpload = async () => {
    if (!selectedImage) {
      setImageUploadStatus('✗ Please choose an image first');
      return;
    }

    if (!imageDescription.trim()) {
      setImageUploadStatus('✗ Please provide a description for the image');
      return;
    }

    setUploadingImage(true);
    setImageUploadStatus('Uploading image...');

    try {
      const formData = new FormData();
      formData.append('file', selectedImage);
      formData.append('description', imageDescription);

      const res = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setImageUploadStatus(`✗ Error: ${data.error ?? 'Upload failed'}`);
        return;
      }

      setImageUploadStatus(`✓ ${data.message}`);
      setSelectedImage(null);
      setImageDescription('');
      setTimeout(() => setImageUploadStatus(''), 5000);
    } catch (e) {
      setImageUploadStatus('✗ Upload failed');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      const userQuery = input.trim();
      sendMessage({ text: userQuery });
      
      // Fetch relevant images for this query
      fetchRelevantImages(userQuery);
      
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="bg-black text-white p-4 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.5)]">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-4">AI Teacher Assistant</h1>

          {/* PDF Upload Section */}
          <div className="flex items-center gap-2 mb-3">
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFilePick}
              disabled={uploading}
              className="hidden"
              id="file-upload"
            />

            <label
              htmlFor="file-upload"
              className={`flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg cursor-pointer hover:bg-gray-200 transition ${
                uploading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <Upload className="w-5 h-5" />
              <span>{selectedFile ? 'Change PDF' : 'Choose PDF'}</span>
            </label>

            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
              className={`px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition ${
                uploading || !selectedFile ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {uploading ? 'Working...' : 'Upload & Vectorize'}
            </button>

            {uploadStatus && <span className="text-sm">{uploadStatus}</span>}
          </div>

          {/* Image Upload Section */}
          <div className="border-t border-gray-700 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <input
                type="file"
                accept="image/*"
                onChange={handleImagePick}
                disabled={uploadingImage}
                className="hidden"
                id="image-upload"
              />

              <label
                htmlFor="image-upload"
                className={`flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg cursor-pointer hover:bg-gray-200 transition ${
                  uploadingImage ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <ImageIcon className="w-5 h-5" />
                <span>{selectedImage ? 'Change Image' : 'Choose Image'}</span>
              </label>

              <input
                type="text"
                value={imageDescription}
                onChange={(e) => setImageDescription(e.target.value)}
                placeholder="Describe this image..."
                disabled={uploadingImage || !selectedImage}
                className="flex-1 px-3 py-2 bg-white text-black rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
              />

              <button
                type="button"
                onClick={handleImageUpload}
                disabled={uploadingImage || !selectedImage || !imageDescription.trim()}
                className={`px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition ${
                  uploadingImage || !selectedImage || !imageDescription.trim() ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {uploadingImage ? 'Uploading...' : 'Upload Image'}
              </button>
            </div>

            {imageUploadStatus && <p className="text-sm text-center">{imageUploadStatus}</p>}
          </div>
        </div>
      </header>

      {/* rest of your chat UI unchanged */}
      <div className="flex-1 overflow-hidden flex justify-center">
        <div className="w-full max-w-4xl flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m, msgIndex) => {
              // Show images only on the last assistant message
              const isLastAssistantMessage = m.role === 'assistant' && msgIndex === messages.length - 1;
              const messageImages = isLastAssistantMessage ? latestImages : [];
              
              return (
                <div
                  key={m.id}
                  className={`flex items-start gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      m.role === 'user' ? 'bg-black order-2' : 'bg-gray-600 order-1'
                    }`}
                  >
                    {m.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
                  </div>

                  <div className={`flex flex-col gap-2 max-w-[75%] ${m.role === 'user' ? 'order-1' : 'order-2'}`}>
                    <div
                      className={`p-3 rounded-lg shadow-md ${
                        m.role === 'user' ? 'bg-black text-white' : 'bg-gray-200 text-black'
                      }`}
                    >
                      {m.parts.map((part, index) => {
                        if (part.type === 'text') {
                          return (
                            <div key={`${m.id}-${index}`} className="whitespace-pre-wrap">
                              {part.text}
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>

                    {/* Display images associated with this message */}
                    {messageImages && messageImages.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <p className="text-sm text-gray-600 font-semibold">Relevant Images:</p>
                        <div className="grid grid-cols-1 gap-2">
                          {messageImages.map((img: any, idx: number) => (
                            <div key={`img-${m.id}-${idx}`} className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-300">
                              <img
                                src={img.url}
                                alt={img.description}
                                className="w-full h-48 object-cover"
                                onError={(e) => {
                                  console.error('Image failed to load:', img.url);
                                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3EImage Error%3C/text%3E%3C/svg%3E';
                                }}
                              />
                              <div className="p-2">
                                <p className="text-sm text-gray-700">{img.description}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                  Similarity: {(img.similarity * 100).toFixed(1)}%
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
              <div className="flex space-x-2">
                <input
                  className="flex-1 p-3 pb-14 mb-4 bg-white h-30 text-black border border-gray-400 focus:outline-none rounded-xl"
                  value={input}
                  placeholder="Type your message..."
                  onChange={(e) => setInput(e.target.value)}
                />

                <button
                  type="submit"
                  className="px-4 py-2 mb-4 bg-gray-800 text-white rounded-lg hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-600 shadow-md flex items-center justify-center"
                  disabled={status !== 'ready'}
                >
                  {status === 'submitted' || status === 'streaming' ? (
                    <div className="w-5 h-5 border-t-2 border-white rounded-full animate-spin"></div>
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}


