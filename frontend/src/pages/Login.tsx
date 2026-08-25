import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

export default function Login() {
  const { user, login, signup } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await signup(email, password);
    } catch (err: any) {
      setError(readableAuthError(err?.code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell" style={{ maxWidth: 400, marginTop: 80 }}>
      <div className="card stack">
        <h1 style={{ fontSize: 24 }}>SlideMatch AI</h1>
        <p className="muted small">Apresentações que seguem o seu template, não um gerador genérico.</p>
        <form className="stack" onSubmit={submit}>
          <label>
            E-mail
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Senha
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="small" style={{ color: "var(--danger)" }}>{error}</p>}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        <button className="link-btn small" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Não tem conta? Criar uma" : "Já tem conta? Entrar"}
        </button>
      </div>
    </div>
  );
}

function readableAuthError(code?: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "E-mail ou senha incorretos.";
    case "auth/email-already-in-use":
      return "Já existe uma conta com esse e-mail.";
    case "auth/weak-password":
      return "Senha muito curta — use pelo menos 6 caracteres.";
    default:
      return "Não foi possível entrar. Tente de novo.";
  }
}
