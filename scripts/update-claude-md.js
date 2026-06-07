#!/usr/bin/env node
// バックアップ前に git diff をもとに CLAUDE.md を自動更新する
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const Anthropic = require('@anthropic-ai/sdk');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_DIR = path.join(__dirname, '..');
const CLAUDE_MD_PATH = path.join(REPO_DIR, 'CLAUDE.md');

function getDiff() {
  // data/ logs/ node_modules/ は除外してソースコードの差分だけ取る
  const excludes = [
    ':(exclude)data/',
    ':(exclude)logs/',
    ':(exclude)node_modules/',
    ':(exclude)CLAUDE.md',
    ':(exclude)package-lock.json',
  ].join(' ');

  try {
    const diff = execSync(`git diff HEAD -- . ${excludes}`, {
      cwd: REPO_DIR, encoding: 'utf8', maxBuffer: 200 * 1024,
    });
    if (diff.trim()) return diff;
  } catch (_) {}

  // HEAD がない（初回コミット前）場合は staged を見る
  try {
    const diff = execSync(`git diff --cached -- . ${excludes}`, {
      cwd: REPO_DIR, encoding: 'utf8', maxBuffer: 200 * 1024,
    });
    return diff;
  } catch (_) {
    return '';
  }
}

async function main() {
  const diff = getDiff();

  if (!diff.trim()) {
    console.log('[update-claude-md] ソースコードの変更なし、スキップします');
    return;
  }

  const claudeMd = fs.readFileSync(CLAUDE_MD_PATH, 'utf8');
  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Singapore',
  }).replace(/\//g, '-');

  console.log('[update-claude-md] CLAUDE.md を更新中...');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: `あなたはsg-weekend-appプロジェクトのメンテナーです。
以下のgit diffを参考に、CLAUDE.mdの内容を現在のコードの状態に合わせて更新してください。

【更新ルール】
1. コードが実際に変わった箇所（型定義・API・ファイル構成・設定値・コマンド等）のみ更新する
2. 末尾の *最終更新:* 行を ${today} に変更し、今回の主な変更点を簡潔に追記する（既存の記述の後ろに / で区切って追加）
3. 推測や意図で書き換えない。diff に根拠がない変更は加えない
4. 追加・削除されたことが明確な項目のみ変更する
5. フォーマット・見出し・表の構造は維持する
6. CLAUDE.md の全文をそのまま出力する（コードブロックで囲まない、前置き・後書きも不要）

<current-claude-md>
${claudeMd}
</current-claude-md>

<git-diff>
${diff.slice(0, 80000)}
</git-diff>`,
    }],
  });

  const updated = response.content[0].text.trim();

  // 最低限の検証：極端に短くなった場合は書き込まない
  if (updated.length < claudeMd.length * 0.5) {
    console.error('[update-claude-md] 出力が短すぎるため書き込みをスキップしました');
    return;
  }

  fs.writeFileSync(CLAUDE_MD_PATH, updated + '\n', 'utf8');
  console.log('[update-claude-md] CLAUDE.md を更新しました');
}

main().catch(err => {
  // バックアップ全体を止めないよう終了コード 0 で終わる
  console.error('[update-claude-md] エラー:', err.message);
  process.exit(0);
});
