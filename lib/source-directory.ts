/**
 * Owner-review candidates, not approved sources.
 * Feed availability was checked against publisher-controlled endpoints on the
 * date below. A working feed does not grant full-text republication rights.
 * requiringPermission flags explicit restrictions relevant to this site's
 * advertising/rewrite workflow; false is not a blanket reuse licence.
 */
export const sourceDirectoryVerifiedAt = '2026-10-05';

export type SourceDirectoryEntry = {
  id: string;
  name: string;
  website: string;
  feedUrl: string;
  category: string;
  mode: 'summary';
  requiringPermission: boolean;
  reason: string;
  evidenceUrl: string;
  feedVerified: boolean;
};

export const sourceDirectory: SourceDirectoryEntry[] = [
  {
    id: 'forbes-business', name: 'Forbes — Business', website: 'https://www.forbes.com',
    feedUrl: 'https://www.forbes.com/business/feed/', category: 'Markets', mode: 'summary',
    requiringPermission: false, feedVerified: true,
    reason: 'Live RSS supplies excerpts and creator bylines. Full-text availability and republication rights must be checked separately.',
    evidenceUrl: 'https://www.forbes.com/business/feed/',
  },
  {
    id: 'forbes-innovation', name: 'Forbes — Innovation', website: 'https://www.forbes.com',
    feedUrl: 'https://www.forbes.com/innovation/feed/', category: 'AI & Technology', mode: 'summary',
    requiringPermission: false, feedVerified: true,
    reason: 'Live RSS supplies excerpts and creator bylines. A content:encoded field may still contain only an excerpt.',
    evidenceUrl: 'https://www.forbes.com/innovation/feed/',
  },
  {
    id: 'inc', name: 'Inc.', website: 'https://www.inc.com',
    feedUrl: 'https://www.inc.com/rss/', category: 'Markets', mode: 'summary',
    requiringPermission: false, feedVerified: true,
    reason: 'Live RSS supplies excerpts and creator bylines. Full-text republication permission was not established.',
    evidenceUrl: 'https://www.inc.com/rss/',
  },
  {
    id: 'alex-jones-live', name: 'Alex Jones Live', website: 'https://www.alexjoneslive.com',
    feedUrl: 'https://www.alexjoneslive.com/feed/', category: 'Politics', mode: 'summary',
    requiringPermission: false, feedVerified: true,
    reason: 'Live RSS supplies excerpts and creator bylines. Terms restrict use of content without creation or licensing rights.',
    evidenceUrl: 'https://www.alexjoneslive.com/terms-of-service/',
  },
  {
    id: 'infowars', name: 'InfoWars', website: 'https://www.infowars.com',
    feedUrl: '', category: 'Politics', mode: 'summary',
    requiringPermission: false, feedVerified: false,
    reason: 'The tested rss.xml endpoint returned HTML rather than RSS. No working publisher article feed was verified; supply a verified feed before approval.',
    evidenceUrl: 'https://www.infowars.com',
  },
  {
    id: 'naturalnews', name: 'NaturalNews', website: 'https://www.naturalnews.com',
    feedUrl: 'https://www.naturalnews.com/rss.xml', category: 'Science', mode: 'summary',
    requiringPermission: false, feedVerified: true,
    reason: 'Live RSS supplies excerpts and author data. General terms require written consent for republication; RSS alone does not permit full articles.',
    evidenceUrl: 'https://support.naturalnews.com/Terms.html',
  },
  {
    id: 'fox-news', name: 'Fox News', website: 'https://www.foxnews.com',
    feedUrl: 'https://moxie.foxnews.com/google-publisher/latest.xml', category: 'World', mode: 'summary',
    requiringPermission: true, feedVerified: true,
    reason: 'RSS terms prohibit associated advertising and modifying feeds. Permission is needed for this advertising-supported rewrite workflow.',
    evidenceUrl: 'https://www.foxnews.com/story/foxnews-com-rss-feeds',
  },
  {
    id: 'cnn', name: 'CNN', website: 'https://www.cnn.com',
    feedUrl: '', category: 'World', mode: 'summary',
    requiringPermission: false, feedVerified: false,
    reason: 'The tested legacy top-stories RSS endpoint returned HTTP 502. No working current feed was verified; do not enable an assumed URL.',
    evidenceUrl: 'https://www.cnn.com/services/rss/',
  },
  {
    id: 'nbc-news', name: 'NBC News', website: 'https://www.nbcnews.com',
    feedUrl: 'https://feeds.nbcnews.com/nbcnews/public/news', category: 'World', mode: 'summary',
    requiringPermission: false, feedVerified: true,
    reason: 'Live RSS supplies summaries and source links, without bylines in sampled items. Full-text republication rights were not established.',
    evidenceUrl: 'https://feeds.nbcnews.com/nbcnews/public/news',
  },
  {
    id: 'associated-press', name: 'Associated Press', website: 'https://apnews.com',
    feedUrl: '', category: 'World', mode: 'summary',
    requiringPermission: false, feedVerified: false,
    reason: 'The homepage advertises index.rss, but that endpoint returned HTTP 401. AP offers licensed feeds and an authenticated Media API; add your entitled feed.',
    evidenceUrl: 'https://api.ap.org/media/v/docs/Getting_Started_API.htm',
  },
  {
    id: 'reuters', name: 'Reuters', website: 'https://www.reuters.com',
    feedUrl: '', category: 'World', mode: 'summary',
    requiringPermission: false, feedVerified: false,
    reason: 'Official delivery documentation offers subscriber RSS. No free working article feed was verified; use the feed supplied with your licence.',
    evidenceUrl: 'https://reutersagency.com/content-delivery-platforms/content-delivery',
  },
  {
    id: 'washington-post', name: 'The Washington Post — Politics', website: 'https://www.washingtonpost.com',
    feedUrl: 'https://www.washingtonpost.com/arcio/rss/category/politics/', category: 'Politics', mode: 'summary',
    requiringPermission: true, feedVerified: true,
    reason: 'Requires bylines and direct links; restricts edits, own advertising, and broad mobile reuse without permission.',
    evidenceUrl: 'https://www.washingtonpost.com/discussions/2021/01/01/rss-terms-service/',
  },
  {
    id: 'jerusalem-post', name: 'The Jerusalem Post', website: 'https://www.jpost.com',
    feedUrl: 'https://www.jpost.com/rss/rssfeedsfrontpage.aspx', category: 'World', mode: 'summary',
    requiringPermission: true, feedVerified: true,
    reason: 'Official terms restrict commercial syndication and republication. Live RSS supplies excerpts and a capitalized Author field.',
    evidenceUrl: 'https://www.jpost.com/landedpages/termsofservice.aspx',
  },
  {
    id: 'times-of-israel', name: 'The Times of Israel', website: 'https://www.timesofisrael.com',
    feedUrl: 'https://www.timesofisrael.com/feed/', category: 'World', mode: 'summary',
    requiringPermission: false, feedVerified: true,
    reason: 'Live RSS supplies excerpts without bylines in sampled items. General terms require written permission for republication and restrict third-party AP content.',
    evidenceUrl: 'https://www.timesofisrael.com/terms/',
  },
  {
    id: 'haaretz', name: 'Haaretz — Israel News', website: 'https://www.haaretz.com',
    feedUrl: 'https://www.haaretz.com/srv/israel-news-rss', category: 'World', mode: 'summary',
    requiringPermission: false, feedVerified: true,
    reason: 'Publisher-listed live RSS supplies excerpts and creator bylines. Feed access does not grant full-text or paywall access rights.',
    evidenceUrl: 'https://www.haaretz.com/israel-news/2022-05-29/ty-article/subscribe-to-rss-feed-and-other-ways-to-read-haaretz/00000181-0f20-d077-a1ff-ffe73cfd0000',
  },
  {
    id: 'ynetnews', name: 'Ynetnews', website: 'https://www.ynetnews.com',
    feedUrl: 'https://www.ynet.co.il/Integration/StoryRss3082.xml', category: 'World', mode: 'summary',
    requiringPermission: true, feedVerified: true,
    reason: 'The official English-news feed is hosted on ynet.co.il. RSS terms prohibit advertising and modifying feed content without permission.',
    evidenceUrl: 'https://www.ynetnews.com/articles/0,7340,L-3124381,00.html',
  },
  {
    id: 'israel-hayom', name: 'Israel Hayom', website: 'https://www.israelhayom.com',
    feedUrl: 'https://www.israelhayom.com/feed/', category: 'World', mode: 'summary',
    requiringPermission: false, feedVerified: true,
    reason: 'Live RSS includes long-form content and creator account names. General terms require written republication consent; full feed content is not a reuse licence.',
    evidenceUrl: 'https://www.israelhayom.com/terms-of-use/',
  },
  {
    id: 'bbc-news', name: 'BBC News', website: 'https://www.bbc.com/news',
    feedUrl: 'https://feeds.bbci.co.uk/news/rss.xml', category: 'World', mode: 'summary',
    requiringPermission: false, feedVerified: true,
    reason: 'Live public RSS was verified. Full-article syndication is a separate authorized BBC service; public feed verification does not grant those rights.',
    evidenceUrl: 'https://information-syndication.int.api.bbc.com/',
  },
  {
    id: 'guardian-world', name: 'The Guardian — World', website: 'https://www.theguardian.com',
    feedUrl: 'https://www.theguardian.com/world/rss', category: 'World', mode: 'summary',
    requiringPermission: true, feedVerified: true,
    reason: 'Public RSS is offered for personal, noncommercial use. Commercial publishing requires permission.',
    evidenceUrl: 'https://www.theguardian.com/help/feeds',
  },
  {
    id: 'npr', name: 'NPR', website: 'https://www.npr.org',
    feedUrl: 'https://feeds.npr.org/1001/rss.xml', category: 'World', mode: 'summary',
    requiringPermission: true, feedVerified: true,
    reason: 'Live RSS was verified. NPR content-feed terms limit qualifying personal/nonprofit use; review permission before commercial publishing.',
    evidenceUrl: 'https://www.npr.org/about-npr/179876898/terms-of-use',
  },
  {
    id: 'ars-technica', name: 'Ars Technica', website: 'https://arstechnica.com',
    feedUrl: 'https://feeds.arstechnica.com/arstechnica/index', category: 'AI & Technology', mode: 'summary',
    requiringPermission: false, feedVerified: true,
    reason: 'Live publisher RSS was verified. Full-text republication permission was not established; retain attribution and review publisher terms.',
    evidenceUrl: 'https://feeds.arstechnica.com/arstechnica/index',
  },
  {
    id: 'wired', name: 'WIRED', website: 'https://www.wired.com',
    feedUrl: 'https://www.wired.com/feed/rss', category: 'AI & Technology', mode: 'summary',
    requiringPermission: false, feedVerified: true,
    reason: 'Live publisher RSS was verified. Full-text republication permission was not established; review publisher terms and any subscription restrictions.',
    evidenceUrl: 'https://www.wired.com/feed/rss',
  },
  {
    id: 'techcrunch', name: 'TechCrunch', website: 'https://techcrunch.com',
    feedUrl: 'https://techcrunch.com/feed/', category: 'AI & Technology', mode: 'summary',
    requiringPermission: true, feedVerified: true,
    reason: 'RSS terms require unchanged feed content, attribution and source links; prohibit inserted advertising.',
    evidenceUrl: 'https://techcrunch.com/rss-terms-of-use/',
  },
  {
    id: 'science-daily', name: 'ScienceDaily', website: 'https://www.sciencedaily.com',
    feedUrl: 'https://www.sciencedaily.com/rss/all.xml', category: 'Science', mode: 'summary',
    requiringPermission: false, feedVerified: true,
    reason: 'Live publisher RSS was verified. Check each research-release origin and reuse rights before full-text publishing.',
    evidenceUrl: 'https://www.sciencedaily.com/rss/all.xml',
  },
  {
    id: 'science-journal', name: 'Science / AAAS', website: 'https://www.science.org',
    feedUrl: '', category: 'Science', mode: 'summary',
    requiringPermission: false, feedVerified: false,
    reason: 'The tested journal RSS endpoint returned HTTP 403. No working current feed was verified; supply an authorized feed before approval.',
    evidenceUrl: 'https://www.science.org',
  },
  {
    id: 'nasa', name: 'NASA', website: 'https://www.nasa.gov',
    feedUrl: 'https://www.nasa.gov/feed/', category: 'Science', mode: 'summary',
    requiringPermission: false, feedVerified: true,
    reason: 'Live RSS was verified. NASA permits factual editorial use under its guidelines; third-party material, logos, endorsement and AI attribution require separate care.',
    evidenceUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
  },
];
