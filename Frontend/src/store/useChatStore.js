import {create} from "zustand";
import toast from "react-hot-toast"
import {axiosInstance} from "../lib/axios.js"
import { useAuthStore } from "./useAuthStore";
import { Socket } from "socket.io-client";
import { encryptMessage, decryptMessage, loadPrivateKeyBase64, checkKeyStatus, pinPublicKey, setVerified } from "../lib/crypto.js";

// Decrypts message.text in place (message.text is ciphertext JSON coming
// from the server) and returns a NEW message object with plaintext text,
// so React state updates trigger re-renders correctly.
async function decryptOne(message, myUserId) {
    const privateKeyBase64 = loadPrivateKeyBase64(myUserId);
    const plaintext = await decryptMessage(message.text, myUserId, message.senderID, privateKeyBase64);
    return { ...message, text: plaintext };
}

async function decryptAll(messages, myUserId) {
    return Promise.all(messages.map((m) => decryptOne(m, myUserId)));
}

export const useChatStore = create((set,get)=> ({
    messages : [],
    users : [],
    selectedUser : null,
    isUserLoading : false,
    isMessagesLoading : false,
    keyStatus : null,
    typingUserId : null,

    getUsers: async()=> {
        set({isUserLoading : true});
        try {
            const res = await axiosInstance.get("/messages/users");
            set({users : res.data});
        } catch (error) {
            toast.error(error.response.data.message);
        }
        finally {
            set({isUserLoading : false});
        }
    },

    getMessages : async(userId)=> {
        set({isMessagesLoading : true});
        try {
            const res = await axiosInstance.get(`/messages/${userId}`);
            const myUserId = useAuthStore.getState().authUser._id;
            const decrypted = await decryptAll(res.data, myUserId);
            set({messages : decrypted});
            get().markAsRead(userId);
        } catch (error) {
            toast.error(error.response.data.message);
        } finally {
            set({isMessagesLoading : false});
        }
    },

    // Tells the backend "I've now seen every message from this person",
    // stamping readAt server-side and notifying their client via socket so
    // their checkmarks update in near-real-time.
    markAsRead : async(senderId) => {
        try {
            await axiosInstance.put(`/messages/read/${senderId}`);
            set((state) => ({
                messages: state.messages.map((m) =>
                    m.senderID === senderId && !m.readAt
                        ? { ...m, readAt: new Date().toISOString() }
                        : m
                ),
            }));
        } catch (error) {
            console.log("Error marking messages as read: " + error.message);
        }
    },
    sendMessage : async(messageData)=> {
        const {selectedUser,messages} = get();
        const {authUser} = useAuthStore.getState();
        try {
            let payload = messageData;
            if (messageData.text) {
                if (!authUser.publicKey || !selectedUser.publicKey) {
                    toast.error("Encryption keys not ready yet — try again in a moment.");
                    return;
                }
                const encryptedText = await encryptMessage(
                    messageData.text,
                    authUser.publicKey,
                    selectedUser.publicKey
                );
                payload = { ...messageData, text: encryptedText };
            }

            const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`,payload);
            // Show our own message as plaintext immediately instead of
            // re-decrypting the response we just encrypted.
            const optimisticMessage = { ...res.data, text: messageData.text };
            set({messages:[...messages,optimisticMessage]});
        } catch (error) {
            toast.error(error.response.data.message);
        }
    },

    // after
    subscribeToMessages:() => {
        const {selectedUser}= get();
        if(!selectedUser) {
            return;
        }
        const socket = useAuthStore.getState().socket;

        socket.on("newMessage", async (newMessage)=> {
            if(newMessage.senderID != selectedUser._id) return;
            const myUserId = useAuthStore.getState().authUser._id;
            const decrypted = await decryptOne(newMessage, myUserId);
            set({
                messages:[...get().messages,decrypted],
            });
            // Chat is already open on screen, so this new message counts as
            // read the instant it arrives — tell the sender right away.
            get().markAsRead(selectedUser._id);
        });

        // Fires on the SENDER's socket once the other person's client has
        // confirmed they've seen these messages — flips our own checkmarks
        // from "delivered" to "read".
        socket.on("messagesReadAck", ({ messageIds }) => {
            set((state) => ({
                messages: state.messages.map((m) =>
                    messageIds.includes(m._id) ? { ...m, readAt: new Date().toISOString() } : m
                ),
            }));
        });
        socket.on("userTyping", ({ senderId }) => {
            if (senderId !== selectedUser._id) return;
            set({ typingUserId: senderId });
        });

        socket.on("userStoppedTyping", ({ senderId }) => {
            if (senderId !== selectedUser._id) return;
            set({ typingUserId: null });
        });
    },

    unsubscribeToMessages : () => {
        const socket = useAuthStore.getState().socket;
        socket.off("newMessage");
        socket.off("messagesReadAck");
        socket.off("userTyping");
        socket.off("userStoppedTyping");
    },
    
    setSelectedUser : (selectedUser)=> {
        if (selectedUser?.publicKey) {
            const keyStatus = checkKeyStatus(selectedUser._id, selectedUser.publicKey);
            set({ selectedUser, keyStatus, typingUserId: null });
        } else {
            set({ selectedUser, keyStatus: null, typingUserId: null });
        }
    },

// Called after the user has compared safety numbers out-of-band and
// confirms it matches — pins the (possibly new) key and clears the warning.
    confirmKeyVerified : () => {
        const { selectedUser } = get();
        if (!selectedUser) return;
        pinPublicKey(selectedUser._id, selectedUser.publicKey);
        setVerified(selectedUser._id, true);
        set({ keyStatus: "unchanged" });
    },
    sendTyping : () => {
        const { selectedUser } = get();
        const socket = useAuthStore.getState().socket;
        if (!selectedUser || !socket) return;
        socket.emit("typing", { receiverId: selectedUser._id });
    },

    sendStopTyping : () => {
        const { selectedUser } = get();
        const socket = useAuthStore.getState().socket;
        if (!selectedUser || !socket) return;
        socket.emit("stopTyping", { receiverId: selectedUser._id });
    },
}));