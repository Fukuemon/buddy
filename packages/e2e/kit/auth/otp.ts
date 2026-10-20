import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

/**
 * 人がファイルに書いた認証コードを読む readOtp を作る。コードはメールで届くので、プログラムからは読めない。
 * `<dir>/otp-<key>.txt` にコードが書かれるまで待ち、読んだら消す。
 *
 * @param timeoutMs コードが書かれるのを待つミリ秒。無ければ 30 分。過ぎたら例外を投げる
 */
export const otpFromFile =
  (dir: string, timeoutMs = 1_800_000) =>
  async (key: string): Promise<string> => {
    mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `otp-${key}.txt`)
    rmSync(file, { force: true })
    console.log(`認証コードを待っている: ${file} にコードを書く`)
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (existsSync(file)) {
        const code = readFileSync(file, 'utf8').trim()
        rmSync(file)
        if (code) return code
      }
      // 人がファイルに書くのを待つので、画面の状態を条件にできない
      await new Promise((r) => setTimeout(r, 2_000))
    }
    throw new Error(`認証コードが ${timeoutMs / 1000} 秒のうちに書かれなかった: ${file}`)
  }
