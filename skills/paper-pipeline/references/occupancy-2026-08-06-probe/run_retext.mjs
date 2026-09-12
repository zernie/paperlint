import {unified} from 'unified';
import retextEnglish from 'retext-english';
import retextReadability from 'retext-readability';
import retextStringify from 'retext-stringify';
import {reporter} from 'vfile-reporter';
import fs from 'node:fs';

const sentences = fs.readFileSync('sentences.txt', 'utf8')
  .split(/\n\n+/).filter(Boolean).map(s => s.replace(/^\d+\.\s*/, '').trim());

for (const [label, opts] of [
  ['DEFAULT (age=16, minWords=5, threshold=4/7)', {}],
  ['STRICT (age=6, minWords=1, threshold=1/7)', {age: 6, minWords: 1, threshold: 1/7}],
]) {
  console.log(`\n======= ${label} =======`);
  const processor = unified().use(retextEnglish).use(retextReadability, opts).use(retextStringify);
  for (let i = 0; i < sentences.length; i++) {
    const file = await processor.process(sentences[i]);
    console.log(`--- sentence ${i+1} ---`);
    console.log(sentences[i]);
    console.log(reporter(file));
    console.log();
  }
}
