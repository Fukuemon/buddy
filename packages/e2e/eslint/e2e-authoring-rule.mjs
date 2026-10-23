import path from 'node:path'
import { ESLintUtils } from '@typescript-eslint/utils'

const createRule = ESLintUtils.RuleCreator((name) => `https://example.com/rule/${name}`)

const ROOT = 'tests/'
const EXTERNAL_DOM_DIR = 'tests/selectors/'

const FIXED_WAITS = ['waitForTimeout', 'setTimeout']
const CSS_LOCATORS = ['locator', 'waitForSelector']
const TEXT_LOCATORS = [
  'getByRole',
  'getByLabel',
  'getByPlaceholder',
  'getByText',
  'getByTitle',
  'getByAltText',
]
const VALUE_READERS = ['innerText', 'textContent', 'inputValue', 'allInnerTexts', 'allTextContents']
// widgets の待ちが属性を見るのは比較ではないので、spec だけで止める
const SPEC_ONLY_VALUE_READERS = ['getAttribute']

const isUnder = (filePath, dir) => filePath.includes(`${ROOT}${dir}/`)
const isSpec = (filePath) => filePath.endsWith('.e2e.ts')
const isScreenOrWidget = (filePath) => isUnder(filePath, 'screens') || isUnder(filePath, 'widgets')

