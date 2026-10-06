import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAllocation,deliveryCounts,normalizeAdvertisers,selectAdvertiserForTicket,shareToBasisPoints} from '../lib/advertising-core.ts';
const ad=(id,p,enabled=true)=>({id,name:id,label:id,sub:'',image:'',url:'',enabled,sharePercent:p});
test('20/40 are literal site-wide delivery shares, with 40 house inventory',()=>{
 const allocation=buildAllocation([ad('A',20),ad('B',40)]);
 assert.deepEqual(deliveryCounts(allocation,10000),{A:2000,B:4000,__house__:4000});
 assert.deepEqual(deliveryCounts(allocation,30000),{A:6000,B:12000,__house__:12000});
 assert.equal(allocation.paidPercent,60);assert.equal(allocation.housePercent,40);
});
test('fractional allocations have 0.01 percent precision and zero/disabled never serve',()=>{
 const a=buildAllocation([ad('small',.01),ad('other',33.33),ad('zero',0),ad('paused',99,false)]);
 assert.deepEqual(deliveryCounts(a,10000),{other:3333,small:1,__house__:6666});
 assert.equal(deliveryCounts(buildAllocation([]),10).__house__,10);
});
test('overflow, invalid precision and duplicate IDs reject instead of scaling percentages',()=>{
 assert.throws(()=>normalizeAdvertisers([ad('A',60),ad('B',60)]),/100%/);
 assert.throws(()=>shareToBasisPoints(.001),/two decimal/);
 assert.throws(()=>shareToBasisPoints(NaN),/number/);
 assert.throws(()=>normalizeAdvertisers([ad('A',20),ad('A',30)]),/unique/);
});
test('creative edits preserve allocation and campaigns are interleaved',()=>{
 const a=buildAllocation([ad('A',20),ad('B',40)]);
 const b=buildAllocation([{...ad('A',20),image:'https://example.com/new.jpg'},ad('B',40)]);
 assert.equal(a.revisionInput,b.revisionInput);
 const early=Array.from({length:10},(_,i)=>selectAdvertiserForTicket(a,i).id);
 assert.equal(early.filter(x=>x==='A').length,2);assert.equal(early.filter(x=>x==='B').length,4);
 assert.throws(()=>selectAdvertiserForTicket(a,-1),/Invalid/);
});
