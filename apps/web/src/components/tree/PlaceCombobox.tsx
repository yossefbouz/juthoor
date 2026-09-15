'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';

import { searchPlacesClient } from './placeSearchClient';

interface Props {
  readonly value: string | null;
  readonly onChange: (placeId: string | null, placeName: string | null) => void;
  readonly placeholder?: string;
}

/**
 * Searchable combobox over the seeded `places` table. Debounced via
 * React Query's default staleTime; searches both Arabic and English
 * names via the server-side `searchPlaces` helper.
 */
export function PlaceCombobox({
  value,
  onChange,
  placeholder,
}: Props) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const { data: places = [], isFetching } = useQuery({
    queryKey: ['places', query],
    queryFn: () => searchPlacesClient(query),
    staleTime: 60_000,
  });

  const selected = places.find((p) => p.id === value);
  const nameFor = (p: { name_ar: string | null; name_en?: string | null }) =>
    locale === 'ar' ? p.name_ar ?? p.name_en : p.name_en ?? p.name_ar;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between font-normal',
            !selected && 'text-muted-foreground'
          )}
        >
          {selected
            ? nameFor(selected) ?? '—'
            : placeholder ?? t('اختر القرية أو المدينة', 'Select a village or town')}
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('ابحث بالعربية أو الإنجليزية...', 'Search in Arabic or English…')}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {isFetching ? t('جارٍ البحث…', 'Searching…') : t('لم يتم العثور على نتائج.', 'No results found.')}
            </CommandEmpty>
            <CommandGroup>
              {places.map((place) => (
                <CommandItem
                  key={place.id}
                  value={place.id}
                  onSelect={() => {
                    onChange(
                      place.id,
                      nameFor(place) ?? null
                    );
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'me-2 h-4 w-4',
                      value === place.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {nameFor(place)}
                    </span>
                    {place.district_ar ? (
                      <span className="text-xs text-muted-foreground">
                        {locale === 'ar' ? place.district_ar : place.district_en ?? place.district_ar}
                      </span>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
