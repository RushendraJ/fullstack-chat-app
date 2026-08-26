import {create} from "zustand"
import { axiosInstance } from "../lib/axios.js"
import toast from "react-hot-toast";
import {io} from "socket.io-client"
import {
    generateRsaKeyPair,
    exportPublicKey,
    exportPrivateKey,
    savePrivateKey,
    hasPrivateKey,
    encryptPrivateKeyBackup,
    decryptPrivateKeyBackup,
} from "../lib/crypto.js"

const BASE_URL = import.meta.env.MODE === "development" ? "http://localhost:5001":"/api";

export const useAuthStore = create((set,get)=>({
    authUser : null,
    isSigningUp : false,
    isLoggingIn : false,
    isUpdatingProfile : false,
    onlineUsers : [],
    socket : null,

    // True when the logged-in user has no private key on THIS device (e.g.
    // session restored from a cookie in a new browser) and we don't have
    // their password in memory to auto-decrypt the backup. The UI should
    // show a "restore your chats" prompt for the password when this is true.
    needsKeyRestore : false,

    isCheckingAuth : true,
    checkAuth : async()=>{
        try {
            const res = await axiosInstance.get("/auth/check");
            set({authUser:res.data});
            set({ needsKeyRestore: !hasPrivateKey(res.data._id) });
            get().connectSocket();
        }catch(error) {
            set({authUser:null});
            console.log("Error in checkAuth"+error);
        } finally {
            set({isCheckingAuth : false});
        }
    },

    // Makes sure THIS browser has a private key for the logged-in user,
    // using a password we have available right now (signup/login forms).
    // - If a local key already exists (e.g. same browser as signup), nothing
    //   to do.
    // - Otherwise, tries to restore the private key from the server's
    //   password-encrypted backup.
    // - If no backup exists yet (legacy account, or backup never uploaded),
    //   generates a fresh keypair, uploads the new public key, AND uploads a
    //   fresh backup (encrypted with this password) so future devices can
    //   restore from it. Note: a fresh keypair means messages encrypted
    //   under the OLD keypair can't be decrypted on this device.
    restoreOrSyncKeys: async (user, password) => {
        if (!user?._id) return;
        if (hasPrivateKey(user._id)) {
            set({ needsKeyRestore: false });
            return;
        }
        try {
            if (user.encryptedPrivateKeyBackup) {
                const privateKeyBase64 = await decryptPrivateKeyBackup(
                    user.encryptedPrivateKeyBackup,
                    password
                );
                savePrivateKey(user._id, privateKeyBase64);
                set({ needsKeyRestore: false });
                toast.success("Chat history restored on this device");
            } else {
                const { publicKey, privateKey } = await generateRsaKeyPair();
                const publicKeyBase64 = await exportPublicKey(publicKey);
                const privateKeyBase64 = await exportPrivateKey(privateKey);
                const encryptedPrivateKeyBackup = await encryptPrivateKeyBackup(
                    privateKeyBase64,
                    password
                );
                savePrivateKey(user._id, privateKeyBase64);
                const res = await axiosInstance.put("/auth/update-public-key", {
                    publicKey: publicKeyBase64,
                    encryptedPrivateKeyBackup,
                });
                set({ authUser: res.data, needsKeyRestore: false });
                toast("New encryption key created for this device — older messages can't be decrypted here.", { icon: "⚠️" });
            }
        } catch (error) {
            console.log("Error restoring/syncing encryption keys: " + error);
            toast.error("Couldn't unlock your chat history — the password may be incorrect.");
        }
    },

    // Used when a session was restored silently (page reload / cookie) and
    // we don't have the password in memory. Fetches the backup blob fresh
    // and lets the caller (a modal) supply the password to decrypt it.
    // Returns true on success, false on failure (e.g. wrong password).
    restoreKeyWithPassword: async (password) => {
        const { authUser } = get();
        if (!authUser?._id) return false;
        try {
            const res = await axiosInstance.get("/auth/backup-key");
            const { encryptedPrivateKeyBackup } = res.data;
            if (!encryptedPrivateKeyBackup) {
                toast.error("No backup found for this account yet. Try logging out and back in.");
                return false;
            }
            const privateKeyBase64 = await decryptPrivateKeyBackup(encryptedPrivateKeyBackup, password);
            savePrivateKey(authUser._id, privateKeyBase64);
            set({ needsKeyRestore: false });
            toast.success("Chat history restored");
            return true;
        } catch (error) {
            console.log("Error restoring key with password: " + error);
            toast.error("Incorrect password");
            return false;
        }
    },

    // Lets the user dismiss the restore prompt and start fresh on this
    // device (a new keypair gets generated the next time they log in with
    // their password, or they can retry the restore prompt later).
    dismissKeyRestore: () => set({ needsKeyRestore: false }),

    signup : async(data)=>{
        set({isSigningUp : true});
        try {
            // Generate the E2EE keypair BEFORE signing up so the public key
            // can be included in the signup payload. The private key is only
            // saved locally once we know the real user _id from the response.
            const { publicKey, privateKey } = await generateRsaKeyPair();
            const publicKeyBase64 = await exportPublicKey(publicKey);
            const privateKeyBase64 = await exportPrivateKey(privateKey);
            const encryptedPrivateKeyBackup = await encryptPrivateKeyBackup(privateKeyBase64, data.password);

            const res = await axiosInstance.post("/auth/signup",{
                ...data,
                publicKey: publicKeyBase64,
                encryptedPrivateKeyBackup,
            });
            savePrivateKey(res.data._id, privateKeyBase64);

            set({authUser : res.data, needsKeyRestore: false});
            toast.success("Account Created Successfully");
            get().connectSocket();
        } catch (error) {
            toast.error(error.response.data.message);
        }
        finally {
            set({isSigningUp : false});
        }
    },

    login : async(data)=> {
        set({isLoggingIn : true});
        try {
            const res = await axiosInstance.post("/auth/login",data);
            set({authUser : res.data});
            await get().restoreOrSyncKeys(res.data, data.password);
            toast.success("Logged in Successfully");
            get().connectSocket();
        } catch (error) {
            toast.error(error.response.data.message);
        }
        finally {
            set({isLoggingIn : false});
        }
    },

    logout : async()=> {
        try {
            axiosInstance.post("/auth/logout");
            set({authUser : null, needsKeyRestore: false});
            toast.success("Logged out successfully");
            get.disconnectSocket();
        } catch (error) {
            toast.error(error.respose.data.message);
        }
    },

    updateProfile: async(data)=> {
        set({isUpdatingProfile : true});
        try {
            const res = await axiosInstance.put("/auth/update-profile",data);
            set({authUser : res.data});
            toast.success("Profile Updated Successfully")
        } catch (error) {
            console.log("error in update profile:",error);
            toast.error(error.respose.data.message);
        } finally {
            set({isUpdatingProfile : false});
        }
    },

    connectSocket: ()=>{
        const {authUser} = get();
        if(!authUser || get().socket?.connected) return;
        const socket = io(BASE_URL,{
            query: {
                userId : authUser._id,
            },
        });;
        socket.connect();
        set({socket:socket});

        socket.on("getOnlineUsers", (userIds) => {
            set({onlineUsers : userIds});
        });
    },
    disconnectSocket:()=>{
        if(get().socket?.connected) get().socket.disconnect();
    },
}));