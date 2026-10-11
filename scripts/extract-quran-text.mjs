#!/usr/bin/env node
/**
 * استخراج نص المصحف الشريف (الرواية العثمانية) وتوليد ملف بيانات التطبيق.
 * -------------------------------------------------------------------------
 * يُنتج الملف: `public/quran/uthmani.json` المستخدَم في توليد أسئلة "اقرأ من
 * قوله تعالى ... إلى قوله تعالى ..." من صفحة أسئلة الاختبارات.
 *
 * مكوّنات الملف الناتج:
 *   - surahs      : ١١٤ مصفوفة، كل واحدة نصوص آيات السورة (٦٢٣٦ آية).
 *   - juzStarts   : رقم الآية (١‏-‏٦٢٣٦) التي يبدأ بها كل جزء من الأجزاء الـ٣٠.
 *   - pages       : رقم صفحة مصحف المدينة لكل آية (٦٢٣٦ صفحة/آية).
 *   - totalAyahs  : ٦٢٣٦.
 *
 * مصدر النص: حزمة `quran-json` (نص تَنزيل العثماني — نفس ترقيم المصحف الكوفي:
 * الفاتحة ٧ آيات بإحصاء البسملة، ولا بسملة في أول براءة).
 * مصدر أرقام الأجزاء والصفحات: حزمة `quran-meta` (بيانات QUL، رواية حفص).
 *
 * التشغيل:  npm run quran:extract
 * (يحتاج اتصالًا بالإنترنت في أول مرة فقط إن لم تكن حزمة quran-json مثبَّتة.)
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SOURCE_PKG = "quran-json";
const SOURCE_VERSION = "3.1.2";
const TARBALL_URL = `https://registry.npmjs.org/${SOURCE_PKG}/-/${SOURCE_PKG}-${SOURCE_VERSION}.tgz`;

const OUT_FILE = path.join(ROOT, "public/quran/uthmani.json");
const SURAH_DATA_FILE = path.join(ROOT, "src/utils/quranData.ts");
const TOTAL_AYAHS = 6236;

const log = (...args) => console.log("[quran:extract]", ...args);

/** أسماء السور وعدد آياتها من src/utils/quranData.ts (مصدر واحد للحقيقة). */
async function readSurahMeta() {
  const src = await readFile(SURAH_DATA_FILE, "utf8");
  const re = /\{\s*number:\s*(\d+),\s*name:\s*"([^"]+)",\s*ayahCount:\s*(\d+)\s*\}/g;
  const list = [];
  let m;
  while ((m = re.exec(src))) {
    list.push({ number: Number(m[1]), name: m[2], ayahCount: Number(m[3]) });
  }
  if (list.length !== 114) {
    throw new Error(`تعذّر قراءة أسماء السور من ${SURAH_DATA_FILE} (وجدت ${list.length})`);
  }
  return list;
}

