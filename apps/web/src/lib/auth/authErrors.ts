export const GENERIC_AUTH_ERROR =
  'حدث خطأ ما. حاول مرة أخرى · Something went wrong. Please try again.';

/**
 * Map a raw server/Supabase error into a user-facing, bilingual (AR · EN)
 * message. Known auth failures get a specific friendly message; anything else
 * collapses to {@link GENERIC_AUTH_ERROR} so raw internals (DB errors, stack
 * details, PostgREST codes) never reach the client. Callers should log the raw
 * error separately for server-side debugging.
 */
export function friendlyAuthError(raw: unknown): string {
  const message = raw instanceof Error ? raw.message : String(raw ?? '');
  const t = message.toLowerCase();

  // Wrong or expired OTP / token (Supabase: "Token has expired or is invalid").
  if (
    /(token|otp|one[- ]?time|code)\s*(has\s+)?(expired|is\s+invalid|invalid)/.test(t) ||
    /(expired|invalid)\s.*(token|otp|code)/.test(t)
  ) {
    return 'الرمز غير صحيح أو انتهت صلاحيته · The code is incorrect or expired. Try again or resend.';
  }
  // Wrong email/password.
  if (/invalid login credentials|invalid credentials|wrong password/.test(t)) {
    return 'البريد أو كلمة المرور غير صحيحة · Incorrect email or password.';
  }
  // Email not yet confirmed.
  if (/email not confirmed|not confirmed/.test(t)) {
    return 'لم يتم تأكيد بريدك بعد · Your email address is not confirmed yet.';
  }
  // Duplicate signup.
  if (/already registered|already exists|already been registered/.test(t)) {
    return 'هذا البريد مسجَّل بالفعل · This email is already registered — try logging in.';
  }
  // Rate limiting (Supabase: "For security purposes, you can only request this after N seconds").
  if (/rate limit|too many requests|for security purposes|after \d+ seconds/.test(t)) {
    return 'محاولات كثيرة. انتظر قليلاً ثم حاول مجددًا · Too many attempts. Please wait a moment and try again.';
  }
  // No such account.
  if (/user not found|no user found/.test(t)) {
    return 'لا يوجد حساب بهذا البريد · No account found for this email.';
  }
  // Auth / authorization required.
  if (/not authenticated|not logged in|not authorized|unauthorized/.test(t)) {
    return 'يلزم تسجيل الدخول للمتابعة · You need to be signed in to do that.';
  }
  // Weak password on set.
  if (/password/.test(t) && /(short|weak|at least|characters|length)/.test(t)) {
    return 'كلمة المرور ضعيفة جدًا · That password is too weak.';
  }

  // Person-claim / request flow (RPC exception codes + remapped action messages).
  // Keep these specific so safe-action does not collapse them to the generic line.
  if (/claim_requires_approval/.test(t)) {
    return 'ربط هذا الشخص يحتاج موافقة مالك الشجرة · Claiming this person requires the tree owner\'s approval.';
  }
  if (/living_status_change_not_allowed/.test(t)) {
    return 'فقط مسؤول الشجرة أو صاحب السجل يمكنه تسجيل وفاة شخص حي · Only the tree administrator or the person themselves can record a death for a living person.';
  }
  if (/tree_access_required/.test(t)) {
    return 'يلزم الوصول إلى الشجرة لطلب الربط · You need access to this tree before requesting a claim.';
  }
  if (
    /already_pending|already.?linked|already claimed|pending claim/.test(t)
  ) {
    return 'هذا الشخص مربوط بالفعل أو لديه طلب معلّق · This person is already linked or has a pending claim.';
  }
  if (
    /verification_required|verify your identity before claiming|verify your identity/.test(
      t
    )
  ) {
    return 'وثّق هويتك قبل المطالبة بسجل شخص حي · Verify your identity before claiming a living person record.';
  }

  return GENERIC_AUTH_ERROR;
}
