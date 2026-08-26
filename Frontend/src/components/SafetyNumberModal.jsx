import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, X } from "lucide-react";
import { computeSafetyNumber, isVerified } from "../lib/crypto.js";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";

// Shown when the user taps the shield icon in ChatHeader. Displays a
// deterministic fingerprint of both users' public keys so they can compare
// it out-of-band (in person, on a call, another app) and confirm no one is
// sitting in the middle of their "encrypted" chat.
const SafetyNumberModal = ({ onClose }) => {
  const { authUser } = useAuthStore();
  const { selectedUser, keyStatus, confirmKeyVerified } = useChatStore();
  const [safetyNumber, setSafetyNumber] = useState(null);
  const [verified, setVerifiedLocal] = useState(false);

  useEffect(() => {
    if (!authUser?.publicKey || !selectedUser?.publicKey) return;
    computeSafetyNumber(authUser.publicKey, selectedUser.publicKey).then(setSafetyNumber);
    setVerifiedLocal(isVerified(selectedUser._id));
  }, [authUser?.publicKey, selectedUser?._id, selectedUser?.publicKey]);

  const handleConfirm = () => {
    confirmKeyVerified();
    setVerifiedLocal(true);
  };

  const groups = safetyNumber ? safetyNumber.split(" ") : [];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-base-100 rounded-2xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            {verified ? (
              <ShieldCheck className="size-5 text-success" />
            ) : (
              <ShieldAlert className="size-5 text-warning" />
            )}
            Verify security code
          </h3>
          <button onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>

        {keyStatus === "changed" && (
          <div className="text-sm bg-warning/10 text-warning-content border border-warning/30 rounded-lg p-3">
            {selectedUser.fullName}'s security code changed since you last verified it.
            This can happen if they reinstalled the app — but it can also mean
            someone is intercepting your messages. Re-verify before you trust
            new messages.
          </div>
        )}

        <p className="text-sm text-base-content/70">
          Compare this number with {selectedUser?.fullName} in person, on a call,
          or through another trusted channel. If it matches on both devices,
          your conversation is confirmed end-to-end secure.
        </p>

        <div className="grid grid-cols-3 gap-2 font-mono text-sm bg-base-200 rounded-lg p-4">
          {groups.length ? (
            groups.map((g, i) => (
              <span key={i} className="text-center">
                {g}
              </span>
            ))
          ) : (
            <span className="col-span-3 text-center text-base-content/50">
              Waiting for keys…
            </span>
          )}
        </div>

        <button
          className="btn btn-primary w-full"
          disabled={!safetyNumber}
          onClick={handleConfirm}
        >
          {verified ? "Verified ✓" : "It matches — mark as verified"}
        </button>
      </div>
    </div>
  );
};

export default SafetyNumberModal;