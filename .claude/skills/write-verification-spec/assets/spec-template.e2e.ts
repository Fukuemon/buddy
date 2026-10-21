// 証跡を撮る spec のひな形。context/testing/evidence.md にある spec の置き場に写し、<…> を埋める。
// シナリオアウトラインでないシナリオは、CASES を消し、recordEvidence に example を渡さない。
// recordEvidence と variants は、packages/e2e の薄い層(置き場、アプリの値、環境変数を渡すもの)から import する。
import { test, type Page } from '@playwright/test';
import type { Recording } from '<packages/e2e/kit/recording への相対パス>/index.js';
import type { Scenario } from '<packages/e2e/kit/evidence への相対パス>/index.js';
import { recordEvidence, variants } from '<packages/e2e の薄い層>';

// <何を撮るか>。判定は、人が動画を見て行う。字幕の文はシナリオの文を写す
const SCENARIO: Scenario = {
  issue: '<要求の issue 番号>',
  id: '<@scenario-id>',
  actor: '<アクター>',
  // 証跡の格納先のフォルダの名前と同じにする
  no: 0,
  title: '<シナリオ名>',
};

/** シナリオの例の表の行。value は pull request のチェックの「<列>=<値>」の値を写す */
const CASES: { no: number; value: string; expected: string; act: (page: Page) => Promise<void> }[] = [
  {
    no: 1,
    value: '<例の値>',
    expected: '<例の表の、結果の列の文>',
    act: async (page) => {
      // <例の行の操作>
    },
  },
];

const body = async ({ page, step, check }: Recording, c: (typeof CASES)[number]): Promise<void> => {
  await step('前提 <前提の文>');
  // <前提の画面を開く>

  // 操作の間に見る判定の文は、操作の前に 2 行目以降で出す。字幕は次に変えるまで残る
  await step(`もし <操作の文>\nならば ${c.expected}`);
  await c.act(page);
  // その時点の画面で判定できる文は check で出し、静止画を撮る
  await check(`ならば ${c.expected}`);

  // シナリオに無い操作は、前に「(撮影のため、…)」を出してから行う
};

for (const variant of variants()) {
  for (const c of CASES) {
    test(`${variant.label ? `${variant.label}: ` : ''}<アクター>が<画面>で「${c.value}」を行う`, async ({ browser }) => {
      await recordEvidence(
        browser,
        { scenario: SCENARIO, variant, example: { no: c.no, column: '<例の列>', value: c.value } },
        // 録画の外で、ログインとデータの確かめを行う。戻り値は本体に渡る
        async (page) => {
          // <ログインし、前提のデータがあるかを確かめる>
          void page;
        },
        (r) => body(r, c),
      );
    });
  }
}
