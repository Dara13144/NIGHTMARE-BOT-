import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

export const uploadRoutes = Router();

// Memory storage for safety
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image format. Allowed: JPG, PNG, WEBP, GIF'));
    }
  }
});

uploadRoutes.post('/product-image', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
  const randomName = `${crypto.randomBytes(16).toString('hex')}${ext}`;
  const filePath = `products/${randomName}`;

  try {
    // 1. Try uploading to Supabase Storage bucket 'product-images'
    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true
      });

    if (!error && data) {
      const { data: publicUrlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      return res.json({
        success: true,
        url: publicUrlData.publicUrl
      });
    }

    // 2. Fallback: Save to public/uploads/ for local development if Supabase Storage is offline
    logger.warn({ error }, 'Supabase Storage upload failed or not configured, saving to local public directory');
    const localUploadDir = path.resolve(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(localUploadDir)) {
      fs.mkdirSync(localUploadDir, { recursive: true });
    }

    const localFilePath = path.join(localUploadDir, randomName);
    fs.writeFileSync(localFilePath, req.file.buffer);

    return res.json({
      success: true,
      url: `/uploads/${randomName}`
    });
  } catch (err) {
    logger.error({ err }, 'Error handling image upload');
    return res.status(500).json({ error: 'Failed to upload image' });
  }
});
