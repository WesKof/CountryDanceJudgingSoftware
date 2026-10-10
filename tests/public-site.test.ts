import test from 'node:test';
import assert from 'node:assert/strict';
import {page,renderIndex,renderAbout} from '../public-site/render.ts';
test('separate public pages escape text, expose local assets and explain synthetic publication',()=>{
  const html=page('<p>approved content</p>','<script>');assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
  const home=renderIndex({records:{},current:{}});assert.ok(home.includes('/assets/community-night.jpg'));assert.ok(home.includes('Fictional competition results'));assert.ok(home.includes('The floor is waiting.'));assert.ok(!home.includes('/owner'));
  const board=renderIndex({records:{},current:{}},true);assert.ok(board.includes('Find your competition'));assert.ok(board.includes('No released competitions'));
  const about=renderAbout();assert.ok(about.includes('20/3'));assert.ok(about.includes('Blank means not observed, not zero'));assert.ok(about.includes('separately approves every release'));
});
