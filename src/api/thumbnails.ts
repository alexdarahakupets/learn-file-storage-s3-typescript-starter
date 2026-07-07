import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { getInMemoryURL } from "./assets";

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

const videoThumbnails: Map<string, Thumbnail> = new Map();

export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }

  const thumbnail = videoThumbnails.get(videoId);
  if (!thumbnail) {
    throw new NotFoundError("Thumbnail not found");
  }

  return new Response(thumbnail.data, {
    headers: {
      "Content-Type": thumbnail.mediaType,
      "Cache-Control": "no-store",
    },
  });
}

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

  const thumbnailImageData = await thumbnailFile.arrayBuffer();
  if (!thumbnailImageData) {
    throw new Error('Error reading file data');
  }

  videoThumbnails.set(videoId, {
    data: thumbnailImageData,
    mediaType: thumbnailMediaType
  } satisfies Thumbnail);

  const thumbnailUrl = getInMemoryURL(cfg, videoId);
  updateVideo(cfg.db, {...dbVideo, thumbnailURL: thumbnailUrl})

  return respondWithJSON(200, null);
}
