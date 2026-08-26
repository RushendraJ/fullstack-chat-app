import express from "express";
import { login,logout, signup ,updateProfile,checkAuth,updatePublicKey,getBackupKey} from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/signup",signup);
router.post("/login",login);
router.post("/logout",logout);

router.put("/update-profile",protectRoute,updateProfile);
router.put("/update-public-key",protectRoute,updatePublicKey);

router.get("/check",protectRoute,checkAuth);
router.get("/backup-key",protectRoute,getBackupKey); 

export default router;