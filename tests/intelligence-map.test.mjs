import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const modules={};
function moduleFor(name){
 if(modules[name])return modules[name].exports;
 const module={exports:{}};modules[name]=module;
 const filename=new URL('../lib/'+name.replace('./','')+'.ts',import.meta.url);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','module','exports',code)(moduleFor,module,module.exports);return module.exports;
}
const {renderIntelligenceMap}=moduleFor('./intelligence-map');
const {buildIntelligence}=moduleFor('./intelligence-core');
const now='2026-10-05T14:00:00Z';
test('empty approved intake exports a real world map without invented conflicts or positions',()=>{
 const edition=buildIntelligence({sources:[],now});const svg=renderIntelligenceMap(edition);
 assert.match(svg,/Awaiting source-backed conflict reporting/);assert.match(svg,/0 places \/ 0 source connections \/ 0 reports/);assert.match(svg,/Made with Natural Earth/);assert.match(svg,/width="1600" height="1030"/);assert.doesNotMatch(svg,/<a href=/);
});
test('map export includes source-backed co-mentions and escapes publisher-derived text',()=>{
 const edition=buildIntelligence({sources:[{id:'donor',name:'Donor',approved:true}],articles:[{sourceId:'donor',title:'Armed conflict in Ukraine and Russia',description:'Source reports discuss Ukraine and Russia.',sourceUrl:'https://news.example/report',publishedAt:now}],now});
 assert.ok(edition.conflicts.locations.length>=2);const svg=renderIntelligenceMap(edition);
 assert.match(svg,/co-mentioned in reporting/);assert.match(svg,/href="https:\/\/news.example\/report"/);assert.match(svg,/Reporting location/);
 edition.conflicts.locations[0].name='<script>alert("x")</script>&';edition.conflicts.locations[0].evidence[0].url='javascript:alert(1)';
 const escaped=renderIntelligenceMap(edition);assert.doesNotMatch(escaped,/<script>|javascript:/);assert.match(escaped,/&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;&amp;/);
});
