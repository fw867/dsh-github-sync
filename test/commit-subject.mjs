/**
 * What a deterministic commit subject looks like.
 *
 * The rule being pinned: the fallback names the change, never lists repository
 * paths, and is composed within 72 characters instead of being cut. The
 * regression it exists for is
 *
 *   chore: 更新 app/src/main/java/…/Iap2SenderSession.kt、…/MfiLengthMemory.kt 等 …
 *
 * — three full paths, sliced at character 72, saying nothing a reader can use.
 * Every case therefore checks the same three things: no path separator, no
 * truncation ellipsis, and a subject `normalizeSubject` leaves alone.
 *
 * Run: node test/commit-subject.mjs
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN = path.join(HERE, '..').replace(/\\/g, '/')
const { heuristicSubject, normalizeSubject, SUBJECT_LIMIT } = await import(`file:///${PLUGIN}/lib/commit.js`)

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}

/** A gathered context for these paths, with an optional staged patch. */
const contextOf = (files, diff = '') => ({
  branch: 'main',
  status: '',
  stagedNames: files.map((file) => `M\t${file}`).join('\n'),
  stagedStat: '',
  stagedDiff: diff,
  recent: [],
})

/** The subject contract: fits, no paths, and nothing left for truncation to do. */
function fits(subject) {
  return (
    subject.length <= SUBJECT_LIMIT &&
    subject.length > 0 &&
    !subject.includes('…') &&
    !subject.includes('/') &&
    normalizeSubject(subject) === subject
  )
}

const subjectOf = (files, language, options = {}) =>
  heuristicSubject(contextOf(files, options.diff), options.count ?? files.length, language)

console.log('=== the reported regression: an Android change in one package ===')
{
  const files = [
    'app/src/main/java/io/github/hypercar/iap2/Iap2SenderSession.kt',
    'app/src/main/java/io/github/hypercar/iap2/MfiLengthMemory.kt',
    'app/src/main/java/io/github/hypercar/iap2/ReceiverProfile.kt',
    'app/src/main/java/io/github/hypercar/iap2/Iap2ReceiverSession.kt',
    'app/src/main/java/io/github/hypercar/iap2/Iap2Link.kt',
  ]
  for (const language of ['zh', 'en']) {
    const subject = subjectOf(files, language)
    console.log(language, JSON.stringify(subject))
    ok(`${language}: the subject reads as a change`, fits(subject), subject)
    ok(`${language}: a layout segment is never the scope`, !subject.startsWith('chore(src)'), subject)
  }
  const zh = subjectOf(files, 'zh')
  ok('zh: names two files and counts the rest', zh === 'chore(iap2): 更新 Iap2SenderSession.kt、MfiLengthMemory.kt 等 5 个文件', zh)
  const en = subjectOf(files, 'en')
  ok(
    'en: names two files and counts the rest',
    en === 'chore: update Iap2SenderSession.kt, MfiLengthMemory.kt and 3 more files',
    en,
  )
}

console.log('\n=== the scope is the module, whatever the layout says ===')
{
  const spanning = [
    'app/src/main/java/io/github/hypercar/iap2/Iap2SenderSession.kt',
    'app/src/test/java/io/github/hypercar/iap2/Iap2SenderSessionTest.kt',
  ]
  const subject = subjectOf(spanning, 'zh')
  ok('main + test still scope to the package', subject.startsWith('chore(iap2): '), subject)

  const tests = ['test/run.mjs', 'test/markers.mjs', 'test/probes.mjs']
  const testSubject = subjectOf(tests, 'en')
  ok('a layout segment is not a scope', testSubject.startsWith('test: '), testSubject)

  const docs = ['docs/commit.md']
  const docSubject = subjectOf(docs, 'en', { diff: '+## Commit titles' })
  ok('a scope that repeats the type is dropped', docSubject === 'docs: update the "Commit titles" section', docSubject)
}