/** استخراج ملف واحد من أرشيف tar.gz بدون أي حزمة خارجية. */
function extractFromTarGz(buffer, wantedPath) {
  const tar = zlib.gunzipSync(buffer);
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    const rawName = header.subarray(0, 100).toString("utf8");
    if (!rawName.replace(/\0/g, "").trim()) break; // نهاية الأرشيف
    const name = rawName.replace(/\0.*$/, "");
    const size =
      parseInt(header.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim(), 8) || 0;
    const typeFlag = String.fromCharCode(header[156] || 48);
    const dataStart = offset + 512;
    const isFile = typeFlag === "0" || typeFlag === "\0";
    if (isFile && (name === wantedPath || name.endsWith(wantedPath))) {
      return tar.subarray(dataStart, dataStart + size);
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return null;
}

/** يجلب نص المصحف من المصدر المحلي إن وُجد، وإلا حمّله من حزمة npm المثبَّتة الإصدار. */
async function loadSourceQuran({ forceDownload = false } = {}) {
  const local = path.join(ROOT, "node_modules", SOURCE_PKG, "dist", "quran.json");
  if (!forceDownload && existsSync(local)) {
    log(`قراءة النص من الحزمة المحلية: ${path.relative(ROOT, local)}`);
    return JSON.parse(await readFile(local, "utf8"));
  }
  log(`تنزيل النص من ${TARBALL_URL} …`);
  const res = await fetch(TARBALL_URL);
  if (!res.ok) throw new Error(`فشل التنزيل (${res.status}) — ${TARBALL_URL}`);
  const tarball = Buffer.from(await res.arrayBuffer());
  const file = extractFromTarGz(tarball, "package/dist/quran.json");
  if (!file) throw new Error("لم يُعثر على dist/quran.json داخل الأرشيف");
  return JSON.parse(file.toString("utf8"));
}

/** أرقام الأجزاء والصفحات لكل آية عبر quran-meta (رواية حفص). */
async function readJuzAndPages(surahList) {
  const { createHafs } = await import("quran-meta");
  const hafs = createHafs();
  const juzStarts = new Array(30).fill(0);
  const pages = new Array(TOTAL_AYAHS);
  let cursor = 0; // موضع الآية داخل مصفوفة السور (0-based)
  let id = 1; // رقم الآية العام (1-based) — نفس ترقيم quran-meta
  for (let s = 0; s < surahList.length; s++) {
    const surahNo = surahList[s].number;
    for (let ayahNo = 1; ayahNo <= surahList[s].ayahCount; ayahNo++, cursor++, id++) {
      const meta = hafs.getAyahMeta(id);
      if (meta.surah !== surahNo || meta.ayah !== ayahNo) {
        throw new Error(
          `عدم تطابق ترقيم quran-meta عند ${surahNo}:${ayahNo} (id ${id} ← ${meta.surah}:${meta.ayah})`,
        );
      }
      pages[cursor] = meta.page;
      if (meta.isStartOfJuz) juzStarts[meta.juz - 1] = id;
    }
  }
  if (juzStarts.some((x) => !x)) throw new Error("تعذّر تحديد بدايات الأجزاء الثلاثين");
  return { juzStarts, pages };
}

async function main() {
  const forceDownload = process.argv.includes("--download");
  const surahList = await readSurahMeta();
  const source = await loadSourceQuran({ forceDownload });

  // التحقق: العدد الكلي وعدد آيات كل سورة
  const flat = [];
  for (const surah of source) {
    if (
      !Array.isArray(surah?.verses) ||
      surah.verses.length !== surahList[surah.id - 1].ayahCount
    ) {
      throw new Error(`عدد آيات السورة ${surah?.id} (${surah?.verses?.length}) لا يطابق المتوقع`);
    }
    flat.push(surah.verses.map((v) => String(v.text).trim()));
  }
  const total = flat.reduce((acc, v) => acc + v.length, 0);
  if (total !== TOTAL_AYAHS) throw new Error(`مجموع الآيات ${total} ≠ ${TOTAL_AYAHS}`);

  const { juzStarts, pages } = await readJuzAndPages(surahList);

  const payload = {
    format: "mrkzy-quran-uthmani/1",
    script: "uthmani",
    source: `${SOURCE_PKG}@${SOURCE_VERSION} + quran-meta`,
    totalAyahs: TOTAL_AYAHS,
    juzStarts,
    pages,
    surahs: flat,
  };

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(payload), "utf8");
  const chars = flat.reduce((acc, v) => acc + v.join("").length, 0);
  log(`تم توليد ${path.relative(ROOT, OUT_FILE)}`);
  log(`  السور: ${flat.length} — الآيات: ${total} — الأحرف: ${chars.toLocaleString("ar-EG")}`);
  log(`  بدايات الأجزاء: ${juzStarts.join(", ")}`);
  log(`  الصفحات: 1 → ${pages[pages.length - 1]}`);
}

void main().catch((err) => {
  console.error("[quran:extract] فشل:", err.message);
  process.exitCode = 1;
});
