import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Upload, X, Volume2, VolumeX, Sun, Moon, Monitor, MapPin, Loader2, Trash2, Sparkles, Eye, EyeOff, ShieldCheck, AlertTriangle, ArrowRight, Mail, KeyRound } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useCurrency } from '../lib/CurrencyContext';
import { CURRENCIES } from '../lib/currencies';
import { Button, Field, SectionHeading, EmptyState, inputClassText } from '../components/Bits';
import { Avatar } from '../components/Avatar';
import { THEMES, ACCENT_PRESETS, AVATAR_EMOJI_OPTIONS, AVATAR_COLOR_OPTIONS, AVATAR_COLOR_HEX } from '../lib/themes';
import { isSoundEnabled, setSoundEnabled, playClick, playCoin } from '../lib/sounds';
import { detectCurrency } from '../lib/geoCurrency';
import type { ColorMode, FullState, CategoryRule } from '../lib/api';
import { api } from '../lib/api';

// Uploaded photos are downscaled client-side to a small square before they ever leave the
// browser — keeps the request small and sidesteps needing real image-processing infra
// for what's just a profile picture.
const AVATAR_IMAGE_SIZE = 160;

function resizeImageToDataUrl(file: File, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not supported'));
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}

export function Settings({ state, onDataChanged }: { state: FullState; onDataChanged: () => void }) {
  const { user, logout, updateProfile, changeEmail, changePassword, deleteAccount } = useAuth();
  const { currency } = useCurrency();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [customAccent, setCustomAccent] = useState(user?.accentColor || '#6d28d9');
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function saveName() {
    if (!name.trim() || name === user?.name) return;
    setSaving(true);
    await updateProfile({ name: name.trim() });
    setSaving(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  async function changeCurrency(code: string) {
    setDetectMsg(null);
    await updateProfile({ currency: code });
  }

  async function autoDetectCurrency() {
    setDetecting(true);
    setDetectMsg(null);
    try {
      const result = await detectCurrency();
      if (!result) {
        setDetectMsg("Couldn't detect a supported currency for your location — pick one manually below.");
        return;
      }
      await updateProfile({ currency: result.currency });
      setDetectMsg(
        result.source === 'geolocation'
          ? `Detected ${result.currency} from your device location.`
          : `Estimated ${result.currency} from your browser language — enable location for a more precise match.`
      );
      playCoin();
    } catch {
      setDetectMsg("Couldn't detect your location — pick a currency manually below.");
    } finally {
      setDetecting(false);
    }
  }

  async function changeColorMode(mode: ColorMode) {
    await updateProfile({ colorMode: mode });
    playClick();
  }

  async function changeTheme(themeId: string) {
    await updateProfile({ theme: themeId });
    playClick();
  }

  async function changeAvatarEmoji(emoji: string) {
    await updateProfile({ avatarEmoji: emoji, clearAvatarImage: true });
    playClick();
  }

  async function changeAvatarColor(color: string) {
    await updateProfile({ avatarColor: color });
  }

  async function handlePhotoSelected(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please choose an image file.');
      return;
    }
    setUploadingPhoto(true);
    setPhotoError(null);
    try {
      const dataUrl = await resizeImageToDataUrl(file, AVATAR_IMAGE_SIZE);
      await updateProfile({ avatarImage: dataUrl });
      playCoin();
    } catch (e: any) {
      setPhotoError(e.message || 'Could not use that photo.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removePhoto() {
    await updateProfile({ clearAvatarImage: true });
  }

  async function applyAccentColor(hex: string) {
    setCustomAccent(hex);
    await updateProfile({ accentColor: hex });
    playClick();
  }

  async function resetAccent() {
    await updateProfile({ clearAccentColor: true });
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundEnabled(next);
    setSoundOn(next);
    if (next) playCoin();
  }

  async function loadDemoData() {
    setSeeding(true);
    setSeedMsg(null);
    try {
      await api.seedDemo();
      onDataChanged();
      setSeedMsg('Sample data loaded.');
    } catch (e: any) {
      setSeedMsg(e.message || 'Could not load sample data.');
    } finally {
      setSeeding(false);
    }
  }

  const hasData = state.categories.length > 0;

  return (
    <div className="max-w-3xl settings-page">
      <div className="settings-hero bg-paper border border-line rounded-[1.5rem] p-5 sm:p-6 mb-7 flex flex-col sm:flex-row sm:items-center gap-4">
        <Avatar emoji={user?.avatarEmoji} color={user?.avatarColor} image={user?.avatarImage} size={56} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand mb-1">Account center</p>
          <h2 className="text-xl font-bold tracking-tight truncate">{user?.name || 'Your account'}</h2>
          <p className="text-sm text-ink-soft truncate">{user?.email}</p>
        </div>
        <a href="#security" className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-softer text-brand px-4 py-2.5 text-sm font-semibold hover:brightness-95 transition">
          Account security <ArrowRight size={15} />
        </a>
      </div>
      <SectionHeading>Profile</SectionHeading>
      <div className="card-lift bg-paper border border-line rounded-[1.35rem] p-5 flex flex-col gap-4">
        <Field label="Name">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} className={inputClassText} />
        </Field>
        <div className="rounded-xl bg-cloud border border-line px-3.5 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2.5">
            <Mail size={15} className="text-brand shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.12em] text-mute font-bold">Email address</div>
              <div className="font-num text-sm text-ink truncate">{user?.email}</div>
            </div>
          </div>
          <a href="#security" className="text-xs font-semibold text-brand hover:underline underline-offset-4 whitespace-nowrap">Change</a>
        </div>
        {savedFlash && <div className="text-xs text-emerald-deep">Saved.</div>}
        {saving && <div className="text-xs text-mute">Saving…</div>}
      </div>

      <SectionHeading>Currency</SectionHeading>
      <div className="card-lift bg-paper border border-line rounded-2xl p-5 flex flex-col gap-3">
        <Field label="Display currency">
          <div className="flex flex-wrap gap-2 items-center">
            <select value={currency} onChange={(e) => changeCurrency(e.target.value)} className={`${inputClassText} max-w-xs`}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
            <button
              onClick={autoDetectCurrency}
              disabled={detecting}
              className="flex items-center gap-1.5 text-xs font-semibold text-brand bg-brand-softer px-3 py-2 rounded-lg hover:brightness-95 transition disabled:opacity-60"
            >
              {detecting ? <Loader2 size={13} className="animate-spin" /> : <MapPin size={13} />}
              {detecting ? 'Detecting…' : 'Detect automatically'}
            </button>
          </div>
        </Field>
        {detectMsg && <p className="text-xs text-ink-soft">{detectMsg}</p>}
        <p className="text-xs text-mute leading-relaxed">
          Amounts are stored exactly as you enter them, in this currency — no exchange rate involved. If you switch
          currencies, your existing figures are converted once using the live rate at that moment, so nothing gets
          silently relabeled at the wrong scale.
        </p>
      </div>

      <SectionHeading>Appearance</SectionHeading>
      <div className="card-lift bg-paper border border-line rounded-2xl p-5">
        <div className="text-[13px] font-semibold mb-1">Mode</div>
        <p className="text-xs text-mute mb-3.5">Light, dark, or match your device's setting automatically.</p>
        <div className="grid grid-cols-3 gap-2.5 mb-1">
          {(
            [
              { id: 'light' as ColorMode, label: 'Light', icon: Sun },
              { id: 'dark' as ColorMode, label: 'Dark', icon: Moon },
              { id: 'system' as ColorMode, label: 'Device', icon: Monitor },
            ]
          ).map((m) => {
            const active = (user?.colorMode || 'system') === m.id;
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => changeColorMode(m.id)}
                className={`card-lift flex flex-col items-center gap-1.5 rounded-xl border py-3 transition-colors ${active ? 'border-brand ring-2 ring-brand-soft' : 'border-line'}`}
              >
                <Icon size={16} className={active ? 'text-brand' : 'text-mute'} />
                <span className="text-[12.5px] font-semibold">{m.label}</span>
              </button>
            );
          })}
        </div>

        <div className="h-px bg-line my-4" />
        <div className="text-[13px] font-semibold mb-1">Theme</div>
        <p className="text-xs text-mute mb-3.5">Pick a look that feels like yours — changes apply everywhere, instantly.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {THEMES.map((t) => {
            const active = (user?.theme || 'violet') === t.id;
            return (
              <button
                key={t.id}
                onClick={() => changeTheme(t.id)}
                className={`card-lift text-left rounded-xl border p-3 transition-colors ${active ? 'border-brand ring-2 ring-brand-soft' : 'border-line'}`}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-4 h-4 rounded-full block" style={{ background: t.swatch[0] }} />
                  <span className="w-4 h-4 rounded-full block -ml-2" style={{ background: t.swatch[1] }} />
                  {active && <Check size={14} className="text-brand ml-auto" />}
                </div>
                <div className="text-[12.5px] font-semibold">{t.label}</div>
                <div className="text-[10.5px] text-mute leading-snug mt-0.5">{t.description}</div>
              </button>
            );
          })}
        </div>

        <div className="h-px bg-line my-4" />
        <div className="text-[13px] font-semibold mb-1">Accent color</div>
        <p className="text-xs text-mute mb-3">Override the brand color on top of your theme — pick a preset or go fully custom.</p>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENT_PRESETS.map((hex) => {
            const active = user?.accentColor?.toLowerCase() === hex.toLowerCase();
            return (
              <button
                key={hex}
                onClick={() => applyAccentColor(hex)}
                title={hex}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform ${active ? 'scale-110 ring-2 ring-offset-2 ring-brand' : ''}`}
                style={{ background: hex }}
              >
                {active && <Check size={12} className="text-white" />}
              </button>
            );
          })}
          <label
            className="w-7 h-7 rounded-full border border-dashed border-line flex items-center justify-center cursor-pointer overflow-hidden relative"
            title="Custom color"
            style={user?.accentColor && !ACCENT_PRESETS.some((p) => p.toLowerCase() === user.accentColor?.toLowerCase()) ? { background: user.accentColor, borderStyle: 'solid' } : {}}
          >
            <input
              type="color"
              value={customAccent}
              onChange={(e) => applyAccentColor(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            {!(user?.accentColor && !ACCENT_PRESETS.some((p) => p.toLowerCase() === user.accentColor?.toLowerCase())) && (
              <span className="text-[13px] text-mute leading-none">+</span>
            )}
          </label>
          {user?.accentColor && (
            <button onClick={resetAccent} className="text-xs text-mute hover:text-ink ml-1 underline underline-offset-2">
              Reset to theme default
            </button>
          )}
        </div>
      </div>

      <SectionHeading>Avatar</SectionHeading>
      <div className="card-lift bg-paper border border-line rounded-2xl p-5">
        <div className="flex items-center gap-3.5 mb-4">
          <Avatar emoji={user?.avatarEmoji} color={user?.avatarColor} image={user?.avatarImage} size={52} />
          <div className="flex-1">
            <div className="text-xs text-mute mb-2">This is how you show up around the app.</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="flex items-center gap-1.5 text-xs font-semibold text-brand bg-brand-softer px-3 py-1.5 rounded-lg hover:brightness-95 transition disabled:opacity-60"
              >
                <Upload size={13} /> {uploadingPhoto ? 'Uploading…' : user?.avatarImage ? 'Change photo' : 'Upload photo'}
              </button>
              {user?.avatarImage && (
                <button onClick={removePhoto} className="flex items-center gap-1 text-xs text-mute hover:text-red transition">
                  <X size={13} /> Remove
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handlePhotoSelected(e.target.files?.[0])}
            />
            {photoError && <p className="text-xs text-red mt-1.5">{photoError}</p>}
          </div>
        </div>
        <p className="text-xs text-mute mb-3 -mt-2">Or skip the photo and pick a color + emoji combo instead:</p>
        <div className="text-[11px] uppercase tracking-wide text-mute font-medium mb-2">Color</div>
        <div className="flex gap-2 mb-4">
          {AVATAR_COLOR_OPTIONS.map((c) => {
            const active = (user?.avatarColor || 'brand') === c.id;
            return (
              <button
                key={c.id}
                onClick={() => changeAvatarColor(c.id)}
                title={c.label}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform ${active ? 'scale-110 ring-2 ring-offset-2 ring-brand' : ''}`}
                style={{ background: AVATAR_COLOR_HEX[c.id] }}
              >
                {active && <Check size={13} className="text-white" />}
              </button>
            );
          })}
        </div>
        <div className="text-[11px] uppercase tracking-wide text-mute font-medium mb-2">Emoji</div>
        <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5">
          {AVATAR_EMOJI_OPTIONS.map((e) => {
            const active = (user?.avatarEmoji || '🙂') === e;
            return (
              <button
                key={e}
                onClick={() => changeAvatarEmoji(e)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-[17px] transition-colors ${active ? 'bg-brand-soft' : 'hover:bg-cloud'}`}
              >
                {e}
              </button>
            );
          })}
        </div>
      </div>

      <SectionHeading>Fun & sound</SectionHeading>
      <div className="card-lift bg-paper border border-line rounded-2xl p-5 flex items-center justify-between gap-4">
        <div>
          <div className="text-[13px] font-semibold mb-1">Sound effects</div>
          <p className="text-xs text-mute leading-relaxed">
            A little chime for confirmations, wins, and leveling up. Confetti and achievement toasts stay on either way.
          </p>
        </div>
        <button
          onClick={toggleSound}
          role="switch"
          aria-checked={soundOn}
          className={`shrink-0 w-12 h-7 rounded-full flex items-center px-1 transition-colors ${soundOn ? 'gradient-brand' : 'bg-cloud-dim'}`}
        >
          <span className={`w-5 h-5 rounded-full bg-white shadow-sm flex items-center justify-center transition-transform ${soundOn ? 'translate-x-5' : 'translate-x-0'}`}>
            {soundOn ? <Volume2 size={11} className="text-brand" /> : <VolumeX size={11} className="text-mute" />}
          </span>
        </button>
      </div>

      <div id="security" className="scroll-mt-5">
        <SectionHeading icon={<KeyRound size={15} />}>Security</SectionHeading>
      </div>
      <SecurityPanel user={user} changeEmail={changeEmail} changePassword={changePassword} />

      <SectionHeading>Auto-categorization rules</SectionHeading>
      <CategoryRulesPanel />

      <SectionHeading>Sample data</SectionHeading>
      <div className="card-lift bg-paper border border-line rounded-2xl p-5">
        <p className="text-[13px] text-ink-soft leading-relaxed mb-3">
          {hasData
            ? "Your account already has data, so sample data can't be loaded on top of it. Clear your categories first if you want a fresh demo."
            : "Your account is empty by default. If you'd like to see the app populated with example categories, transactions, and goals, load sample data below."}
        </p>
        <Button onClick={loadDemoData} variant={hasData ? 'default' : 'primary'}>{seeding ? 'Loading…' : 'Load sample data'}</Button>
        {seedMsg && <p className="text-xs text-mute mt-2">{seedMsg}</p>}
      </div>

      <SectionHeading>Account</SectionHeading>
      <div className="card-lift bg-paper border border-line rounded-2xl p-5 flex flex-col gap-3">
        <Button onClick={logout} variant="danger">Sign out</Button>
      </div>

      <SectionHeading>Danger zone</SectionHeading>
      <DangerZonePanel deleteAccount={deleteAccount} userEmail={user?.email} />
    </div>
  );
}

// Surfaces the payee -> category associations the auto-categorizer has learned from this
// user's own history, so the mechanism behind statement-import suggestions and quick-add
// matching isn't a black box. Deleting a rule just forgets that specific association —
// nothing about past transactions changes, only future matching.
function CategoryRulesPanel() {
  const [rules, setRules] = useState<CategoryRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getCategoryRules()
      .then((r) => {
        if (!cancelled) setRules(r.rules);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load rules');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function removeRule(id: string) {
    setRemovingId(id);
    try {
      await api.deleteCategoryRule(id);
      setRules((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that rule');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="card-lift bg-paper border border-line rounded-2xl p-5">
      <div className="flex items-start gap-2.5 mb-4">
        <Sparkles size={16} className="text-brand shrink-0 mt-0.5" />
        <p className="text-[13px] text-ink-soft leading-relaxed">
          Every time you categorize a transaction — by hand, or by confirming a statement import — we remember that
          payee for next time. This runs entirely on our own server against your own data; nothing is sent to a
          third-party classifier. Remove a rule below if it ever gets something wrong.
        </p>
      </div>

      {error && <p className="text-xs text-red mb-3">{error}</p>}

      {rules === null ? (
        <p className="text-xs text-mute">Loading…</p>
      ) : rules.length === 0 ? (
        <EmptyState>No rules learned yet — categorize a few transactions and they'll show up here.</EmptyState>
      ) : (
        <div className="divide-y divide-line">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="text-[13px] font-medium truncate capitalize">{r.payeeKey}</div>
                <div className="text-[11px] text-mute">
                  → {r.categoryName} <span className="text-mute/70">({r.categoryGroup})</span> · matched {r.hits} time{r.hits === 1 ? '' : 's'}
                </div>
              </div>
              <button
                onClick={() => removeRule(r.id)}
                disabled={removingId === r.id}
                className="shrink-0 text-mute hover:text-red hover:bg-red-soft rounded-md p-1.5 transition-colors disabled:opacity-40"
                title="Forget this rule"
                aria-label={`Forget rule for ${r.payeeKey}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Change email and change password, each gated behind the current password so a
// stolen/left-open session can't silently take over the account by rotating both the
// login email and the password out from under the real owner.
function SecurityPanel({
  user,
  changeEmail,
  changePassword,
}: {
  user: ReturnType<typeof useAuth>['user'];
  changeEmail: (newEmail: string, currentPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}) {
  // --- Change email ---
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);

  async function submitEmail(e: FormEvent) {
    e.preventDefault();
    setEmailError(null);
    setEmailSuccess(false);
    setEmailSaving(true);
    try {
      await changeEmail(newEmail.trim(), emailPassword);
      setEmailSuccess(true);
      setNewEmail('');
      setEmailPassword('');
      setTimeout(() => setEmailSuccess(false), 3000);
    } catch (err: any) {
      setEmailError(err.message || 'Could not update email');
    } finally {
      setEmailSaving(false);
    }
  }

  // --- Change password ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match");
      return;
    }
    setPasswordSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: any) {
      setPasswordError(err.message || 'Could not update password');
    } finally {
      setPasswordSaving(false);
    }
  }

  const passwordInputType = showPasswords ? 'text' : 'password';

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submitEmail} className="card-lift bg-paper border border-line rounded-2xl p-5 flex flex-col gap-3.5">
        <div>
          <div className="text-[13px] font-semibold mb-1">Email address</div>
          <p className="text-xs text-mute leading-relaxed">
            Currently <span className="font-num text-ink-soft">{user?.email}</span>. Changing it requires your current password.
          </p>
        </div>
        <Field label="New email">
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className={`${inputClassText} font-num`}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Current password">
          <input
            type="password"
            required
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
            className={inputClassText}
            placeholder="Confirm it's you"
          />
        </Field>
        {emailError && <p className="text-xs text-red">{emailError}</p>}
        {emailSuccess && <p className="text-xs text-emerald-deep">Email updated.</p>}
        <Button type="submit" variant="primary">{emailSaving ? 'Saving…' : 'Update email'}</Button>
      </form>

      <form onSubmit={submitPassword} className="card-lift bg-paper border border-line rounded-2xl p-5 flex flex-col gap-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold mb-1">Password</div>
            <p className="text-xs text-mute leading-relaxed">
              Changing your password signs you out of every other device — this one stays signed in.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPasswords((v) => !v)}
            className="shrink-0 text-mute hover:text-ink transition-colors mt-0.5"
            aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}
            title={showPasswords ? 'Hide passwords' : 'Show passwords'}
          >
            {showPasswords ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <Field label="Current password">
          <input
            type={passwordInputType}
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={`${inputClassText} font-num`}
            autoComplete="current-password"
          />
        </Field>
        <Field label="New password">
          <input
            type={passwordInputType}
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={`${inputClassText} font-num`}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type={passwordInputType}
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={`${inputClassText} font-num`}
            autoComplete="new-password"
          />
        </Field>
        {passwordError && <p className="text-xs text-red">{passwordError}</p>}
        {passwordSuccess && (
          <p className="text-xs text-emerald-deep flex items-center gap-1"><ShieldCheck size={12} /> Password updated.</p>
        )}
        <Button type="submit" variant="primary">{passwordSaving ? 'Saving…' : 'Update password'}</Button>
      </form>
    </div>
  );
}

