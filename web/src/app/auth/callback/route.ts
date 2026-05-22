import { completeSignIn } from '@/lib/auth/complete-sign-in';

export async function GET(request: Request) {
  return completeSignIn(request);
}
