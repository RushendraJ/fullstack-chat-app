import {create} from "zustand"
import { axiosInstance } from "../lib/axios.js"
import toast from "react-hot-toast";
import {io} from "socket.io-client"
import { ensureKeyPair, generateRsaKeyPair, exportPublicKey, exportPrivateKey, savePrivateKey } from "../lib/crypto.js"

const BASE_URL = import.meta.env.MODE === "development" ? "http://localhost:5001":"/api";

export const useAuthStore = create((set,get)=>({
    authUser : null,
    isSigningUp : false,
    isLoggingIn : false,
    isUpdatingProfile : false,
    onlineUsers : [],
    socket : null,


    isCheckingAuth : true,
    checkAuth : async()=>{
        try {
            const res = await axiosInstance.get("/auth/check");
            set({authUser:res.data});
            await get().syncEncryptionKeys(res.data);
            get().connectSocket();
        }catch(error) {
            set({authUser:null});
            console.log("Error in checkAuth"+error);
        } finally {
            set({isCheckingAuth : false});
        }
    },

    // Makes sure THIS browser has a private key for the logged-in user.
    // - If it already does (e.g. same browser as signup), nothing to do.
    // - If not (new device, or cleared storage), generates a fresh keypair
    //   and pushes the new public key to the server. Note: this means
    //   messages encrypted under the user's old keypair can no longer be
    //   decrypted on this device — a known tradeoff without a key-backup flow.
    syncEncryptionKeys: async (user) => {
        if (!user?._id) return;
        try {
            const { isNew, publicKeyBase64 } = await ensureKeyPair(user._id);
            if (isNew) {
                const res = await axiosInstance.put("/auth/update-public-key", {
                    publicKey: publicKeyBase64,
                });
                set({ authUser: res.data });
            }
        } catch (error) {
            console.log("Error syncing encryption keys: " + error);
        }
    },

    signup : async(data)=>{
        set({isSigningUp : true});
        try {
            // Generate the E2EE keypair BEFORE signing up so the public key
            // can be included in the signup payload. The private key is only
            // saved locally once we know the real user _id from the response.
            const { publicKey, privateKey } = await generateRsaKeyPair();
            const publicKeyBase64 = await exportPublicKey(publicKey);
            const privateKeyBase64 = await exportPrivateKey(privateKey);

            const res = await axiosInstance.post("/auth/signup",{...data, publicKey: publicKeyBase64});
            savePrivateKey(res.data._id, privateKeyBase64);

            set({authUser : res.data});
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
            await get().syncEncryptionKeys(res.data);
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
            set({authUser : null});
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