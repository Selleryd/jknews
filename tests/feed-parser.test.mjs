import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFeed,plainParagraphs,decodeEntities} from '../lib/feed-parser.ts';
const full = 'A complete publisher-supplied paragraph includes enough substantial text to exceed the conservative excerpt threshold. '.repeat(7).trim();
const rss=(inner)=>`<?xml version="1.0"?><rss version="2.0" xmlns:content="urn:content" xmlns:dc="urn:dc"><channel><title>Publisher</title>${inner}</channel></rss>`;
const item=(body)=>`<item><title>Original &amp; accurate headline</title><link>https://publisher.example/story</link><dc:creator>Jane Doe</dc:creator><pubDate>Mon, 05 Oct 2026 10:00:00 GMT</pubDate>${body}</item>`;
test('full RSS body is separate from description, with paragraphs, byline and entities intact',()=>{
 const [entry]=parseFeed(rss(item(`<description>Short excerpt</description><content:encoded><![CDATA[<p>${full}</p><p>Second paragraph &amp; useful context.</p>]]></content:encoded>`)));
 assert.equal(entry.title,'Original & accurate headline');assert.equal(entry.author,'Jane Doe');assert.equal(entry.description,'Short excerpt');assert.deepEqual(entry.fullBody,[full,'Second paragraph & useful context.']);assert.equal(entry.fullContentStatus,'available');
});
test('escaped HTML and unsafe scripts never become displayed article text',()=>{
 const body='&lt;p&gt;First &lt;strong&gt;statement&lt;/strong&gt;.&lt;/p&gt;&lt;script&gt;secret()&lt;/script&gt;&lt;p&gt;Second &amp;amp; safe.&lt;/p&gt;';
 assert.deepEqual(plainParagraphs(body),['First statement.','Second & safe.']);
 assert.deepEqual(plainParagraphs('<p>Safe.</p><style>hidden</style><iframe>bad</iframe><template>private</template><p>Visible.</p>'),['Safe.','Visible.']);
});
test('Atom prefers alternate article URL and reads structured author and XHTML content',()=>{
 const [entry]=parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom publisher</title><author><name>Feed Author</name></author><entry><title>Atom story</title><link rel="self" href="https://example.com/entry.xml"/><link rel="alternate" type="text/html" href="https://example.com/article"/><author><name>Original Writer</name><uri>https://example.com/writer</uri></author><published>2026-10-05T12:00:00Z</published><summary>Excerpt</summary><content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>${full}</p><p>Paragraph two.</p></div></content></entry></feed>`);
 assert.equal(entry.url,'https://example.com/article');assert.equal(entry.author,'Original Writer');assert.equal(entry.publisher,'Atom publisher');assert.equal(entry.fullContentStatus,'available');assert.deepEqual(entry.fullBody,[full,'Paragraph two.']);
});
test('RSS description is never assumed to be full content',()=>{
 const [entry]=parseFeed(rss(item(`<description><![CDATA[<p>${full}</p>]]></description>`)));
 assert.equal(entry.fullContentStatus,'missing');assert.deepEqual(entry.fullBody,[]);assert.equal(entry.description,full);
});
test('short content:encoded and explicit continuation markers are held as incomplete',()=>{
 const [short]=parseFeed(rss(item('<content:encoded>A short excerpt.</content:encoded>')));
 assert.equal(short.fullContentStatus,'incomplete');
 const [clipped]=parseFeed(rss(item(`<content:encoded><![CDATA[<p>${full}</p><a href="https://example.com/full">Read more</a>]]></content:encoded>`)));
 assert.equal(clipped.fullContentStatus,'incomplete');assert.match(clipped.fullContentReason,/continuation/);
});
test('long complete supplied bodies keep every character, while oversized bodies are held without a truncated substitute',()=>{
 const permitted='A'.repeat(99_999);
 const [entry]=parseFeed(rss(item(`<content:encoded><![CDATA[${permitted}]]></content:encoded>`)));
 assert.equal(entry.fullContentStatus,'available');assert.equal(entry.fullBody[0].length,99_999);
 const [oversized]=parseFeed(rss(item(`<content:encoded><![CDATA[${'B'.repeat(100_001)}]]></content:encoded>`)));
 assert.equal(oversized.fullContentStatus,'oversized');assert.deepEqual(oversized.fullBody,[]);assert.match(oversized.fullContentReason,/rather than truncated/);
});
test('unrecognized HTML, DTDs and malformed XML fail explicitly',()=>{
 assert.throws(()=>parseFeed('<html><body>A sign-in page</body></html>'),/recognized/);
 assert.throws(()=>parseFeed('<!DOCTYPE rss [<!ENTITY secret SYSTEM "file:///etc/passwd">]><rss><channel/></rss>'),/DTD/);
 assert.throws(()=>parseFeed('<rss><channel><item></channel></rss>'),/mismatched/);
 assert.throws(()=>parseFeed('<rss><channel>'),/unfinished/);
});
test('external Atom content never triggers a full-body download and missing byline stays empty',()=>{
 const [entry]=parseFeed('<feed><entry><title>External article</title><link href="https://example.com/article"/><content src="https://example.com/body"/></entry></feed>');
 assert.equal(entry.fullContentStatus,'missing');assert.equal(entry.author,'');assert.deepEqual(entry.fullBody,[]);
});
test('feeds prefer newest items and safely decode invalid numeric entities',()=>{
 const xml=rss(item('<description>new</description>')+item('<description>old</description>').replace('05 Oct 2026','01 Oct 2026'));
 assert.equal(parseFeed(xml)[0].description,'new');assert.equal(decodeEntities('&#x1f600; &#99999999; &#0;'),'😀 � �');
});
test('uppercase publisher byline tags and RDF items are handled',()=>{
 const [entry]=parseFeed('<rdf:RDF xmlns:rdf="urn:rdf"><item><title>A story</title><link>https://example.com/story</link><Author>Publisher Writer</Author><description>Excerpt</description></item></rdf:RDF>');
 assert.equal(entry.author,'Publisher Writer');
});
test('Atom text keeps literal escaped angle brackets while non-text bodies are unavailable',()=>{
 const [text]=parseFeed(`<feed><entry><title>Text article</title><link href="https://example.com/story"/><content type="text">${full}&lt;literal-tag&gt;</content></entry></feed>`);
 assert.equal(text.fullBody[0],full+'<literal-tag>');assert.equal(text.fullContentStatus,'available');
 const [binary]=parseFeed(`<feed><entry><title>Image</title><link href="https://example.com/image"/><content type="image/png">${'A'.repeat(1000)}</content></entry></feed>`);
 assert.equal(binary.fullContentStatus,'missing');assert.deepEqual(binary.fullBody,[]);
});
