import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Button } from '../components/Bits';
import { ShieldCheck, Sparkles, Globe2, Users, ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { householdApi, connectionsApi, type HouseholdPreview, type ConnectPreview } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { detectCurrency } from '../lib/geoCurrency';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';

// Shared background + logo chrome for every auth-flow screen (login/signup, forgot
// password, reset password) so adding a new screen never means re-pasting the blobs,
// logo, and centering wrapper.
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-cloud flex items-center justify-center px-5 relative overflow-hidden">
      <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full gradient-brand opacity-20 blur-3xl animate-float" />
      <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full gradient-warm opacity-20 blur-3xl animate-float" style={{ animationDelay: '1.2s' }} />

      <div className="w-full max-w-sm relative animate-fade-up">
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 rounded-xl gradient-brand flex items-center justify-center relative overflow-hidden shadow-md shadow-brand/30">
            <div className="w-4 h-4 rounded-full bg-white/90 -mr-2" />
            <div className="w-4 h-4 rounded-full bg-white/40 -ml-2" />
          </div>
          <span className="font-extrabold text-2xl tracking-tight text-gradient-brand">Amana</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AuthPage({
  inviteCode,
  connectCode,
  resetToken,
  onConsumedReset,
}: {
  inviteCode?: string | null;
  connectCode?: string | null;
  resetToken?: string | null;
  onConsumedReset?: () => void;
}) {
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : inviteCode || connectCode ? 'signup' : 'login');
  const { login, signup, updateProfile } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [invitePreview, setInvitePreview] = useState<HouseholdPreview | null>(null);
  const [connectPreview, setConnectPreview] = useState<ConnectPreview | null>(null);

  useEffect(() => {
    if (!inviteCode) return;
    householdApi.preview(inviteCode).then(setInvitePreview).catch(() => setInvitePreview(null));
  }, [inviteCode]);

  useEffect(() => {
    if (!connectCode) return;
    connectionsApi.preview(connectCode).then(setConnectPreview).catch(() => setConnectPreview(null));
  }, [connectCode]);

  // Switching to 'reset' mode ever happens exactly once, driven by resetToken being
  // present on mount — but if the person navigates back to login from the reset screen
  // and the token is still sitting in state (edge case, e.g. browser back button), don't
  // snap them back into reset mode underneath them.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await signup(email, password, name);
        // A new account has no money figures to convert yet, so this is the one safe
        // moment to set its default currency from the device location. The browser owns
        // the permission prompt; if location is unavailable or declined, detectCurrency
        // falls back to the browser region and finally leaves the USD default unchanged.
        void detectCurrency()
          .then((result) => result && updateProfile({ currency: result.currency }))
          .catch(() => undefined);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === 'forgot') {
    return (
      <AuthShell>
        <ForgotPasswordCard onBack={() => setMode('login')} />
      </AuthShell>
    );
  }

  if (mode === 'reset' && resetToken) {
    return (
      <AuthShell>
        <ResetPasswordCard
          token={resetToken}
          onSuccess={() => onConsumedReset?.()}
          onBackToLogin={() => {
            onConsumedReset?.();
            setMode('login');
          }}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      {inviteCode && invitePreview && (
        <div className="flex items-center gap-2.5 bg-brand-softer border border-line rounded-xl px-4 py-3 mb-4 text-xs text-ink-soft">
          <Users size={15} className="text-brand shrink-0" />
          <span>
            You've been invited to join <strong className="text-ink">{invitePreview.name}</strong> ({invitePreview.memberCount}{' '}
            {invitePreview.memberCount === 1 ? 'member' : 'members'}). {mode === 'login' ? 'Sign in' : 'Create your account'} to join.
          </span>
        </div>
      )}

      {connectCode && connectPreview && (
        <div className="flex items-center gap-2.5 bg-brand-softer border border-line rounded-xl px-4 py-3 mb-4 text-xs text-ink-soft">
          <Avatar emoji={connectPreview.avatarEmoji} color={connectPreview.avatarColor} image={connectPreview.avatarImage} size={26} />
          <span>
            <strong className="text-ink">{connectPreview.name}</strong> wants to connect with you on Amana.{' '}
            {mode === 'login' ? 'Sign in' : 'Create your account'} to connect.
          </span>
        </div>
      )}

      <div className="bg-paper border border-line rounded-2xl p-6 shadow-xl shadow-brand/5">
        <h1 className="text-lg font-bold mb-1">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="text-[13px] text-ink-soft mb-5">
          {mode === 'login' ? 'Sign in to keep every dollar — and every shilling, rupee, or naira — accounted for.' : 'Free to start, and your budget begins empty — built for households managing money across more than one currency.'}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {mode === 'signup' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10.5px] uppercase tracking-wide text-mute font-medium">Name</label>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="bg-cloud border border-line rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none transition-colors" placeholder="Jane Student" />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10.5px] uppercase tracking-wide text-mute font-medium">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-cloud border border-line rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none font-num transition-colors" placeholder="you@example.com" />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10.5px] uppercase tracking-wide text-mute font-medium">Password</label>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => { setError(null); setMode('forgot'); }}
                  className="text-[11px] text-brand font-semibold hover:underline underline-offset-2"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="bg-cloud border border-line rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none font-num transition-colors" placeholder="At least 8 characters" />
          </div>

          {error && <div className="text-xs text-red bg-red-soft rounded-lg px-3 py-2">{error}</div>}

          <Button type="submit" variant="primary">
            <span className="w-full block text-center">{submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</span>
          </Button>
        </form>
      </div>

      <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }} className="w-full text-center text-[13px] text-ink-soft mt-4 hover:text-ink transition-colors">
        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
        <span className="text-brand font-semibold">{mode === 'login' ? 'Sign up' : 'Sign in'}</span>
      </button>

      <div className="flex items-center justify-center gap-5 mt-7 text-[11px] text-mute">
        <span className="flex items-center gap-1"><ShieldCheck size={13} /> Bank-grade security</span>
        <span className="flex items-center gap-1"><Globe2 size={13} /> 20+ currencies</span>
        <span className="flex items-center gap-1"><Sparkles size={13} /> Free to start</span>
      </div>
    </AuthShell>
  );
}

