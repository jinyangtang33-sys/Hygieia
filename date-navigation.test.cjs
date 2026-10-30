const test=require('node:test'),assert=require('node:assert/strict');
const {client}=require('./personal-browser-harness.cjs');
const setup=url=>client({base:'http://127.0.0.1:8787',owner:'synthetic-navigation',url,dateNavigation:true});
test('a historical link loads on the requested date and survives refresh',()=>{
 const a=setup('https://example.test/?date=2026-10-12#health');assert.equal(a.run('selectedDate'),'2026-10-12');assert.equal(a.run('page'),'health');assert.equal(a.run('followToday'),false);const b=setup(a.context.location.href);assert.equal(b.run('selectedDate'),'2026-10-12');
});
test('invalid, repeated, impossible and future dates fall back safely',()=>{
 for(const value of ['date=2026-02-30','date=bad','date=1999-12-31','date=9999-01-01','date=2026-10-12&date=2026-10-13']){const c=setup('https://example.test/?'+value+'#overview');assert.equal(c.run('selectedDate'),c.run('TODAY'));assert.equal(c.context.location.search,'');}
});
test('choosing dates updates URL and browser Back/Forward restores selection',()=>{
 const c=setup('https://example.test/#overview');c.run("setDate('2026-10-12');setDate('2026-10-13')");assert.equal(c.context.location.search,'?date=2026-10-13');c.back();assert.equal(c.run('selectedDate'),'2026-10-12');c.forward();assert.equal(c.run('selectedDate'),'2026-10-13');c.run('setDate(TODAY)');assert.equal(c.context.location.search,'');assert.equal(c.run('followToday'),true);
});
test('page links preserve the date, including a fixed link to today',()=>{
 const c=setup('https://example.test/?date=2026-10-12#health');c.visit('#meals');assert.equal(c.run('selectedDate'),'2026-10-12');assert.equal(c.run('page'),'meals');const pinned=setup('https://example.test/?date='+c.run('TODAY')+'#overview');assert.equal(pinned.run('followToday'),false);
});
test('a URL traversal never replaces a dirty modal or journal with another date',()=>{
 const c=setup('https://example.test/?date=2026-10-12#overview');c.edit();c.visit('?date=2026-10-13#health');assert.equal(c.run('selectedDate'),'2026-10-12');assert.equal(c.run('page'),'overview');assert.match(c.context.location.href,/date=2026-10-12#overview/);
 const j=setup('https://example.test/?date=2026-10-12#journal');j.context.document.querySelector('#journal-text').value='离开历史日期前的手记';j.context.document.querySelector('#journal-text').dataset={date:'2026-10-12'};j.run('journalDirty=true');j.visit('?date=2026-10-13#overview');assert.equal(j.state().days['2026-10-12'].journal,'离开历史日期前的手记');assert.equal(j.state().days['2026-10-13'],undefined);
});
test('copied date links contain a fixed day and omit unrelated query parameters',async()=>{
 const c=setup('https://example.test/?ref=private-value#overview');await c.run('DateNavigation.copy()');const url=new URL(c.copied());assert.equal(url.searchParams.get('date'),c.run('TODAY'));assert.equal(url.searchParams.has('ref'),false);assert.equal(url.hash,'#overview');
});
