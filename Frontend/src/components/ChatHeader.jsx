import { useState } from "react";
import { X, ShieldCheck, ShieldAlert, Shield } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { isVerified } from "../lib/crypto.js";
import SafetyNumberModal from "./SafetyNumberModal";

const ChatHeader = () => {
  const { selectedUser, keyStatus, typingUserId, setSelectedUser } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const [showSafetyModal, setShowSafetyModal] = useState(false);

  const verified = selectedUser ? isVerified(selectedUser._id) : false;
  const isTyping = typingUserId === selectedUser._id;

  return (
    <div className="border-b border-base-300">
      <div className="p-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="avatar">
            <div className="size-10 rounded-full relative">
              <img src={selectedUser.profilePic || "/avatar.png"} alt={selectedUser.fullName} />
            </div>
          </div>

          {/* User info */}
          <div>
            <h3 className="font-medium">{selectedUser.fullName}</h3>
            <p className="text-sm text-base-content/70">
              {isTyping ? (
                <span className="text-primary italic">typing...</span>
              ) : onlineUsers.includes(selectedUser._id) ? (
                "Online"
              ) : (
                "Offline"
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Verify / safety-number button */}
          <button
            title={verified ? "Verified — tap to view security code" : "Verify security code"}
            onClick={() => setShowSafetyModal(true)}
          >
            {keyStatus === "changed" ? (
              <ShieldAlert className="size-5 text-warning" />
            ) : verified ? (
              <ShieldCheck className="size-5 text-success" />
            ) : (
              <Shield className="size-5 text-base-content/50" />
            )}
          </button>

          {/* Close button */}
          <button onClick={() => setSelectedUser(null)}>
            <X />
          </button>
        </div>
      </div>

      {keyStatus === "changed" && (
        <div className="px-2.5 pb-2 text-xs text-warning">
          ⚠️ {selectedUser.fullName}'s security code changed. Tap the shield to re-verify.
        </div>
      )}

      {showSafetyModal && <SafetyNumberModal onClose={() => setShowSafetyModal(false)} />}
    </div>
  );
};
export default ChatHeader;