const SPECS = `${ROOT}specs/`
// specs/<dir>/ の <dir>。要求や機能ごとのまとまり。specs/ の外か直下なら undefined
const specDirOf = (filePath) => filePath.match(/^tests\/specs\/([^/]+)\//)?.[1]
// specs/<dir>/ の値のファイルに操作を書かせないため、ブラウザを操作する型の引数を止める
const OPERATION_TYPE = /\b(Page|Locator|BrowserContext|Browser)\b/

// import してよいのは、同じ specs/<dir>/ の値のファイルだけ。spec と、specs/ を指すパッケージ名の import は止める
const importsOtherSpecs = (filePath, source) => {
  if (!source.startsWith('.')) return /(^|\/)specs\//.test(source)
  // 末尾の / を足し、ディレクトリそのもの(`.`)も、その中のファイルと同じに判定する
  const target = `${path.posix.join(path.posix.dirname(filePath), source)}/`
  if (!target.startsWith(SPECS)) return false
  const dir = specDirOf(target)
  return dir === undefined || dir !== specDirOf(filePath) || /\.e2e(\.ts)?\/$/.test(target)
}

const calleeName = (node) => {
  if (node.callee.type === 'Identifier') return node.callee.name
  if (node.callee.type !== 'MemberExpression' || node.callee.property.type !== 'Identifier')
    return ''
  // expect.soft / expect.poll も結果の確認なので expect として扱う
  if (node.callee.object.type === 'Identifier' && node.callee.object.name === 'expect')
    return 'expect'
  return node.callee.property.name
}

/**
 * E2E のテストのコードの書き方の規則。tests/ の下を、層(screens、widgets、selectors、specs)ごとに確認する。
 * プロダクトに固有の値は options で受け取る。
 */
export const rule = createRule({
  meta: {
    type: 'problem',
    docs: { description: 'e2e のセレクタ・待ち・アサーションの配置先と依存の向きを守らせる' },
    schema: [
      {
        type: 'object',
        properties: {
          fixedWaitAllowedFiles: {
            type: 'array',
            items: { type: 'string' },
            description:
              '固定の待ちを許すファイル。人の入力を待つときのように、画面の状態を条件にできないものだけにする',
          },
          timeoutDefinitionFile: {
            type: 'string',
            description:
              '待つ時間の名前を定めるファイル。ほかのファイルで待つ時間の数値を書くと指摘する。無ければ確認しない',
          },
          screenIdPattern: {
            type: 'string',
            description:
              'widgets/ に書いてはいけない画面 ID の形。正規表現の文字列で、大文字と小文字を区別しない。無ければ確認しない',
          },
          widgetGotoAllowedUrl: {
            type: 'string',
            description: 'widgets/ が goto で開いてよい URL',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: { 'e2e-authoring-rule': '{{ message }}' },
  },
  name: 'e2e-authoring-rule',
  defaultOptions: [{ fixedWaitAllowedFiles: [], widgetGotoAllowedUrl: '/' }],
  create(context, [options]) {
    const FIXED_WAIT_ALLOWED_FILES = options.fixedWaitAllowedFiles
    const TIMEOUT_DEFINITION_FILE = options.timeoutDefinitionFile
    const WIDGET_GOTO_ALLOWED_URL = options.widgetGotoAllowedUrl
    const SCREEN_ID = options.screenIdPattern ? new RegExp(options.screenIdPattern, 'i') : undefined
    const filePath = path.relative(context.cwd, context.filename).split(path.sep).join('/')
    if (!filePath.startsWith(ROOT)) return {}
    const report = (node, message) =>
      context.report({ node, messageId: 'e2e-authoring-rule', data: { message } })
    const inExternalDomDir = filePath.startsWith(EXTERNAL_DOM_DIR)
    const isValueFile = !isSpec(filePath) && specDirOf(filePath) !== undefined

    return {
      'ImportDeclaration, ExportAllDeclaration, ExportNamedDeclaration[source], ImportExpression'(
        node,
      ) {
        const source = node.source.type === 'Literal' ? String(node.source.value) : ''
        if (importsOtherSpecs(filePath, source)) {
          report(
            node,
            'spec を import しない。specs/<dir>/ から import できるのは、同じ specs/<dir>/ の値のファイルだけ。共有する操作は screens/ か widgets/ に出す',
          )
        }
        const typeOnly =
          node.importKind === 'type' || node.specifiers?.every((x) => x.importKind === 'type')
        if (
          node.type === 'ImportDeclaration' &&
          isValueFile &&
          source === '@playwright/test' &&
          !typeOnly
        ) {
          report(
            node,
            'specs/<dir>/ の spec 以外のファイルでは、@playwright/test から型だけを import する。test と expect は spec に書く',
          )
        }
      },

      'Program:exit'(node) {
        if (filePath.startsWith(SPECS) && !isSpec(filePath) && specDirOf(filePath) === undefined) {
          report(
            node,
            'specs/ の直下に spec 以外のファイルを置かない。その dir の spec が共有する値は specs/<dir>/ に置く',
          )
        }
      },

      CallExpression(node) {
        const name = calleeName(node)
        if (isUnder(filePath, 'widgets') && name === 'goto') {
          const target = node.arguments[0]
          if (!(target?.type === 'Literal' && target.value === WIDGET_GOTO_ALLOWED_URL)) {
            report(
              node,
              `widgets/ で画面へ goto しない。開けるのは '${WIDGET_GOTO_ALLOWED_URL}' だけ。画面を開く手順は screens/ か spec に置く`,
            )
          }
        } else if (FIXED_WAITS.includes(name) && !FIXED_WAIT_ALLOWED_FILES.includes(filePath)) {
          report(node, `${name} で固定時間を待たない。何が終わったかを条件にして待つ`)
        } else if (name === 'expect' && isScreenOrWidget(filePath)) {
          report(
            node,
            'screens/ と widgets/ で expect を書かない。結果の確認は spec か setup に置く',
          )
        } else if (name === 'route' && isScreenOrWidget(filePath)) {
          report(node, 'screens/ と widgets/ で route を張らない')
        } else if ([...CSS_LOCATORS, ...TEXT_LOCATORS].includes(name) && !inExternalDomDir) {
          report(
            node,
            `${name} で要素を拾わない。data-testid で拾う(testid の無い要素は selectors/ にまとめる)`,
          )
        } else if (
          VALUE_READERS.includes(name) ||
          (isSpec(filePath) && SPEC_ONLY_VALUE_READERS.includes(name))
        ) {
          report(
            node,
            `${name} で値を読んでから比べない。locator をそのまま expect に渡して待たせる`,
          )
        }
      },

      Literal(node) {
        if (typeof node.value !== 'string') return
        if (node.value === 'networkidle') {
          report(
            node,
            'networkidle に頼らない。読み込みを続ける画面では届かない。API のレスポンスか、要素が出るのを待つ',
          )
        }
        if (SCREEN_ID && isUnder(filePath, 'widgets') && SCREEN_ID.test(node.value)) {
          report(node, 'widgets/ に画面 ID を書かない。testid の接頭辞は引数で受ける')
        }
      },

      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(node) {
        if (!isValueFile) return
        const operates = node.params.some((param) => {
          const p = param.type === 'AssignmentPattern' ? param.left : param
          if (p.typeAnnotation)
            return OPERATION_TYPE.test(context.sourceCode.getText(p.typeAnnotation))
          if (p.type === 'Identifier') return p.name === 'page'
          return p.type === 'ObjectPattern' && p.properties.some((x) => x.key?.name === 'page')
        })
        if (operates)
          report(
            node,
            'specs/<dir>/ の spec 以外のファイルには、値だけを置く。画面の操作は screens/ か widgets/ に出す',
          )
      },

      TemplateElement(node) {
        if (SCREEN_ID && isUnder(filePath, 'widgets') && SCREEN_ID.test(node.value.raw)) {
          report(node, 'widgets/ に画面 ID を書かない。testid の接頭辞は引数で受ける')
        }
      },

      Property(node) {
        const keyName =
          node.key.type === 'Identifier'
            ? node.key.name
            : node.key.type === 'Literal'
              ? String(node.key.value)
              : ''
        if (keyName !== 'timeout') return
        if (
          isSpec(filePath) &&
          node.parent?.type === 'ObjectExpression' &&
          node.parent.parent?.type === 'CallExpression'
        ) {
          report(node, 'spec に timeout を書かない。待ち時間は playwright.config.ts にまとめる')
        } else if (
          TIMEOUT_DEFINITION_FILE &&
          node.value.type === 'Literal' &&
          filePath !== TIMEOUT_DEFINITION_FILE
        ) {
          report(node, `待つ時間は直書きせず、${TIMEOUT_DEFINITION_FILE} の名前で渡す`)
        }
      },
    }
  },
})
