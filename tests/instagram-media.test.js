import test from 'node:test';
import assert from 'node:assert/strict';
import { instagramPlayback, withOriginalVideo } from '../lib/instagram-media.js';

test('reels with a missing video URL stay reels and use the Instagram player', () => {
  assert.deepEqual(instagramPlayback({mediaType:'VIDEO',videoUrl:null,permalink:'https://www.instagram.com/reel/DdtpGVdqeIp/'}), {isVideo:true,embedUrl:'https://www.instagram.com/p/DdtpGVdqeIp/embed/'});
});
test('direct videos retain native playback and photos remain photos', () => {
  assert.deepEqual(instagramPlayback({mediaType:'VIDEO',videoUrl:'https://example.com/reel.mp4'}), {isVideo:true,embedUrl:null});
  assert.deepEqual(instagramPlayback({mediaType:'IMAGE',permalink:'https://www.instagram.com/p/abc/'}), {isVideo:false,embedUrl:null});
});
test('invalid and non-Instagram links cannot become embedded frames', () => {
  for (const permalink of ['bad','https://evil.example/reel/abc/','https://instagram.com.evil.example/p/abc/','http://instagram.com/p/abc/']) {
    assert.equal(instagramPlayback({mediaType:'VIDEO',permalink}).embedUrl,null);
  }
});

test('original video follows the matching reel even when feed order changes', () => {
  const first = { mediaType: 'VIDEO', permalink: 'https://www.instagram.com/reel/new-post/' };
  const original = { mediaType: 'VIDEO', permalink: 'https://www.instagram.com/reel/DdtpGVdqeIp/?source=feed', videoUrl: null };
  assert.equal(withOriginalVideo(first), first);
  const result = withOriginalVideo(original);
  assert.equal(result.videoUrl, '/videos/ohho-reel-DdtpGVdqeIp.mp4');
  assert.equal(instagramPlayback(result).embedUrl, null);
});
