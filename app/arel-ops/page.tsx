'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Trash2, Plus, LogOut, Loader2, GripVertical, Lock, Mail, Eye, EyeOff, Package, AlertTriangle, Pencil, X, Check, GraduationCap, Newspaper } from 'lucide-react';
// PAYMENT DISABLED — Receipt icon was used by Enrollments tab
// import { Receipt } from 'lucide-react';
import type { AddictionProgram } from '@/lib/programs';
import { fetchPrograms, createProgram, updateProgram, deleteProgram, UnauthorizedError } from '@/lib/programs';
import type { TrainingProgram, TrainingProgramLevel } from '@/lib/training-programs';
import { fetchTrainingPrograms, createTrainingProgram, updateTrainingProgram, deleteTrainingProgram, UnauthorizedError as TrainingUnauthorizedError } from '@/lib/training-programs';
import { getLogoUrl } from '@/lib/assets';
// PAYMENT DISABLED — uncomment when Razorpay is integrated
// import EnrollmentsTab from '@/components/admin/EnrollmentsTab';
import NewsletterTab from '@/components/admin/newsletter/NewsletterTab';

const LOGO_URL = getLogoUrl();

// ─── Field length limits (must match server-side LIMITS in admin-programs.mjs) ────
const FIELD_LIMITS = {
  title: 200,
  subtitle: 200,
  description: 2000,
  note: 500,
  cost: 100,
  feature_item: 300,
  features_count: 20,
  email: 200,
  password: 128,
};

// ─── JWT expiry helper (client-side only, no verification) ───────────────────
function parseJwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

// ─── Login Form ──────────────────────────────────────────────────────────────

