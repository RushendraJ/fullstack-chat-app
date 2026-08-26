import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        email : {
            type : String,
            required : true,
            unique : true,
        },
        fullName : {
            type : String,
            required : true,
        },
        password : {
            type : String,
            required : true,
            minlength : 6,
        },
        profilePic : {
            type : String,
            default : "",
        },
        publicKey : {
            // Base64-encoded SPKI public key (RSA-OAEP), generated client-side.
            // The matching private key NEVER leaves the user's browser.
            type : String,
            default : "",
        }
    },
    { timestamps: true}
);

const User = mongoose.model("User",userSchema); // object created from the schema

export default User;