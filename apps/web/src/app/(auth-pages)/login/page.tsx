import { Suspense } from 'react';
import { z } from 'zod';
import { getEnabledSocialProviders } from '@/lib/auth/socialProviders';
import { Login } from './Login';

const SearchParamsSchema = z.object({
  next: z.string().optional(),
  nextActionType: z.string().optional(),
  closed: z.string().optional(),
});

async function LoginWrapper(props: {
  searchParams: Promise<unknown>;
}) {
  const searchParams = await props.searchParams;
  const { next, nextActionType, closed } = SearchParamsSchema.parse(searchParams);
  const providers = await getEnabledSocialProviders();
  return (
    <Login
      next={next}
      nextActionType={nextActionType}
      closed={closed === '1'}
      providers={providers}
    />
  );
}

export default async function LoginPage(props: {
  searchParams: Promise<unknown>;
}) {
  return <Suspense>
    <LoginWrapper searchParams={props.searchParams} />
  </Suspense>
}
