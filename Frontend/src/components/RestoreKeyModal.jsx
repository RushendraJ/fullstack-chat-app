import { useState } from "react";
import { KeyRound, Eye, EyeOff, Loader2, X } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";

// Shown whenever the logged-in user has no private key on this browser
// (e.g. they opened the app in a new browser, or a session cookie carried
// over without localStorage). Without the private key their message
// history is undecryptable, so we prompt for their account password to
// unlock the server-side encrypted backup — decryption happens entirely
// client-side, the password itself is never sent anywhere.
const RestoreKeyModal = () => {
  const { needsKeyRestore, dismissKeyRestore, restoreKeyWithPassword } = useAuthStore();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  if (!needsKeyRestore) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setIsRestoring(true);
    const ok = await restoreKeyWithPassword(password);
    setIsRestoring(false);
    if (ok) setPassword("");
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-base-100 rounded-2xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            Restore your chat history
          </h3>
          <button onClick={dismissKeyRestore} aria-label="Dismiss">
            <X className="size-5" />
          </button>
        </div>

        <p className="text-sm text-base-content/70">
          This browser doesn't have your encryption key yet, so your past
          messages can't be shown here. Enter your account password to
          unlock your backup — it's decrypted on this device only and never
          leaves your browser.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              className="input input-bordered w-full pr-10"
              placeholder="Your account password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="size-5 text-base-content/40" />
              ) : (
                <Eye className="size-5 text-base-content/40" />
              )}
            </button>
          </div>

          <button type="submit" className="btn btn-primary w-full" disabled={!password || isRestoring}>
            {isRestoring ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                Unlocking…
              </>
            ) : (
              "Unlock chat history"
            )}
          </button>
        </form>

        <button className="text-sm text-base-content/60 underline w-full text-center" onClick={dismissKeyRestore}>
          Skip for now — start fresh on this device
        </button>
      </div>
    </div>
  );
};

export default RestoreKeyModal;