function LoginForm({
  onLogin,
  sessionExpired = false,
}: {
  onLogin: (token: string, email: string) => void;
  sessionExpired?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Live countdown ticker while locked out
  useEffect(() => {
    if (!lockoutUntil) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockoutUntil.getTime() - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) setLockoutUntil(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockoutUntil]);

  const isLocked = countdown > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/.netlify/functions/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429 && data.retryAfter) {
          setLockoutUntil(new Date(Date.now() + data.retryAfter * 1000));
        }
        setError(data.error || 'Login failed');
        return;
      }

      onLogin(data.token, data.email);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#00373E] via-[#004a53] to-[#00373E] px-4">
      {/* Subtle decorative circles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-[#ED7428]/5" />
        <div className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-[#ED7428]/5" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="rounded-3xl bg-white p-8 shadow-2xl sm:p-10">
          {/* Logo + branding */}
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#F7F6F4] shadow-inner">
              <Image
                src={LOGO_URL}
                alt="Hope Trust logo"
                width={56}
                height={56}
                className="object-contain"
              />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#00373E]">Welcome Back</h1>
            <p className="mt-1.5 text-sm text-[#486364]">Sign in to the Hope Trust admin panel</p>
          </div>

          {sessionExpired && (
            <div className="mb-6 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p>Your session has expired. Please sign in again.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[#00373E]">
                Email Address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  required
                  maxLength={FIELD_LIMITS.email}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 py-3 pl-10 pr-4 text-sm text-[#00373E] outline-none transition-all placeholder:text-gray-400 focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[#00373E]">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  maxLength={FIELD_LIMITS.password}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 py-3 pl-10 pr-11 text-sm text-[#00373E] outline-none transition-all placeholder:text-gray-400 focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${isLocked ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'}`}>
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <p>{error}</p>
                  {isLocked && (
                    <p className="mt-1 font-mono font-semibold">
                      {String(Math.floor(countdown / 60)).padStart(2, '0')}:
                      {String(countdown % 60).padStart(2, '0')} remaining
                    </p>
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || isLocked}
              className="w-full rounded-xl bg-[#00373E] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#00373E]/20 transition-all hover:bg-[#024a53] hover:shadow-xl hover:shadow-[#00373E]/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Signing in...
                </span>
              ) : isLocked ? (
                'Account Locked'
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-white/40">
          Hope Trust India &middot; Admin Panel
        </p>
      </div>
    </div>
  );
}

// ─── Add Program Form ────────────────────────────────────────────────────────

function AddProgramForm({
  onAdd,
  onCancel,
}: {
  onAdd: (program: Omit<AddictionProgram, 'id' | 'is_active' | 'created_at' | 'updated_at'>) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [featuresText, setFeaturesText] = useState('');
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const lines = featuresText.split('\n').map((f) => f.trim()).filter(Boolean);
      if (lines.length > FIELD_LIMITS.features_count) {
        setError(`Maximum ${FIELD_LIMITS.features_count} features allowed`);
        return;
      }
      if (lines.some((f) => f.length > FIELD_LIMITS.feature_item)) {
        setError(`Each feature must be ${FIELD_LIMITS.feature_item} characters or fewer`);
        return;
      }
      await onAdd({ title, subtitle, description, features: lines, note, cost, display_order: displayOrder });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add program');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-[#ED7428] to-[#F59E0B] px-6 py-4">
        <h3 className="text-lg font-bold text-white">Add New Program</h3>
        <p className="text-sm text-white/70">Fill in the details below to create a treatment package</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#00373E]">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              required
              maxLength={FIELD_LIMITS.title}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
              placeholder="e.g. 30 Days Recovery Program"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#00373E]">
              Cost <span className="text-red-500">*</span>
            </label>
            <input
              required
              maxLength={FIELD_LIMITS.cost}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
              placeholder="e.g. INR 26,500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#00373E]">Subtitle</label>
            <input
              maxLength={FIELD_LIMITS.subtitle}
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
              placeholder="e.g. Who can benefit?"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#00373E]">Display Order</label>
            <input
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(Number(e.target.value))}
              className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#00373E]">Description</label>
          <textarea
            maxLength={FIELD_LIMITS.description}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
            placeholder="Program description paragraph(s)"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#00373E]">
            Features <span className="text-xs text-gray-500">(one per line)</span>
          </label>
          <textarea
            value={featuresText}
            onChange={(e) => setFeaturesText(e.target.value)}
            rows={5}
            className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
            placeholder={"2 weekly sessions by an addiction counsellor\n2 sessions with family\nEssential Step Work with a primary counsellor"}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#00373E]">Note</label>
          <input
            maxLength={FIELD_LIMITS.note}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
            placeholder="e.g. Any psychometric tests required will be charged extra."
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3 border-t border-gray-100 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ED7428] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#ED7428]/20 transition-all hover:bg-[#d4651f] active:scale-[0.98] disabled:opacity-60 disabled:shadow-none"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {loading ? 'Adding...' : 'Add Program'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-[#00373E] transition-all hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Program Card ────────────────────────────────────────────────────────────

function ProgramCard({
  program,
  token,
  onUpdate,
  onDelete,
  onUnauthorized,
}: {
  program: AddictionProgram;
  token: string;
  onUpdate: (p: AddictionProgram) => void;
  onDelete: (id: string) => Promise<void>;
  onUnauthorized: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Form state for editing
  const [title, setTitle] = useState(program.title);
  const [subtitle, setSubtitle] = useState(program.subtitle);
  const [description, setDescription] = useState(program.description);
  const [featuresText, setFeaturesText] = useState(program.features.join('\n'));
  const [note, setNote] = useState(program.note);
  const [cost, setCost] = useState(program.cost);
  const [displayOrder, setDisplayOrder] = useState(program.display_order);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    const lines = featuresText.split('\n').map(f => f.trim()).filter(Boolean);
    if (lines.length > FIELD_LIMITS.features_count) {
      setError(`Maximum ${FIELD_LIMITS.features_count} features allowed`);
      return;
    }
    if (lines.some(f => f.length > FIELD_LIMITS.feature_item)) {
      setError(`Each feature must be ${FIELD_LIMITS.feature_item} characters or fewer`);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateProgram(token, {
        id: program.id,
        title,
        subtitle,
        description,
        features: lines,
        note,
        cost,
        display_order: displayOrder,
      });
      onUpdate(updated);
      setIsEditing(false);
    } catch (e: unknown) {
      if (e instanceof UnauthorizedError) { onUnauthorized(); return; }
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset to original values
    setTitle(program.title);
    setSubtitle(program.subtitle);
    setDescription(program.description);
    setFeaturesText(program.features.join('\n'));
    setNote(program.note);
    setCost(program.cost);
    setDisplayOrder(program.display_order);
    setError('');
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await onDelete(program.id);
    } catch (e: unknown) {
      if (e instanceof UnauthorizedError) { onUnauthorized(); return; }
      setError(e instanceof Error ? e.message : 'Failed to delete');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (isEditing) {
    return (
      <div className="overflow-hidden rounded-2xl border border-[#ED7428]/30 bg-white shadow-md ring-2 ring-[#ED7428]/10">
        <div className="bg-gradient-to-r from-[#ED7428] to-[#F59E0B] px-5 py-3">
          <h4 className="text-sm font-bold text-white">Edit Program</h4>
        </div>
        <div className="space-y-3 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              maxLength={FIELD_LIMITS.title}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2 text-sm outline-none focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
              placeholder="Title"
            />
            <input
              maxLength={FIELD_LIMITS.cost}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2 text-sm outline-none focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
              placeholder="Cost (e.g. INR 26,500)"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              maxLength={FIELD_LIMITS.subtitle}
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2 text-sm outline-none focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
              placeholder="Subtitle"
            />
            <input
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(Number(e.target.value))}
              className="rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2 text-sm outline-none focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
              placeholder="Display Order"
            />
          </div>
          <textarea
            maxLength={FIELD_LIMITS.description}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2 text-sm outline-none focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
            placeholder="Description"
          />
          <textarea
            value={featuresText}
            onChange={(e) => setFeaturesText(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2 text-sm outline-none focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
            placeholder="Features (one per line)"
          />
          <input
            maxLength={FIELD_LIMITS.note}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2 text-sm outline-none focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
            placeholder="Note"
          />

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              <AlertTriangle className="h-3 w-3" />
              {error}
            </div>
          )}

          <div className="flex gap-2 border-t border-gray-100 pt-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#ED7428] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#ED7428]/20 transition-all hover:bg-[#d4651f] active:scale-[0.98] disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-[#00373E] transition-all hover:bg-gray-50"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:shadow-lg">
      {/* Orange accent top bar */}
      <div className="h-1 w-full bg-gradient-to-r from-[#ED7428] to-[#F59E0B]" />

      <div className="p-5 sm:p-6">
        {/* Header row */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ED7428]/10 text-xs font-bold text-[#ED7428]">
              {program.display_order}
            </div>
            <h4 className="text-base font-bold text-[#00373E] sm:text-lg">{program.title}</h4>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1 rounded-xl bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all hover:bg-[#ED7428]/10 hover:text-[#ED7428]"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              onBlur={() => setConfirmDelete(false)}
              className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all ${
                confirmDelete
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/20 hover:bg-red-700'
                  : 'bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600'
              } disabled:opacity-50`}
            >
              {deleting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              {confirmDelete ? 'Confirm' : 'Delete'}
            </button>
          </div>
        </div>

        {program.subtitle && (
          <p className="mb-2 text-sm font-semibold text-[#00373E]/70">{program.subtitle}</p>
        )}

        {program.description && (
          <p className="mb-3 text-sm leading-relaxed text-gray-500 line-clamp-2">{program.description}</p>
        )}

        {program.features.length > 0 && (
          <ul className="mb-3 space-y-1.5 rounded-xl bg-[#F7F6F4] p-3">
            {program.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#ED7428]" />
                {f}
              </li>
            ))}
          </ul>
        )}

        {program.note && (
          <p className="mb-3 text-xs italic text-gray-400">{program.note}</p>
        )}

        {/* Cost badge */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
          <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Package Cost</span>
          <span className="rounded-lg bg-[#00373E] px-3 py-1 text-sm font-bold text-white">{program.cost}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Add Training Program Form ───────────────────────────────────────────────

function AddTrainingProgramForm({
  onAdd,
  onCancel,
}: {
  onAdd: (program: Omit<TrainingProgram, 'id' | 'is_active' | 'created_at' | 'updated_at'>) => Promise<void>;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState<'internship' | 'traineeship'>('internship');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [levels, setLevels] = useState<TrainingProgramLevel[]>([]);
  const [duration, setDuration] = useState('');
  const [fee, setFee] = useState('');
  const [format, setFormat] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addLevel = () => setLevels([...levels, { label: '', hours: '', price: '' }]);
  const removeLevel = (i: number) => setLevels(levels.filter((_, idx) => idx !== i));
  const updateLevel = (i: number, field: keyof TrainingProgramLevel, value: string) => {
    setLevels(levels.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onAdd({ category, title, description, levels, duration, fee, format, display_order: displayOrder });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add training program');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-[#ED7428] to-[#F59E0B] px-6 py-4">
        <h3 className="text-lg font-bold text-white">Add Training Program</h3>
        <p className="text-sm text-white/70">Create an internship or traineeship card</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#00373E]">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as 'internship' | 'traineeship')}
              className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
            >
              <option value="internship">Internship</option>
              <option value="traineeship">Traineeship</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#00373E]">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
              placeholder="e.g. Addiction Treatment Internship"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#00373E]">Display Order</label>
            <input
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(Number(e.target.value))}
              className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#00373E]">Description</label>
          <textarea
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
            placeholder="Program description"
          />
        </div>

        {category === 'internship' && (
          <div>
            <label className="mb-2 block text-sm font-medium text-[#00373E]">
              Levels <span className="text-xs text-gray-500">(pricing tiers)</span>
            </label>
            {levels.map((level, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <input
                  maxLength={100}
                  value={level.label}
                  onChange={(e) => updateLevel(i, 'label', e.target.value)}
                  className="w-1/4 rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2 text-sm outline-none focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
                  placeholder="Level 1"
                />
                <input
                  maxLength={100}
                  value={level.hours}
                  onChange={(e) => updateLevel(i, 'hours', e.target.value)}
                  className="w-1/3 rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2 text-sm outline-none focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
                  placeholder="10 hours"
                />
                <input
                  maxLength={100}
                  value={level.price}
                  onChange={(e) => updateLevel(i, 'price', e.target.value)}
                  className="w-1/3 rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2 text-sm outline-none focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
                  placeholder="INR 2,500"
                />
                <button type="button" onClick={() => removeLevel(i)} className="rounded-xl px-2 text-red-500 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addLevel}
              className="inline-flex items-center gap-1 rounded-xl border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-[#ED7428] hover:text-[#ED7428]"
            >
              <Plus className="h-3 w-3" /> Add Level
            </button>
          </div>
        )}

        {category === 'traineeship' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#00373E]">Duration</label>
              <input
                maxLength={100}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
                placeholder="e.g. 3 months"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#00373E]">Fee</label>
              <input
                maxLength={100}
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
                placeholder="e.g. INR 17,000"
              />
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-[#00373E]">Format / Availability</label>
          <input
            maxLength={200}
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
            placeholder="e.g. Available online and on site."
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3 border-t border-gray-100 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ED7428] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#ED7428]/20 transition-all hover:bg-[#d4651f] active:scale-[0.98] disabled:opacity-60 disabled:shadow-none"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {loading ? 'Adding...' : 'Add Training Program'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-[#00373E] transition-all hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Training Program Card ───────────────────────────────────────────────────

function TrainingProgramCard({
  program,
  token,
  onUpdate,
  onDelete,
  onUnauthorized,
}: {
  program: TrainingProgram;
  token: string;
  onUpdate: (p: TrainingProgram) => void;
  onDelete: (id: string) => Promise<void>;
  onUnauthorized: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [category, setCategory] = useState(program.category);
  const [title, setTitle] = useState(program.title);
  const [description, setDescription] = useState(program.description);
  const [levels, setLevels] = useState<TrainingProgramLevel[]>(program.levels || []);
  const [duration, setDuration] = useState(program.duration);
  const [fee, setFee] = useState(program.fee);
  const [format, setFormat] = useState(program.format);
  const [displayOrder, setDisplayOrder] = useState(program.display_order);
  const [error, setError] = useState('');

  const addLevel = () => setLevels([...levels, { label: '', hours: '', price: '' }]);
  const removeLevel = (i: number) => setLevels(levels.filter((_, idx) => idx !== i));
  const updateLevel = (i: number, field: keyof TrainingProgramLevel, value: string) => {
    setLevels(levels.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  };

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      const updated = await updateTrainingProgram(token, {
        id: program.id,
        category,
        title,
        description,
        levels,
        duration,
        fee,
        format,
        display_order: displayOrder,
      });
      onUpdate(updated);
      setIsEditing(false);
    } catch (e: unknown) {
      if (e instanceof TrainingUnauthorizedError) { onUnauthorized(); return; }
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setCategory(program.category);
    setTitle(program.title);
    setDescription(program.description);
    setLevels(program.levels || []);
    setDuration(program.duration);
    setFee(program.fee);
    setFormat(program.format);
    setDisplayOrder(program.display_order);
    setError('');
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await onDelete(program.id);
    } catch (e: unknown) {
      if (e instanceof TrainingUnauthorizedError) { onUnauthorized(); return; }
      setError(e instanceof Error ? e.message : 'Failed to delete');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (isEditing) {
    return (
      <div className="overflow-hidden rounded-2xl border border-[#ED7428]/30 bg-white shadow-md ring-2 ring-[#ED7428]/10">
        <div className="bg-gradient-to-r from-[#ED7428] to-[#F59E0B] px-5 py-3">
          <h4 className="text-sm font-bold text-white">Edit Training Program</h4>
        </div>
        <div className="space-y-3 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as 'internship' | 'traineeship')}
              className="rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2 text-sm outline-none focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
            >
              <option value="internship">Internship</option>
              <option value="traineeship">Traineeship</option>
            </select>
            <input
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2 text-sm outline-none focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
              placeholder="Title"
            />
            <input
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(Number(e.target.value))}
              className="rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2 text-sm outline-none focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
              placeholder="Order"
            />
          </div>
          <textarea
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2 text-sm outline-none focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
            placeholder="Description"
          />

          {category === 'internship' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Levels</label>
              {levels.map((level, i) => (
                <div key={i} className="mb-2 flex gap-2">
                  <input maxLength={100} value={level.label} onChange={(e) => updateLevel(i, 'label', e.target.value)} className="w-1/4 rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-1.5 text-sm outline-none focus:border-[#ED7428]" placeholder="Level 1" />
                  <input maxLength={100} value={level.hours} onChange={(e) => updateLevel(i, 'hours', e.target.value)} className="w-1/3 rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-1.5 text-sm outline-none focus:border-[#ED7428]" placeholder="10 hours" />
                  <input maxLength={100} value={level.price} onChange={(e) => updateLevel(i, 'price', e.target.value)} className="w-1/3 rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-1.5 text-sm outline-none focus:border-[#ED7428]" placeholder="INR 2,500" />
                  <button type="button" onClick={() => removeLevel(i)} className="rounded-xl px-2 text-red-500 hover:bg-red-50"><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
              <button type="button" onClick={addLevel} className="inline-flex items-center gap-1 text-xs font-medium text-[#ED7428] hover:underline">
                <Plus className="h-3 w-3" /> Add Level
              </button>
            </div>
          )}

          {category === 'traineeship' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input maxLength={100} value={duration} onChange={(e) => setDuration(e.target.value)} className="rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2 text-sm outline-none focus:border-[#ED7428]" placeholder="Duration" />
              <input maxLength={100} value={fee} onChange={(e) => setFee(e.target.value)} className="rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2 text-sm outline-none focus:border-[#ED7428]" placeholder="Fee" />
            </div>
          )}

          <input
            maxLength={200}
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2 text-sm outline-none focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
            placeholder="Format / Availability note"
          />

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              <AlertTriangle className="h-3 w-3" />
              {error}
            </div>
          )}

          <div className="flex gap-2 border-t border-gray-100 pt-3">
            <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-[#ED7428] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#ED7428]/20 transition-all hover:bg-[#d4651f] active:scale-[0.98] disabled:opacity-60">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={handleCancel} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-[#00373E] transition-all hover:bg-gray-50">
              <X className="h-3 w-3" />
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:shadow-lg">
      <div className="h-1 w-full bg-gradient-to-r from-[#ED7428] to-[#F59E0B]" />
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ED7428]/10 text-xs font-bold text-[#ED7428]">
              {program.display_order}
            </div>
            <div>
              <h4 className="text-base font-bold text-[#00373E] sm:text-lg">{program.title}</h4>
              <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                program.category === 'internship' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
              }`}>
                {program.category}
              </span>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setIsEditing(true)} className="inline-flex items-center gap-1 rounded-xl bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all hover:bg-[#ED7428]/10 hover:text-[#ED7428]">
              <Pencil className="h-3 w-3" />
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              onBlur={() => setConfirmDelete(false)}
              className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all ${
                confirmDelete ? 'bg-red-600 text-white shadow-lg shadow-red-600/20 hover:bg-red-700' : 'bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600'
              } disabled:opacity-50`}
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              {confirmDelete ? 'Confirm' : 'Delete'}
            </button>
          </div>
        </div>

        {program.description && (
          <p className="mb-3 text-sm leading-relaxed text-gray-500 line-clamp-2">{program.description}</p>
        )}

        {program.levels && program.levels.length > 0 && (
          <div className="mb-3 space-y-1.5 rounded-xl bg-[#F7F6F4] p-3">
            {program.levels.map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#ED7428]" />
                <span className="font-semibold">{l.label}</span> — {l.hours} — <span className="font-semibold">{l.price}</span>
              </div>
            ))}
          </div>
        )}

        {(program.duration || program.fee) && (
          <div className="mb-3 space-y-1 rounded-xl bg-[#F7F6F4] p-3">
            {program.duration && <p className="text-xs text-gray-600"><span className="font-semibold">Duration:</span> {program.duration}</p>}
            {program.fee && <p className="text-xs text-gray-600"><span className="font-semibold">Fee:</span> {program.fee}</p>}
            {program.format && <p className="text-xs text-gray-600"><span className="font-semibold">Format:</span> {program.format}</p>}
          </div>
        )}

        {program.format && !program.duration && !program.fee && (
          <p className="mb-3 text-xs italic text-gray-400">{program.format}</p>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

function Dashboard({ token, email, onLogout }: { token: string; email: string; onLogout: () => void }) {
  // PAYMENT DISABLED — restore 'enrollments' to this union when Razorpay is integrated
  const [activeTab, setActiveTab] = useState<'addiction' | 'training' | 'newsletter'>('addiction');
  const [programs, setPrograms] = useState<AddictionProgram[]>([]);
  const [trainingPrograms, setTrainingPrograms] = useState<TrainingProgram[]>([]);
  // PAYMENT DISABLED — uncomment when Razorpay is integrated
  // const [enrollmentCount, setEnrollmentCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [trainingLoading, setTrainingLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddTrainingForm, setShowAddTrainingForm] = useState(false);
  const [error, setError] = useState('');

  const loadPrograms = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchPrograms();
      setPrograms(data);
    } catch {
      setError('Failed to load programs');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTrainingPrograms = useCallback(async () => {
    setTrainingLoading(true);
    setError('');
    try {
      const data = await fetchTrainingPrograms();
      setTrainingPrograms(data);
    } catch {
      setError('Failed to load training programs');
    } finally {
      setTrainingLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrograms();
    loadTrainingPrograms();
  }, [loadPrograms, loadTrainingPrograms]);

  const handleAdd = async (
    program: Omit<AddictionProgram, 'id' | 'is_active' | 'created_at' | 'updated_at'>
  ) => {
    try {
      await createProgram(token, program);
      setShowAddForm(false);
      await loadPrograms();
    } catch (e) {
      if (e instanceof UnauthorizedError) { onLogout(); return; }
      throw e;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProgram(token, id);
      setPrograms((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      if (e instanceof UnauthorizedError) { onLogout(); return; }
      setError('Failed to delete program');
      throw e;
    }
  };

  const handleAddTraining = async (
    program: Omit<TrainingProgram, 'id' | 'is_active' | 'created_at' | 'updated_at'>
  ) => {
    try {
      await createTrainingProgram(token, program);
      setShowAddTrainingForm(false);
      await loadTrainingPrograms();
    } catch (e) {
      if (e instanceof TrainingUnauthorizedError) { onLogout(); return; }
      throw e;
    }
  };

  const handleDeleteTraining = async (id: string) => {
    try {
      await deleteTrainingProgram(token, id);
      setTrainingPrograms((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      if (e instanceof TrainingUnauthorizedError) { onLogout(); return; }
      setError('Failed to delete training program');
      throw e;
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6F4]">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-[#00373E]/10 bg-[#00373E] shadow-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 sm:h-10 sm:w-10">
              <Image src={LOGO_URL} alt="Hope Trust" width={28} height={28} className="object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-white sm:text-base">Hope Trust Admin</h1>
              <p className="truncate text-[10px] text-white/50 sm:text-[11px]">{email}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-xs font-medium text-white/80 transition-all hover:bg-white/10 hover:text-white sm:px-4 sm:text-sm"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        {/* Tabs — horizontally scrollable on mobile, fully visible from sm: */}
        <div className="mb-6 sm:mb-8 -mx-1 flex gap-1.5 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm sm:gap-2 sm:overflow-visible">
          <button
            onClick={() => setActiveTab('addiction')}
            className={`inline-flex flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-semibold transition-all sm:flex-1 sm:gap-2 sm:px-4 sm:py-3 sm:text-sm ${
              activeTab === 'addiction'
                ? 'bg-[#00373E] text-white shadow-lg'
                : 'text-gray-500 hover:bg-gray-100 hover:text-[#00373E]'
            }`}
          >
            <Package className="h-4 w-4" />
            <span className="sm:hidden">Addiction ({programs.length})</span>
            <span className="hidden sm:inline">Addiction Programs ({programs.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('training')}
            className={`inline-flex flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-semibold transition-all sm:flex-1 sm:gap-2 sm:px-4 sm:py-3 sm:text-sm ${
              activeTab === 'training'
                ? 'bg-[#00373E] text-white shadow-lg'
                : 'text-gray-500 hover:bg-gray-100 hover:text-[#00373E]'
            }`}
          >
            <GraduationCap className="h-4 w-4" />
            <span className="sm:hidden">Training ({trainingPrograms.length})</span>
            <span className="hidden sm:inline">Training Programs ({trainingPrograms.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('newsletter')}
            className={`inline-flex flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-semibold transition-all sm:flex-1 sm:gap-2 sm:px-4 sm:py-3 sm:text-sm ${
              activeTab === 'newsletter'
                ? 'bg-[#00373E] text-white shadow-lg'
                : 'text-gray-500 hover:bg-gray-100 hover:text-[#00373E]'
            }`}
          >
            <Newspaper className="h-4 w-4" />
            Newsletter
          </button>
          {/* PAYMENT DISABLED — uncomment when Razorpay is integrated
          <button
            onClick={() => setActiveTab('enrollments')}
            className={`inline-flex flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-semibold transition-all sm:flex-1 sm:gap-2 sm:px-4 sm:py-3 sm:text-sm ${
              activeTab === 'enrollments'
                ? 'bg-[#00373E] text-white shadow-lg'
                : 'text-gray-500 hover:bg-gray-100 hover:text-[#00373E]'
            }`}
          >
            <Receipt className="h-4 w-4" />
            Enrollments{enrollmentCount !== null ? ` (${enrollmentCount})` : ''}
          </button>
          */}
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ── Addiction Programs Tab ── */}
        {activeTab === 'addiction' && (
          <>
            <div className="mb-6 flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#00373E] to-[#024a53] p-4 shadow-sm sm:mb-8 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-white sm:text-lg">Addiction Programs</h2>
                <p className="text-xs text-white/60 sm:text-sm">Manage treatment packages shown on the Addiction Services page</p>
              </div>
              {!showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-xl bg-[#ED7428] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#ED7428]/20 transition-all hover:bg-[#d4651f] hover:shadow-xl active:scale-[0.98] sm:px-5"
                >
                  <Plus className="h-4 w-4" />
                  Add Program
                </button>
              )}
            </div>

            {showAddForm && (
              <div className="mb-8">
                <AddProgramForm onAdd={handleAdd} onCancel={() => setShowAddForm(false)} />
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <Loader2 className="h-6 w-6 animate-spin text-[#ED7428]" />
                </div>
                <p className="mt-3 text-sm text-gray-400">Loading programs...</p>
              </div>
            ) : programs.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white py-16 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F7F6F4]">
                  <Package className="h-6 w-6 text-gray-400" />
                </div>
                <p className="text-lg font-semibold text-[#00373E]">No programs yet</p>
                <p className="mt-1 text-sm text-gray-400">Click &quot;Add Program&quot; to create your first treatment package</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {programs.map((program) => (
                  <ProgramCard
                    key={program.id}
                    program={program}
                    token={token}
                    onUpdate={(updated) => {
                      setPrograms((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
                    }}
                    onDelete={handleDelete}
                    onUnauthorized={onLogout}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Training Programs Tab ── */}
        {activeTab === 'training' && (
          <>
            <div className="mb-6 flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#00373E] to-[#024a53] p-4 shadow-sm sm:mb-8 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-white sm:text-lg">Training Programs</h2>
                <p className="text-xs text-white/60 sm:text-sm">Manage internship &amp; traineeship cards on the Training page</p>
              </div>
              {!showAddTrainingForm && (
                <button
                  onClick={() => setShowAddTrainingForm(true)}
                  className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-xl bg-[#ED7428] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#ED7428]/20 transition-all hover:bg-[#d4651f] hover:shadow-xl active:scale-[0.98] sm:px-5"
                >
                  <Plus className="h-4 w-4" />
                  Add Training
                </button>
              )}
            </div>

            {showAddTrainingForm && (
              <div className="mb-8">
                <AddTrainingProgramForm onAdd={handleAddTraining} onCancel={() => setShowAddTrainingForm(false)} />
              </div>
            )}

            {trainingLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <Loader2 className="h-6 w-6 animate-spin text-[#ED7428]" />
                </div>
                <p className="mt-3 text-sm text-gray-400">Loading training programs...</p>
              </div>
            ) : trainingPrograms.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white py-16 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F7F6F4]">
                  <GraduationCap className="h-6 w-6 text-gray-400" />
                </div>
                <p className="text-lg font-semibold text-[#00373E]">No training programs yet</p>
                <p className="mt-1 text-sm text-gray-400">Click &quot;Add Training Program&quot; to create your first one</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {trainingPrograms.map((tp) => (
                  <TrainingProgramCard
                    key={tp.id}
                    program={tp}
                    token={token}
                    onUpdate={(updated) => {
                      setTrainingPrograms((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
                    }}
                    onDelete={handleDeleteTraining}
                    onUnauthorized={onLogout}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Newsletter Tab ── */}
        {activeTab === 'newsletter' && <NewsletterTab token={token} onUnauthorized={onLogout} />}

        {/* PAYMENT DISABLED — uncomment when Razorpay is integrated
        {activeTab === 'enrollments' && (
          <EnrollmentsTab
            token={token}
            onUnauthorized={onLogout}
            onCountChange={setEnrollmentCount}
          />
        )}
        */}
      </main>

      <footer className="mt-auto border-t border-gray-200 bg-white/50 py-4 text-center text-xs text-gray-400">
        Hope Trust India &middot; Admin Dashboard
      </footer>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);

  // Restore session from sessionStorage on mount — verify token is not expired
  useEffect(() => {
    const saved = sessionStorage.getItem('admin_token');
    const savedEmail = sessionStorage.getItem('admin_email');
    if (!saved || !savedEmail) return;

    const exp = parseJwtExpiry(saved);
    if (!exp || exp * 1000 <= Date.now()) {
      sessionStorage.removeItem('admin_token');
      sessionStorage.removeItem('admin_email');
      setSessionExpired(true);
      return;
    }

    setToken(saved);
    setEmail(savedEmail);
  }, []);

  const handleLogin = (newToken: string, userEmail: string) => {
    setToken(newToken);
    setEmail(userEmail);
    sessionStorage.setItem('admin_token', newToken);
    sessionStorage.setItem('admin_email', userEmail);
  };

  const handleLogout = () => {
    setToken(null);
    setEmail('');
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_email');
  };

  if (!token) {
    return <LoginForm onLogin={handleLogin} sessionExpired={sessionExpired} />;
  }

  return <Dashboard token={token} email={email} onLogout={handleLogout} />;
}
