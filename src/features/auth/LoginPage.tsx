import { useState, type FormEvent } from 'react';
import { Mail, Lock, ArrowRight, Loader2, ShieldCheck, Sparkles, Send, Users } from 'lucide-react';
import { authApi, type AuthUser } from '../../services/authApi';

interface LoginModalProps {
  onSuccess: (user: AuthUser, token: string) => void;
}

export function LoginPage({ onSuccess }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both your email and password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      localStorage.setItem('mailbox_auth_token', res.token);
      localStorage.setItem('mailbox_auth_user', JSON.stringify(res.user));
      onSuccess(res.user, res.token);
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="apple-login-viewport">
      {/* 48px Apple Header for login */}
      <header className="apple-login-nav">
        <div className="apple-login-nav-inner">
          <div className="apple-login-nav-brand">
            <div className="apple-login-nav-logo">
              <Mail size={15} />
            </div>
            <span className="apple-login-nav-wordmark">Mailbox</span>
          </div>
          <div className="apple-login-nav-cluster">
            <span className="apple-login-nav-status">Private Workspace Portal</span>
          </div>
        </div>
      </header>

      {/* Split Hero: Dark Stage Tile on Left, Pure White Utility Tile on Right */}
      <main className="apple-login-stage">
        <div className="apple-login-grid">
          {/* Near-Black Tile 1 (#272729) Stage */}
          <div className="apple-login-hero-tile">
            <div className="hero-tile-top">
              <span className="hero-apple-eyebrow">Outreach Architecture</span>
              <h1 className="hero-apple-headline">
                High-converting lead outreach. Grounded in clarity.
              </h1>
              <p className="hero-apple-description">
                Direct Meta Lead Ads sync to ZeptoMail outreach with instant welcome triggers, audience filtering, and zero friction.
              </p>
            </div>

            <div className="hero-tile-features">
              <div className="hero-tile-pill-row">
                <div className="hero-feature-item">
                  <div className="hero-feature-icon">
                    <Users size={16} />
                  </div>
                  <div>
                    <b>Meta Lead Sync</b>
                    <span>Automatic continuous ingestion</span>
                  </div>
                </div>

                <div className="hero-feature-item">
                  <div className="hero-feature-icon">
                    <Send size={16} />
                  </div>
                  <div>
                    <b>ZeptoMail Outreach</b>
                    <span>High deliverability transactional pipe</span>
                  </div>
                </div>

                <div className="hero-feature-item">
                  <div className="hero-feature-icon">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <b>Instant Welcome</b>
                    <span>First-touch automated sequences</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="hero-tile-footer">
              <span>Apple Design System Standard · 2026 Release</span>
            </div>
          </div>

          {/* Pure White Utility Tile (#ffffff on #f5f5f7 canvas) */}
          <div className="apple-login-form-tile">
            <div className="login-form-header">
              <div className="login-badge-mark">
                <ShieldCheck size={22} />
              </div>
              <h2 className="login-tile-title">Sign in to Mailbox</h2>
              <p className="login-tile-subtitle">
                Enter your administrative credentials to open your command workspace.
              </p>
            </div>

            {error && (
              <div className="apple-banner apple-banner-error" role="alert">
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="apple-login-form">
              <div className="apple-field-group">
                <label className="apple-label" htmlFor="login-email">
                  Email Address
                </label>
                <div className="apple-input-wrapper">
                  <Mail size={16} className="apple-input-icon" />
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    required
                    autoComplete="email"
                    className="apple-input"
                  />
                </div>
              </div>

              <div className="apple-field-group">
                <label className="apple-label" htmlFor="login-password">
                  Password
                </label>
                <div className="apple-input-wrapper">
                  <Lock size={16} className="apple-input-icon" />
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    autoComplete="current-password"
                    className="apple-input"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="button-primary login-submit-btn"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    <span>Signing in…</span>
                  </>
                ) : (
                  <>
                    <span>Continue to Workspace</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <div className="login-footer-security">
              <p>Metabull Media Private Workspace · Secured Session</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
