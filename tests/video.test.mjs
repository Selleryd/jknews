import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeVideoUrl, publicVideoSettings, validatedVideoSettings} from '../lib/video.ts';

const video = (id, url, enabled = true) => ({id, title: 'Newsroom dispatch', url, enabled});
const id = 'abcdefghI_1';

test('YouTube watch, short, mobile, privacy embed and live links resolve to the same privacy player', () => {
  const expected = {url: 'https://www.youtube.com/watch?v=' + id, provider: 'youtube', embedUrl: 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0'};
  for (const url of ['https://youtu.be/' + id + '?si=tracking', 'https://www.youtube.com/watch?v=' + id + '&list=playlist', 'https://m.youtube.com/shorts/' + id, 'https://www.youtube.com/live/' + id, 'https://www.youtube-nocookie.com/embed/' + id]) assert.deepEqual(normalizeVideoUrl(url), expected);
  assert.throws(() => normalizeVideoUrl('https://youtube.com/watch?v=bad'), /video ID/);
  assert.throws(() => normalizeVideoUrl('https://youtube.com/@channel'), /video ID/);
});

test('Google Drive sharing and open links resolve to preview while preserving a source link', () => {
  const driveId = '1abcDEF_ghijKLM-nop';
  const expected = {url: 'https://drive.google.com/file/d/' + driveId + '/view', provider: 'drive', embedUrl: 'https://drive.google.com/file/d/' + driveId + '/preview'};
  assert.deepEqual(normalizeVideoUrl('https://drive.google.com/file/d/' + driveId + '/view?usp=sharing'), expected);
  assert.deepEqual(normalizeVideoUrl('https://drive.google.com/open?id=' + driveId), expected);
  assert.throws(() => normalizeVideoUrl('https://drive.google.com/drive/folders/' + driveId), /file sharing/);
});

test('only HTTPS public media addresses are accepted, without credential or private-host bypasses', () => {
  for (const url of ['javascript:alert(1)', 'http://cdn.example.com/movie.mp4', 'https://user:password@cdn.example.com/movie.mp4', 'https://localhost/movie.mp4', 'https://10.0.0.5/movie.mp4', 'https://127.1/movie.mp4', 'https://2130706433/movie.mp4', 'https://[::1]/movie.mp4', 'https://[::ffff:127.0.0.1]/movie.mp4', 'https://newsroom.local/movie.mp4', 'https://cdn.example.com:8080/movie.mp4']) assert.throws(() => normalizeVideoUrl(url));
  assert.deepEqual(normalizeVideoUrl('https://cdn.example.com/video.mp4?signature=abc#fragment'), {url: 'https://cdn.example.com/video.mp4?signature=abc', provider: 'direct'});
  assert.equal(normalizeVideoUrl('https://youtube.com.attacker.example.org/video.mp4').provider, 'direct');
});

test('provider and embed URLs are derived from the source, never trusted from submitted fields', () => {
  const settings = validatedVideoSettings({videos: [{...video('one', 'https://youtu.be/' + id), provider: 'drive', embedUrl: 'https://attacker.example.org/embed'}], featuredId: 'one'});
  assert.equal(settings.videos[0].provider, 'youtube');
  assert.equal(settings.videos[0].embedUrl, 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0');
  assert.throws(() => validatedVideoSettings({videos: [video('one', 'https://cdn.example.com/a.mp4'), video('one', 'https://cdn.example.com/b.mp4')]}), /unique ID/);
  assert.throws(() => validatedVideoSettings({videos: [video('one', 'https://cdn.example.com/a.mp4')], featuredId: 'missing'}), /featured video/);
  assert.throws(() => validatedVideoSettings({videos: [{...video('one', 'https://cdn.example.com/a.mp4'), poster: 'http://cdn.example.com/a.jpg'}]}), /HTTPS/);
});

test('public playlists omit unpublished videos and fall back from a disabled feature', () => {
  const settings = validatedVideoSettings({videos: [video('private', 'https://cdn.example.com/private.mp4', false), video('public', 'https://cdn.example.com/public.mp4')], featuredId: 'private'});
  assert.deepEqual(publicVideoSettings(settings).videos.map(row => row.id), ['public']);
  assert.equal(publicVideoSettings(settings).featuredId, 'public');
  assert.deepEqual(publicVideoSettings({videos: []}), {videos: []});
});
