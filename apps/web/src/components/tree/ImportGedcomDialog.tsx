'use client';

import { Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/contexts/LocaleContext';

interface Props {
  readonly treeId: string;
}

interface ImportSummary {
  readonly personsInserted: number;
  readonly familiesInserted: number;
  readonly childLinksInserted: number;
  readonly eventsInserted: number;
  readonly unmatchedPlaces: readonly string[];
  readonly errors: readonly string[];
}

const MAX_BYTES = 5 * 1024 * 1024;

export function ImportGedcomDialog({ treeId }: Props) {
  const { t } = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function reset() {
    setFile(null);
    setSummary(null);
  }

  async function handleUpload() {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error('الملف يتجاوز 5 ميجابايت');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/tree/${treeId}/gedcom`, {
        method: 'POST',
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body?.error ?? 'فشل الاستيراد');
        return;
      }

      setSummary(body as ImportSummary);
      toast.success(
        `تم استيراد ${body.personsInserted} شخصًا و${body.familiesInserted} عائلة`
      );
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="inline-flex items-center gap-2">
          <Upload className="h-4 w-4" />
          {t('استيراد شجرة من منصة أخرى', 'Import a tree from another platform')}
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('استيراد شجرة من منصة أخرى', 'Import a tree from another platform')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'ارفع ملف .ged من منصة أخرى (حتى ٥ ميجابايت) وسيُضاف محتواه إلى شجرتك، وأنت مديرها. قد تحتاج القرى غير المعروفة إلى ربط يدوي لاحقًا. يبقى الأحياء مخفيين عن غيرك: بياناتهم غير الإلزامية تُصدَّر لمدير الشجرة وحده.',
              'Upload a .ged file from another platform (up to 5 MB). Its people are added to your tree, which you manage. Unknown villages may need linking by hand later. The living people stay hidden from everyone else: only the IFT Administrator can export their non-mandatory details.',
            )}
          </DialogDescription>
        </DialogHeader>

        {!summary ? (
          <div className="space-y-3">
            <Input
              type="file"
              accept=".ged,.GED,text/plain"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={isUploading}
            />
            {file ? (
              <p className="text-xs text-muted-foreground">
                الملف: {file.name} ({Math.round(file.size / 1024)} KB)
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <div>
              <strong>الأشخاص:</strong> {summary.personsInserted}
            </div>
            <div>
              <strong>العائلات:</strong> {summary.familiesInserted}
            </div>
            <div>
              <strong>الروابط (أبناء):</strong> {summary.childLinksInserted}
            </div>
            <div>
              <strong>الأحداث:</strong> {summary.eventsInserted}
            </div>
            {summary.unmatchedPlaces.length > 0 ? (
              <div>
                <strong>قرى بدون تطابق ({summary.unmatchedPlaces.length}):</strong>
                <ul className="mt-1 max-h-24 list-disc overflow-auto ps-6 text-xs">
                  {summary.unmatchedPlaces.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {summary.errors.length > 0 ? (
              <div className="text-destructive">
                <strong>أخطاء ({summary.errors.length}):</strong>
                <ul className="mt-1 max-h-24 list-disc overflow-auto ps-6 text-xs">
                  {summary.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {summary ? (
            <Button onClick={() => setOpen(false)}>تم</Button>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={isUploading}
              >
                إلغاء
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!file || isUploading}
              >
                {isUploading ? 'جارٍ الاستيراد…' : 'استيراد'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
