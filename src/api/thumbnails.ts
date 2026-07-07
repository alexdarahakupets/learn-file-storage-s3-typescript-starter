import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import path from 'node:path';

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
  if (!thumbnailMediaType) {
    throw new BadRequestError('Missing Content-Type for thumbnail');
  }

  const thumbnailImageArrayBuffer = await thumbnailFile.arrayBuffer();
  if (!thumbnailImageArrayBuffer) {
    throw new Error('Error reading file data');
  }

  const fileExtension = thumbnailMediaType.split('/')[1];
  Bun.write(path.join(cfg.assetsRoot, `${videoId}.${fileExtension}`), thumbnailImageArrayBuffer)

  const thumbnailDataUrl = `http://localhost:${cfg.port}/assets/${videoId}.${fileExtension}`

  updateVideo(cfg.db, {...dbVideo, thumbnailURL: thumbnailDataUrl, })

  return respondWithJSON(200, null);
}
