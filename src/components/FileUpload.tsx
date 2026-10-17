import { useState, useCallback, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onUpload: (file: File) => Promise<void>;
  isLoading?: boolean;
}

export function FileUpload({ onUpload, isLoading }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.toLowerCase().endsWith('.csv')) {
        setFile(droppedFile);
        setUploadStatus('idle');
      } else {
        toast.error('Please drop a .csv file');
      }
    }
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUploadStatus('idle');
    }
  }, []);

  const handleUpload = async () => {
    if (!file) return;

    try {
      await onUpload(file);
      setUploadStatus('success');
      setTimeout(() => {
        setFile(null);
        setUploadStatus('idle');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }, 2000);
    } catch {
      setUploadStatus('error');
      setTimeout(() => {
        setUploadStatus('idle');
      }, 4000);
    }
  };

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all duration-200',
          dragActive
            ? 'border-primary bg-accent'
            : 'border-border hover:border-primary/50 hover:bg-muted/50',
          file && 'border-solid'
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleChange}
          className="absolute inset-0 cursor-pointer opacity-0"
        />

        <div className="flex flex-col items-center gap-3 text-center">
          {file ? (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
                <FileSpreadsheet className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Upload className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-foreground">
                  Drop your CSV file here
                </p>
                <p className="text-sm text-muted-foreground">
                  or click to browse
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {file && (
        <div className="flex items-center gap-3">
          <Button
            onClick={handleUpload}
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload & Analyze
              </>
            )}
          </Button>

          {uploadStatus === 'success' && (
            <div className="flex items-center gap-2 text-status-healthy">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Success</span>
            </div>
          )}

          {uploadStatus === 'error' && (
            <div className="flex items-center gap-2 text-status-critical">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Error</span>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg bg-muted/50 p-4">
        <p className="text-sm font-medium text-foreground mb-2">
          Expected CSV Format:
        </p>
        <code className="text-xs text-muted-foreground font-mono">
          engine_id, cycle, sensor_1 … sensor_21
        </code>
      </div>
    </div>
  );
}
