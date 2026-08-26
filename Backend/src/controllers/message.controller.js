import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId,io } from "../lib/socket.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";

export const getUsersForSidebar = async (req,res)=> {
    try {
        const loggedInUserId = req.user._id;
        const filteredUsers = await User.find({_id : {$ne:loggedInUserId}}).select("-password");
        res.status(200).json(filteredUsers);
    } catch(error) {
        console.log("Error in message controller"+error.message);
        res.send(500).json({message:"Internal Server Error"});
    }
}

export const getMessages = async (req,res)=> {
    try {
        const {id:userToChatId} = req.params;
        const myId = req.user._id;

        const messages = await Message.find({
            $or:[
                {senderID:myId,receiverID:userToChatId},
                {senderID:userToChatId,receiverID:myId}
            ]
        });
        res.status(200).json(messages);
    } catch(error) {
        console.log("Error in getMessages controller "+ error.message);
        res.status(500).json("Internal Server error");
    }
}

export const sendMessage = async (req,res)=> {
    try {
        const {text, image} = req.body;
        const {id:receiverID} = req.params;
        const senderID = req.user._id;
        let imageUrl;
        if(image) {
            // uplaod base64 image to cloudinary
            const uploadResponse = await cloudinary.uploader.upload(image);
            imageUrl = uploadResponse.secure_url;
        }

        const newMessage = new Message({
            senderID,
            receiverID,
            text,
            image:imageUrl
        });

        const receiverSocketId = getReceiverSocketId(receiverID);
        // If the receiver is online right now, the socket emit below reaches
        // them immediately — good enough approximation of "delivered".
        if (receiverSocketId) {
            newMessage.deliveredAt = new Date();
        }

        await newMessage.save();

        if(receiverSocketId) {
            io.to(receiverSocketId).emit("newMessage",newMessage);
        }

        res.status(201).json(newMessage);
    } catch(error) {
        console.log("Error in sendMessage controller "+ error.message);
        res.status(500).json("Internal Server error");
    }
}

// Called by the receiver's client once it has the sender's messages open
// and rendered on screen. Stamps readAt on every unread message in that
// conversation and tells the sender's socket to update their checkmarks.
export const markMessagesAsRead = async (req, res) => {
    try {
        const { id: senderID } = req.params; // the OTHER person, whose messages we're reading
        const myId = req.user._id;

        const unread = await Message.find({
            senderID,
            receiverID: myId,
            readAt: null,
        }).select("_id");

        const messageIds = unread.map((m) => m._id);
        if (messageIds.length === 0) {
            return res.status(200).json({ messageIds: [] });
        }

        await Message.updateMany(
            { _id: { $in: messageIds } },
            { $set: { readAt: new Date() } }
        );

        const senderSocketId = getReceiverSocketId(senderID);
        if (senderSocketId) {
            io.to(senderSocketId).emit("messagesReadAck", { messageIds });
        }

        res.status(200).json({ messageIds });
    } catch (error) {
        console.log("Error in markMessagesAsRead controller " + error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
}