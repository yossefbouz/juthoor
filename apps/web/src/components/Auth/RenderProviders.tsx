import * as SocialIcons from '@/components/Auth/Icons';
import { Button } from '@/components/ui/button';
import { AuthProvider } from '@/types';

function capitalize(word: string) {
  const lower = word.toLowerCase();
  return word.charAt(0).toUpperCase() + lower.slice(1);
}

export const RenderProviders = <P extends AuthProvider>({
  providers,
  onProviderLoginRequested,
  isLoading,
}: {
  providers: readonly P[];
  onProviderLoginRequested: (provider: P) => void;
  isLoading: boolean;
}) => {
  if (providers.length === 0) return null;
  return (
    <div className="space-y-2.5 flex flex-col">
      {providers.map((provider) => {
        const AuthIcon = SocialIcons[provider as AuthProvider];
        return (
          <Button
            key={provider}
            variant="default"
            size="default"
            disabled={isLoading}
            onClick={() => onProviderLoginRequested(provider)}
            className="bg-white dark:bg-white text-black dark:text-black border h-10 border-gray-400 dark:border-gray-600 rounded-lg"
          >
            <div className="me-2">
              <AuthIcon />
            </div>
            <span className="">{capitalize(provider)}</span>
          </Button>
        );
      })}
    </div>
  );
};