console.log('\n=== what the patch itself names wins ===')
{
  const added = subjectOf(['lib/commit.js'], 'en', { diff: '@@ -1 +1 @@\n+export function resolveSubjectLanguage(setting) {' })
  ok('an added declaration is the summary', added === 'feat(lib): add resolveSubjectLanguage', added)

  const removed = subjectOf(['lib/commit.js'], 'en', { diff: '@@ -1 +1 @@\n-function legacyTitle(input) {' })
  ok('a removed declaration is the summary', removed === 'chore(lib): remove legacyTitle', removed)

  const heading = subjectOf(['README.md'], 'en', { diff: '@@ -1 +1 @@\n+## Commit titles' })
  ok('an added heading is the summary', heading === 'docs: update the "Commit titles" section', heading)

  const build = subjectOf(['package.json'], 'en')
  ok('a manifest names itself', build === 'build: update package.json', build)

  const single = subjectOf(['lib/config.js'], 'zh')
  ok('one file is named by its file name', single === 'chore(lib): 更新 config.js', single)

  const deleting = heuristicSubject(
    {
      ...contextOf(['lib/legacy.js', 'lib/old.js', 'lib/gone.js']),
      stagedNames: ['lib/legacy.js', 'lib/old.js', 'lib/gone.js'].map((file) => `D\t${file}`).join('\n'),
    },
    3,
    'zh',
  )
  ok('a deletion is not described as an update', deleting === 'chore(lib): 移除 legacy.js、old.js 等 3 个文件', deleting)
}

console.log('\n=== long names shorten instead of being cut ===')
{
  const long = Array.from(
    { length: 6 },
    (_, index) => `app/src/main/java/io/github/hypercar/iap2/AbstractIap2SessionIntegrationHelperNumber${index}.kt`,
  )
  for (const language of ['zh', 'en']) {
    const subject = subjectOf(long, language)
    console.log(language, JSON.stringify(subject))
    ok(`${language}: long names still fit`, fits(subject), subject)
  }
  const zh = subjectOf(long, 'zh')
  ok('zh: one long name survives, the rest is a count', /^chore\(iap2\): 更新 AbstractIap2SessionIntegrationHelperNumber0\.kt 等 6 个文件$/.test(zh), zh)
  const en = subjectOf(long, 'en')
  ok('en: the count is the floor once no name fits', en === 'chore(iap2): update 6 files', en)

  const longSymbol = subjectOf(['lib/a.js'], 'en', {
    diff: '@@ -1 +1 @@\n+export function AnExtremelyLongDeclarationNameThatWouldNeverFitOnOneSubjectLine(value) {',
  })
  ok('a declaration too long for the line falls back to the count', fits(longSymbol), longSymbol)

  const nothing = heuristicSubject(
    { branch: 'main', status: '', stagedNames: '', stagedStat: '', stagedDiff: '', recent: [] },
    0,
    'zh',
  )
  ok('a change with no known file still yields a clean subject', fits(nothing), nothing)
}

console.log('\n=== every shape of change fits ===')
{
  const shapes = [
    ['lib/a.js'],
    ['lib/a.js', 'lib/b.js'],
    ['a.js'],
    ['src/main/java/x/ReallyLongModuleNameForTestingDirectoryNames/SomeVeryLongFileNameHere.kt'],
    ['docs/a.md', 'docs/b.md', 'docs/c.md'],
    ['test/a.mjs', 'test/b.mjs'],
    ['.github/workflows/ci.yml', '.github/workflows/release.yml'],
    ['README.md', 'lib/commit.js', 'package.json'],
    Array.from({ length: 30 }, (_, index) => `deep/nested/directory/number${index % 4}/file${index}.kt`),
  ]
  for (const files of shapes) {
    for (const language of ['zh', 'en']) {
      for (const count of [files.length, files.length + 5, undefined]) {
        const subject = heuristicSubject(contextOf(files), count, language)
        ok(`${language} ${files.length} file(s) count=${count}: ${JSON.stringify(subject)}`, fits(subject), subject)
      }
    }
  }
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
