import { useEffect,useRef } from "react";
import {useChatStore} from "../store/useChatStore.js";
import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./skeletons/MessageSkeleton.jsx";
import { useAuthStore } from "../store/useAuthStore.js";
import { formatMessageTime } from "../lib/utils";
import { Check, CheckCheck } from "lucide-react";

const ChatContainer = () => {
    const {messages,getMessages,isMessagesLoading,selectedUser,subscribeToMessages,unsubscribeToMessages} = useChatStore();
    const {authUser} = useAuthStore();
    const messageEndRef = useRef(null);

    useEffect(()=>{
        getMessages(selectedUser._id);
        subscribeToMessages();
        return () => unsubscribeToMessages();
    },[selectedUser._id,getMessages,subscribeToMessages,unsubscribeToMessages]);

    useEffect(()=>{
        if(messageEndRef.current && messages) {
            messageEndRef.current.scrollIntoView({behavior:"smooth"});
        }
    },[messages])

    if(isMessagesLoading) return (
        <div className="flex-1 flex flex-col overflow-auto">
            <ChatHeader />
            <MessageSkeleton />
            <MessageInput />
        </div>
    )

    return (
        <div className="flex-1 flex flex-col overflow-auto">
            <ChatHeader />
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message) => (
                    
                    <div key = {message._id}
                    
                    className={`chat ${message.senderID === authUser._id? "chat-end" : "chat-start"}`}
                    ref={messageEndRef}
                    >
                                       
                        <div className="chat-image avatar">
                            <div className="size-10 rounded-full border">
                                
                                <img 
                                src={message.senderID === authUser._id 
                                      ? authUser.profilePic || "avatar.png" 
                                      : selectedUser.profilePic || "avatar.png"} 
                                alt="profile pic" 
                                />
                            </div>
                        </div>
                        <div className="chat-header mb-1">
                            <time className="text-xs opacity-50 ml-1">
                                {formatMessageTime(message.createdAt)}
                            </time>
                        </div>
                        <div className="chat-bubble flex-col">
                            {message.image && (
                              <img
                                src={message.image}
                                alt="Attachment"
                                className="sm:max-w-[200px] rounded-md mb-2"
                                />
                            )}
                            {message.text && <p>{message.text}</p>}
                        </div>
                        {message.senderID === authUser._id && (
                            <div className="chat-footer opacity-50 text-xs flex items-center gap-1 mt-1">
                                {message.readAt ? (
                                    <CheckCheck className="size-3.5 text-info" />
                                ) : message.deliveredAt ? (
                                    <CheckCheck className="size-3.5" />
                                ) : (
                                    <Check className="size-3.5" />
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <MessageInput />
        </div>
    )
};

export default ChatContainer;
