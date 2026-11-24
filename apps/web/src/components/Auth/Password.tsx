'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { T } from '@/components/ui/Typography';
import { Label } from '@/components/ui/label';
import { useLocale } from '@/contexts/LocaleContext';
import { CSSProperties, useState } from 'react';

export const Password = ({
  onSubmit,
  isLoading,
  successMessage,
  label,
  buttonLabel,
  className,
  style,
}: {
  onSubmit: (password: string) => void;
  isLoading: boolean;
  successMessage?: string;
  label?: string;
  buttonLabel?: string;
  className?: string;
  style?: CSSProperties;
}) => {
  const { t } = useLocale();
  const [password, setPassword] = useState<string>('');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(password);
      }}
      className={className}
      style={style}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password" className="text-muted-foreground">
            {label ?? t('كلمة السر', 'Password')}
          </Label>
          <div>
            <Input
              id="password"
              name="password"
              type="password"
              value={password}
              disabled={isLoading}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
        </div>
        <div>
          <Button disabled={isLoading} type="submit" className="w-full">
            {isLoading ? (
              <>
                <Spinner className="h-4 w-4 me-2" />
                <span>{t('جارٍ التحميل...', 'Loading...')}</span>
              </>
            ) : (
              buttonLabel ?? t('تحديث', 'Update')
            )}
          </Button>
        </div>
        <div>
          {successMessage ? (
            <T.P className="text-sm text-green-500 dark:text-green-400 text-center">
              {successMessage}
            </T.P>
          ) : null}
        </div>
      </div>
    </form>
  );
};
