import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { mediaTypeToExt } from "./assets";
import path from "path";

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }
  
  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);
  
  const dbVideo = getVideo(cfg.db, videoId);
  if (!dbVideo) {
    throw new NotFoundError(`Video id ${videoId} not found`);
  }
  if (dbVideo.userID !== userID) {
    throw new UserForbiddenError('Your user id doesn\'t match the video user id');
  }
  
  const formData = await req.formData();
  const thumbnailFile = formData.get('thumbnail');
  if (!(thumbnailFile instanceof File)) {
    throw new BadRequestError("Invalid thumbnail")
  }

  // 10 << 20 is the same as 10* 1024 * 1024
  const MAX_UPLOAD_SIZE = 10 << 20; // 10 MB

  if (thumbnailFile.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError(`Thumbnail size exceeds limit ${MAX_UPLOAD_SIZE / 1024 / 1024} MB`)
  }

  
  const thumbnailMediaType = thumbnailFile.type;
  if (!ALLOWED_IMAGE_TYPES.includes(thumbnailMediaType)) {
    throw new BadRequestError("Invalid file type. Only JPEG or PNG allowed.");
  }

  const fileExtension = mediaTypeToExt(thumbnailMediaType);
  const fileName = `${videoId}${fileExtension}`;
  const assetDiskPath = path.join(cfg.assetsRoot, fileName);
  Bun.write(assetDiskPath, thumbnailFile)
  const thumbnailDataUrl = `http://localhost:${cfg.port}/${assetDiskPath}`;

  updateVideo(cfg.db, {...dbVideo, thumbnailURL: thumbnailDataUrl, })

  return respondWithJSON(200, null);
}