// Step 1 of the reset flow: ask for the email address and request a link. Always shows
// the same success state whether or not the address is on file (see the server route),
// so this screen can't be used to probe which emails have an Amana account.
function ForgotPasswordCard({ onBack }: { onBack: () => void }) {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await requestPasswordReset(email);
      setSent(true);
      setDevResetUrl(result.resetUrl ?? null);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-paper border border-line rounded-2xl p-6 shadow-xl shadow-brand/5">
      <button onClick={onBack} className="flex items-center gap-1 text-[12.5px] text-ink-soft hover:text-ink transition-colors mb-4">
        <ArrowLeft size={13} /> Back to sign in
      </button>

      {sent ? (
        <>
          <div className="w-11 h-11 rounded-full bg-emerald-soft flex items-center justify-center mb-3.5">
            <Mail size={19} className="text-emerald-deep" />
          </div>
          <h1 className="text-lg font-bold mb-1">Check your email</h1>
          <p className="text-[13px] text-ink-soft leading-relaxed">
            If an account exists for <strong className="text-ink font-num">{email}</strong>, a link to reset the password is on its
            way. It expires in 30 minutes.
          </p>
          {devResetUrl && (
            <div className="mt-4 text-xs bg-brand-softer border border-line rounded-lg px-3 py-2.5 leading-relaxed">
              <div className="font-semibold text-ink-soft mb-1">Development mode</div>
              <p className="text-mute mb-2">No email provider is configured yet, so here's the link directly:</p>
              <a href={devResetUrl} className="text-brand font-num break-all hover:underline">{devResetUrl}</a>
            </div>
          )}
        </>
      ) : (
        <>
          <h1 className="text-lg font-bold mb-1">Reset your password</h1>
          <p className="text-[13px] text-ink-soft mb-5">Enter the email on your account and we'll send a link to set a new password.</p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10.5px] uppercase tracking-wide text-mute font-medium">Email</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-cloud border border-line rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none font-num transition-colors"
                placeholder="you@example.com"
              />
            </div>
            {error && <div className="text-xs text-red bg-red-soft rounded-lg px-3 py-2">{error}</div>}
            <Button type="submit" variant="primary">
              <span className="w-full block text-center">{submitting ? 'Sending…' : 'Send reset link'}</span>
            </Button>
          </form>
        </>
      )}
    </div>
  );
}

// Step 2: landed on via the ?reset=TOKEN link from the email. A successful submit logs
// the person straight in (see AuthContext.resetPassword / the server route), so there's
// no separate "now go log in" step after proving ownership of the email address.
function ResetPasswordCard({ token, onBackToLogin, onSuccess }: { token: string; onBackToLogin: () => void; onSuccess: () => void }) {
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'This reset link is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="bg-paper border border-line rounded-2xl p-6 shadow-xl shadow-brand/5 text-center">
        <div className="w-11 h-11 rounded-full bg-emerald-soft flex items-center justify-center mb-3.5 mx-auto">
          <CheckCircle2 size={19} className="text-emerald-deep" />
        </div>
        <h1 className="text-lg font-bold mb-1">Password updated</h1>
        <p className="text-[13px] text-ink-soft leading-relaxed">You're signed in with your new password — taking you in…</p>
      </div>
    );
  }

  return (
    <div className="bg-paper border border-line rounded-2xl p-6 shadow-xl shadow-brand/5">
      <h1 className="text-lg font-bold mb-1">Set a new password</h1>
      <p className="text-[13px] text-ink-soft mb-5">Choose something you haven't used on Amana before.</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10.5px] uppercase tracking-wide text-mute font-medium">New password</label>
          <input
            type="password"
            required
            autoFocus
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-cloud border border-line rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none font-num transition-colors"
            placeholder="At least 8 characters"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10.5px] uppercase tracking-wide text-mute font-medium">Confirm new password</label>
          <input
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="bg-cloud border border-line rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none font-num transition-colors"
            placeholder="Type it again"
          />
        </div>
        {error && <div className="text-xs text-red bg-red-soft rounded-lg px-3 py-2">{error}</div>}
        <Button type="submit" variant="primary">
          <span className="w-full block text-center">{submitting ? 'Saving…' : 'Save new password'}</span>
        </Button>
      </form>
      <button onClick={onBackToLogin} className="w-full text-center text-[12.5px] text-ink-soft mt-4 hover:text-ink transition-colors">
        Back to sign in
      </button>
    </div>
  );
}
