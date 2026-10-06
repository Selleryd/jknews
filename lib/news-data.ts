import type {Advertiser} from './advertising-core';
export {sourceDirectory} from './source-directory';
import {sourceDirectory} from './source-directory';
export const categories = ['All stories', 'AI & Technology', 'Politics', 'Markets', 'Robotics', 'World', 'Science'];
export type Article = { id:string; slug:string; title:string; category:string; dek:string; paragraphs:string[]; image:string; publisher:string; author:string; sourceUrl:string; publishedAt:string; kind?:string; imageLabel?:string; contentComplete?:boolean; originalPublishedAt?:string; sourceMode?:string; };
export const articles: Article[] = [
  {
    "id": "gemini-argon",
    "slug": "google-unveils-gemini-4-argon",
    "title": "Google’s next chapter in AI begins with Gemini 4.",
    "category": "AI & Technology",
    "dek": "The new Argon model is reaching selected cybersecurity partners, with a wider release date still to come.",
    "paragraphs": [
      "Google announced Argon, the flagship model in its Gemini 4 generation, on September 30. Access is initially limited to selected cybersecurity partners.",
      "The company reported competitive coding and cybersecurity results, although performance varied across benchmarks. It did not give a public release date.",
      "Reuters also reported that Google abandoned its planned Gemini 3.5 Pro release. Follow the original reporting for the announcement and its context."
    ],
    "image": "/images/ai.webp",
    "publisher": "Reuters",
    "author": "Kenrick Cai",
    "sourceUrl": "https://www.reuters.com/legal/litigation/google-announces-gemini-4-flagship-ai-model-after-months-delays-2026-09-30/",
    "publishedAt": "2026-09-30T20:04:00Z",
    "kind": "Summary",
    "imageLabel": "AI-generated conceptual illustration. Not a documentary photograph."
  },
  {
    "id": "energy-permitting",
    "slug": "senate-energy-permitting-agreement",
    "title": "A bipartisan opening for America’s energy infrastructure.",
    "category": "Politics",
    "dek": "Senators have agreed on a proposal to accelerate energy and infrastructure reviews.",
    "paragraphs": [
      "A bipartisan Senate agreement would change permitting rules for energy and infrastructure projects. The proposal addresses environmental reviews and interstate transmission.",
      "It would also require data centers to cover associated transmission costs. Supporters frame the changes as a response to increasing electricity demand.",
      "Environmental groups have raised concerns about protections and legal challenges. A Senate vote is expected after the midterm elections. Read Matthew Daly’s original report for the details."
    ],
    "image": "/images/politics.webp",
    "publisher": "Associated Press",
    "author": "Matthew Daly",
    "sourceUrl": "https://apnews.com/article/80d203a503d5843f32c8160dc004646b",
    "publishedAt": "2026-10-01T06:00:00Z",
    "kind": "Summary",
    "imageLabel": "AI-generated conceptual illustration. Not a photograph of the reported event."
  },
  {
    "id": "metals",
    "slug": "gold-silver-and-the-price-of-uncertainty",
    "title": "Gold, silver, and the price of uncertainty.",
    "category": "Markets",
    "dek": "The forces behind precious metals range from monetary policy to physical demand.",
    "paragraphs": [
      "Gold and silver are traded globally. A spot quote is a reference price at a point in time, rather than the retail cost of a coin or bar.",
      "Gold demand includes jewelry, investment, central banks, and technology. The World Gold Council publishes research and data on these categories.",
      "Silver has investment and industrial uses. That mix can lead it to respond differently from gold.",
      "Our market watch displays source timestamps. Check quote freshness and dealer premiums before relying on a price."
    ],
    "image": "/images/metals.webp",
    "publisher": "World Gold Council",
    "author": "World Gold Council",
    "sourceUrl": "https://www.gold.org/goldhub/data/gold-demand-by-country",
    "publishedAt": "2026-10-01T10:00:00Z",
    "kind": "Explainer",
    "imageLabel": "AI-generated editorial illustration."
  },
  {
    "id": "robotics",
    "slug": "humanoid-robot-sales-reach-7000",
    "title": "The humanoid era is arriving. The work is still ahead.",
    "category": "Robotics",
    "dek": "New industry figures put global humanoid sales at about 7,000 in 2025.",
    "paragraphs": [
      "About 7,000 humanoid robots were sold globally in 2025 for industrial and professional service uses, Reuters reported, citing the International Federation of Robotics.",
      "Many were purchased for research or training-data collection. The sales figure does not mean every robot is already performing productive workplace tasks.",
      "The federation’s new tally remains small compared with conventional industrial and service robotics. Read Toby Sterling’s report for the methodology and context."
    ],
    "image": "/images/robotics.webp",
    "publisher": "Reuters",
    "author": "Toby Sterling",
    "sourceUrl": "https://www.reuters.com/technology/humanoid-robot-sales-tally-hit-7000-globally-last-year-2026-09-21/",
    "publishedAt": "2026-09-21T05:05:00Z",
    "kind": "Summary",
    "imageLabel": "AI-generated conceptual robotics illustration. Not a reported deployment."
  },
  {
    "id": "computing",
    "slug": "ai-spending-reshapes-global-factory-demand",
    "title": "The AI boom is reaching the factory floor.",
    "category": "World",
    "dek": "Manufacturing surveys show stronger demand across much of Europe and Asia.",
    "paragraphs": [
      "September manufacturing surveys pointed to expansion in much of Europe and Asia, supported in part by demand for AI-related equipment.",
      "Reuters reported that the eurozone manufacturing index reached 52.9 and Taiwan’s reached 56.7. Performance was uneven across economies.",
      "Japan weakened, while some Southeast Asian economies contracted. Higher energy and borrowing costs remained pressures on manufacturers. Follow the original report for the complete regional picture."
    ],
    "image": "/images/servers.webp",
    "publisher": "Reuters",
    "author": "Leika Kihara and Indradip Ghosh",
    "sourceUrl": "https://www.reuters.com/world/china/global-economy-asian-factory-activity-expands-thanks-global-ai-boom-2026-10-01/",
    "publishedAt": "2026-10-01T02:24:00Z",
    "kind": "Summary",
    "imageLabel": "AI-generated conceptual computing illustration."
  },
  {
    "id": "travel",
    "slug": "a-more-considered-way-to-travel",
    "title": "A more considered way to see the world.",
    "category": "World",
    "dek": "Compare the journey, explore the destination, and leave room for something unexpected.",
    "paragraphs": [
      "Flight prices change with route, travel date, availability, and fare conditions. Consider baggage, stopovers, refund rules, and the total price when comparing offers.",
      "Our discovery tools open current flight searches for your chosen journey. In-site fares appear when a connected travel-data provider returns results.",
      "For dining, search by city or choose optional location access. Compare independent ratings and verify opening hours and dietary certification directly.",
      "Explore the discovery page to begin."
    ],
    "image": "/images/travel.webp",
    "publisher": "Jew Knows",
    "author": "Jew Knows editors",
    "sourceUrl": "https://www.google.com/travel/flights",
    "publishedAt": "2026-10-01T07:00:00Z",
    "kind": "Guide",
    "imageLabel": "AI-generated editorial illustration."
  }
];
export const defaultPoll={id:'2026-10-01',question:'How should governments approach artificial intelligence?',options:['Prioritize innovation','Introduce stronger oversight','Balance both approaches','I need more information'],sourceUrl:'https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai',generated:false};
export const defaultAds:Advertiser[]=[];
export const sourceCandidates=sourceDirectory.filter(s=>s.feedUrl&&s.feedVerified).map(s=>({id:s.id,name:s.name,feedUrl:s.feedUrl,category:s.category,approved:false,mode:'summary',rightsConfirmed:false,fullTextConfirmed:false,rightsUrl:'',requiringPermission:s.requiringPermission,feedVerified:true}));
