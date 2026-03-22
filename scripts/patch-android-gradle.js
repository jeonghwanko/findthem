#!/usr/bin/env node
/**
 * AGP 9.x 호환 패치
 * npm install 후 자동 실행 (postinstall)
 *
 * 패치 1: proguard-android.txt → proguard-android-optimize.txt
 * 패치 2: kotlin-android 중복 apply 제거 (AGP 9 내장 Kotlin과 충돌)
 * 패치 3: admob buildscript 블록 제거 + kotlin_version ext로 이동
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

function patchFile(relativePath, patchFn) {
  const filePath = resolve(ROOT, relativePath);
  if (!existsSync(filePath)) return false;

  const original = readFileSync(filePath, 'utf8');
  const patched = patchFn(original);
  if (patched === original) return false;

  writeFileSync(filePath, patched, 'utf8');
  return true;
}

let count = 0;

// ── 패치 1: proguard-android.txt → proguard-android-optimize.txt ────────────

const PROGUARD_OLD = "getDefaultProguardFile('proguard-android.txt')";
const PROGUARD_NEW = "getDefaultProguardFile('proguard-android-optimize.txt')";

const proguardTargets = [
  'node_modules/@capacitor-community/admob/android/build.gradle',
  'node_modules/@capgo/capacitor-updater/android/build.gradle',
  'node_modules/capacitor-native-navigation/android/build.gradle',
];

for (const target of proguardTargets) {
  const patched = patchFile(target, (c) => c.replaceAll(PROGUARD_OLD, PROGUARD_NEW));
  if (patched) { console.log(`[patch] proguard ✅ ${target}`); count++; }
}

// ── 패치 2: admob — buildscript 블록 제거 + kotlin_version ext 이동 ──────────

const admobPath = 'node_modules/@capacitor-community/admob/android/build.gradle';
const admobPatched = patchFile(admobPath, (content) => {
  // 이미 패치됐는지 확인
  if (!content.includes("buildscript {") && !content.includes("apply plugin: 'kotlin-android'")) {
    return content;
  }

  let result = content;

  // kotlin_version을 ext 블록으로 이동 (buildscript 안에 있으면)
  if (!result.includes("ext {\n    kotlin_version")) {
    result = result.replace(
      'ext {\n    junitVersion',
      `ext {\n    kotlin_version = project.hasProperty("kotlin_version") ? rootProject.ext.kotlin_version : '2.2.20'\n    junitVersion`
    );
  }

  // buildscript 블록 전체 제거 (중첩 중괄호 포함)
  while (result.includes('buildscript {')) {
    const start = result.indexOf('buildscript {');
    let depth = 0, end = start;
    for (let i = start; i < result.length; i++) {
      if (result[i] === '{') depth++;
      else if (result[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    result = result.slice(0, start) + result.slice(end);
  }

  // apply plugin: 'kotlin-android' 제거
  result = result.replace(/^apply plugin: 'kotlin-android'\n/m, '');

  // kotlinOptions {} 블록 제거 (AGP 9에서 kotlin-android 없으면 android {} 내부에서 사용 불가)
  result = result.replace(/\n?\s*kotlinOptions\s*\{[^}]*\}\n/m, '\n');

  return result;
});
if (admobPatched) { console.log(`[patch] admob kotlin ✅ ${admobPath}`); count++; }

// ── 패치 3: capacitor-native-navigation — kotlin-android 중복 제거 ───────────

const navPath = 'node_modules/capacitor-native-navigation/android/build.gradle';
const navPatched = patchFile(navPath, (content) => {
  // org.jetbrains.kotlin.android 유지, kotlin-android(중복) 제거
  return content.replace(/^apply plugin: 'kotlin-android'\n/m, '');
});
if (navPatched) { console.log(`[patch] native-navigation kotlin ✅ ${navPath}`); count++; }

// ────────────────────────────────────────────────────────────────────────────

if (count === 0) {
  console.log('[patch-android-gradle] 이미 패치됨 또는 대상 없음');
} else {
  console.log(`[patch-android-gradle] ${count}개 파일 패치 완료`);
}
