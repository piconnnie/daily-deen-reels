import {Config} from '@remotion/cli/config';

// Instagram Reels delivery: H.264 + AAC, yuv420p, high quality.
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setCodec('h264');
Config.setPixelFormat('yuv420p');
Config.setCrf(18);
Config.setAudioCodec('aac');
// Instagram Reels spec: AAC at 128 kbps, 48 kHz max.
Config.setAudioBitrate('128k');
Config.setOverwriteOutput(true);