// Permanent, irreversible account deletion. Two-step confirmation (a checkbox, then the
// current password) so this can't be triggered by a stray click, while still being a
// single self-serve flow rather than requiring the person to email support.
function DangerZonePanel({
  deleteAccount,
  userEmail,
}: {
  deleteAccount: (password: string) => Promise<void>;
  userEmail?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDeleting(true);
    try {
      await deleteAccount(password);
      // On success, deleteAccount() clears the user in AuthContext — the app will
      // unmount this whole tree and drop back to the sign-in screen on its own.
    } catch (err: any) {
      setError(err.message || 'Could not delete account');
      setDeleting(false);
    }
  }

  return (
    <div className="card-lift bg-paper border border-red/30 rounded-2xl p-5">
      <div className="flex items-start gap-2.5 mb-4">
        <AlertTriangle size={16} className="text-red shrink-0 mt-0.5" />
        <div>
          <div className="text-[13px] font-semibold mb-1">Delete account</div>
          <p className="text-xs text-mute leading-relaxed">
            Permanently deletes {userEmail ? <span className="font-num">{userEmail}</span> : 'your account'} and everything in
            it — categories, transactions, goals, accounts, remittances, and any household or connection membership. This
            can't be undone.
          </p>
        </div>
      </div>

      {!confirming ? (
        <Button variant="danger" onClick={() => setConfirming(true)}>Delete my account</Button>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex items-start gap-2.5 text-xs text-ink-soft leading-relaxed cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 accent-red"
            />
            I understand this permanently deletes all of my data and can't be undone.
          </label>
          {acknowledged && (
            <Field label="Current password">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClassText}
                placeholder="Confirm it's you"
                autoFocus
              />
            </Field>
          )}
          {error && <p className="text-xs text-red">{error}</p>}
          <div className="flex items-center gap-2.5">
            <Button type="submit" variant="danger" disabled={!acknowledged || deleting}>
              {deleting ? 'Deleting…' : 'Permanently delete account'}
            </Button>
            <button
              type="button"
              onClick={() => { setConfirming(false); setAcknowledged(false); setPassword(''); setError(null); }}
              className="text-xs text-mute hover:text-ink transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
