import cloudinary from "../lib/cloudinary.js";
import { generateToken } from "../lib/utils.js";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";

export const signup = async (req,res)=> {
    const {fullName,email,password,publicKey} = req.body;
    try {
        // hash password
        if(!fullName || !password || !email) {
            return res.status(400).json({message:"All fields are required"})
        }
        if(password.length < 6) {
            return res.status(400).json({message:"Password must be atleast 6 characters"});
        }
        const user = await User.findOne({email});
        if(user) return res.status(400).json({message:"Email already exists"});
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password,salt);
        const newUser = new User({
            fullName,
            email,
            password : hashedPassword,
            publicKey : publicKey || ""
        });
        if(newUser) {
            // generate JWT token
            generateToken(newUser._id,res);
            await newUser.save();

            res.status(201).json({
                _id : newUser._id,
                fullName : newUser.fullName,
                email : newUser.email,
                profilePic : newUser.profilePic,
                publicKey : newUser.publicKey
            });
        }
        else {
            res.status(400).json({message:"Invalid User data"});
        }
    } catch (error) {
        console.log("Error in signUp controller : "+error.message);
        res.status(500).json({message : "Internal Server Error."});
    }
}

export const login = async (req,res)=> {
    const {email,password} = req.body;
    try {
        const user = await User.findOne({email});
        if(!user) {
            return res.status(400).json({message:"Invalid Credentials"});
        }
        const isPasswordCorrect =  await bcrypt.compare(password,user.password); 
        if(!isPasswordCorrect) {
            return res.status(400).json({message:"Invalid Credentials"});
        }
        generateToken(user._id,res);
        res.status(200).json({
            _id : user._id,
            fullName : user.fullName,
            email : user.email,
            profilePic : user.profilePic,
            publicKey : user.publicKey
        });
    } catch(error) {
        console.log("Error in Login Controller : "+error.message);
        res.status(500).json({message:"Internal Sever Error"});
    }
}

// Called when a user logs in on a device that doesn't have their private key
// (e.g. a new browser). We generate a fresh keypair client-side and register
// the new public key here. Note: messages encrypted under the OLD key pair
// become undecryptable on this device — this is a known, expected tradeoff
// of client-side E2EE without a key-backup system.
export const updatePublicKey = async (req,res)=> {
    try {
        const {publicKey} = req.body;
        if(!publicKey) {
            return res.status(400).json({message:"publicKey is required"});
        }
        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            {publicKey},
            {new:true}
        ).select("-password");
        res.status(200).json(updatedUser);
    } catch(error) {
        console.log("Error in updatePublicKey controller : "+error.message);
        res.status(500).json({message:"Internal Sever Error"});
    }
}

export const logout = (req,res)=> {
    try {
        res.cookie("jwt","",{maxAge : 0});
        res.status(200).json({message:"Logged Out Successfully"});
    } catch(error) {
        console.log("Error in Logout Controller : "+error.message);
        res.status(500).json({message:"Internal Sever Error"});
    }
}


export const updateProfile = async (req,res)=> {
    try {
        const {profilePic} = req.body;
        const userID = req.user._id;
        if(!profilePic) {
            res.status(400).json({message:"Profile pic is required"});
        }
        const uploadResponse = await cloudinary.uploader.upload(profilePic);
        const updatedUser = await User.findByIdAndUpdate(userID,{profilePic : uploadResponse.secure_url},{new : true});
        res.status(200).json(updatedUser);
    } catch(error) {
        console.log("Error in update profile : "+error.message);
        res.status(500).json({message:"Internal Sever Error"});
    }
}

export const checkAuth = (req,res)=> {
    try {
        res.status(200).json(req.user);
    } catch(error) {
        console.log("error in checkAuth"+error.message);
        res.status(500).json({message:"Internal Sever Error"});
    }
}