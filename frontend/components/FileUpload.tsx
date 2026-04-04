'use client';

import { useState, useRef, useCallback } from 'react';

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export default function FileUpload({ onFileSelected, disabled }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      setError('');
      if (!/\.xlsx?$/i.test(file.name)) {
        setError('Only .xlsx and .xls files are supported');
        return;
      }
      onFileSelected(file);
    },
    [onFileSelected],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <div className="mb-4">
      <div
        className={`border-2 border-dashed rounded-[10px] p-12 text-center cursor-pointer transition-colors duration-200 ${
          dragOver
            ? 'border-brand-cyan bg-brand-cyan/5'
            : 'border-border-hover hover:border-border-hover/80'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div className="text-4xl mb-3">&#128196;</div>
        <div className="text-[15px] font-bold text-cyan-300 mb-1.5">
          Drop your Excel file here
        </div>
        <div className="text-xs text-[#4b5563] mb-4">
          or click to browse &middot; .xlsx / .xls
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="text-brand-red text-[13px] mt-2">{error}</p>}
    </div>
  );
}
