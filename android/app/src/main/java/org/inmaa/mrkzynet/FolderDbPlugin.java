package org.inmaa.mrkzynet;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.provider.DocumentsContract.Document;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * «مجلد قاعدة البيانات» — يتيح للمستخدم اختيار مجلد في ذاكرة الهاتف أو على بطاقة
 * الذاكرة (SD) عبر Storage Access Framework، ثم القراءة والكتابة داخله فقط.
 *
 * - لا يحتاج صلاحية «كل الملفات» ولا الإنترنت.
 * - الصلاحية دائمة (takePersistableUriPermission) وتبقى بعد إعادة تشغيل الجهاز.
 * - الكتابة الآمنة: ملف مؤقت (.tmp) ثم حذف القديم وإعادة التسمية، حتى لا يبقى ملف
 *   نصف مكتوب إن انقطعت الكتابة.
 *
 * الواجهة في JavaScript: src/offline/native/folderDbPlugin.ts
 */
@CapacitorPlugin(name = "FolderDb")
public class FolderDbPlugin extends Plugin {

    private static final String TAG = "FolderDb";
    private static final String PREFS = "mrkzy_folder_db";
    private static final String KEY_TREE_URI = "tree_uri";
    private static final String MIME_BINARY = "application/octet-stream";
    private static final String EXTERNAL_STORAGE_AUTHORITY = "com.android.externalstorage.documents";

    /** معرّفات المجلدات الفرعية (المسار النسبي ← معرّف المستند) لتسريع الوصول. */
    private final Map<String, String> dirCache = new HashMap<>();

    @Override
    public void load() {
        super.load();
        // عرض صور وفيديو المجلد مع دعم التقديم/التأخير في الفيديو (طلبات النطاق).
        // يُستدعى قبل تهيئة WebView فيعتمده Capacitor من البداية.
        bridge.setWebViewClient(new MediaRangeWebViewClient(bridge));
    }

    // ================= أدوات عامة =================

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private ContentResolver resolver() {
        return getContext().getContentResolver();
    }

    private Uri getTreeUri() {
        String value = prefs().getString(KEY_TREE_URI, null);
        return value == null ? null : Uri.parse(value);
    }

    private Uri requireTree() throws IOException {
        Uri tree = getTreeUri();
        if (tree == null) throw new IOException("لم يُختر مجلد قاعدة البيانات بعد");
        return tree;
    }

    private static String[] splitPath(String path) throws IOException {
        List<String> parts = new ArrayList<>();
        if (path != null) {
            for (String p : path.split("/")) {
                String t = p.trim();
                if (t.isEmpty() || t.equals(".")) continue;
                if (t.equals("..")) throw new IOException("مسار غير مسموح: " + path);
                parts.add(t);
            }
        }
        return parts.toArray(new String[0]);
    }

    private static String joinPath(String[] parts, int count) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < count; i++) {
            if (i > 0) sb.append('/');
            sb.append(parts[i]);
        }
        return sb.toString();
    }

    private Uri docUri(Uri tree, String docId) {
        return DocumentsContract.buildDocumentUriUsingTree(tree, docId);
    }

    private static int flagsRW() {
        return Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
    }

    // ================= معلومات المجلد =================

    private boolean hasPersistedPermission(Uri tree) {
        for (UriPermission p : resolver().getPersistedUriPermissions()) {
            if (p.getUri().equals(tree) && p.isReadPermission() && p.isWritePermission()) return true;
        }
        return false;
    }

    private String queryDisplayName(Uri uri) {
        try (Cursor c = resolver().query(uri, new String[] { Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception e) {
            Logger.debug(TAG, "queryDisplayName failed: " + e.getMessage());
        }
        return null;
    }

    private boolean rootAccessible(Uri tree) {
        try {
            String rootId = DocumentsContract.getTreeDocumentId(tree);
            try (
                Cursor c = resolver()
                    .query(docUri(tree, rootId), new String[] { Document.COLUMN_DOCUMENT_ID }, null, null, null)
            ) {
                return c != null && c.moveToFirst();
            }
        } catch (Exception e) {
            return false;
        }
    }

    private static String describePath(Uri tree, String rootId, String displayName) {
        if (!EXTERNAL_STORAGE_AUTHORITY.equals(tree.getAuthority())) {
            return displayName != null ? displayName : rootId;
        }
        int colon = rootId.indexOf(':');
        String volume = colon >= 0 ? rootId.substring(0, colon) : "";
        String rel = colon >= 0 ? rootId.substring(colon + 1) : rootId;
        String base;
        if ("primary".equals(volume)) {
            base = "ذاكرة الهاتف";
        } else if ("home".equals(volume)) {
            base = "المستندات";
        } else if (volume.matches("[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}")) {
            base = "بطاقة الذاكرة SD (" + volume + ")";
        } else {
            base = volume;
        }
        if (rel.isEmpty()) return base;
        return base.isEmpty() ? rel : base + "/" + rel;
    }

    private JSObject folderInfo(Uri tree) {
        JSObject o = new JSObject();
        String rootId = DocumentsContract.getTreeDocumentId(tree);
        boolean accessible = hasPersistedPermission(tree) && rootAccessible(tree);
        String name = accessible ? queryDisplayName(docUri(tree, rootId)) : null;
        if (name == null) {
            int slash = rootId.lastIndexOf('/');
            int colon = rootId.lastIndexOf(':');
            name = rootId.substring(Math.max(slash, colon) + 1);
        }
        boolean primary = rootId.startsWith("primary:") || rootId.startsWith("home:");
        boolean local = EXTERNAL_STORAGE_AUTHORITY.equals(tree.getAuthority());
        o.put("uri", tree.toString());
        o.put("name", name);
        o.put("path", describePath(tree, rootId, name));
        o.put("hasPermission", accessible);
        o.put("removable", local && !primary);
        // false: المجلد من مزوّد آخر (خدمة سحابية مثلاً) وليس ذاكرة الهاتف أو بطاقة SD.
        o.put("local", local);
        return o;
    }

    // ================= اختيار المجلد =================

    @PluginMethod
    public void getFolder(PluginCall call) {
        try {
            Uri tree = getTreeUri();
            JSObject ret = new JSObject();
            ret.put("folder", tree == null ? JSONObject.NULL : folderInfo(tree));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("تعذّر قراءة المجلد المحفوظ: " + e.getMessage(), "FOLDER_ERROR", e);
        }
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(flagsRW() | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Uri current = getTreeUri();
                Uri initial = current != null
                    ? docUri(current, DocumentsContract.getTreeDocumentId(current))
                    : DocumentsContract.buildDocumentUri(EXTERNAL_STORAGE_AUTHORITY, "primary:Documents");
                intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, initial);
            } catch (Exception ignored) {
                // المجلد المقترح اختياري
            }
        }
        try {
            startActivityForResult(call, intent, "pickFolderResult");
        } catch (ActivityNotFoundException e) {
            call.reject("لا يوجد في هذا الجهاز تطبيق لاختيار المجلدات (مدير الملفات)", "NO_PICKER", e);
        }
    }

    @ActivityCallback
    private void pickFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("تم إلغاء اختيار المجلد", "CANCELLED");
            return;
        }
        Uri tree = data.getData();
        try {
            resolver().takePersistableUriPermission(tree, flagsRW());
        } catch (SecurityException e) {
            call.reject("تعذّر الحصول على صلاحية دائمة للمجلد: " + e.getMessage(), "PERMISSION", e);
            return;
        }
        Uri old = getTreeUri();
        if (old != null && !old.equals(tree)) {
            try {
                resolver().releasePersistableUriPermission(old, flagsRW());
            } catch (Exception ignored) {
                // لا شيء
            }
        }
        prefs().edit().putString(KEY_TREE_URI, tree.toString()).apply();
        synchronized (dirCache) {
            dirCache.clear();
        }
        JSObject ret = new JSObject();
        ret.put("folder", folderInfo(tree));
        call.resolve(ret);
    }

    @PluginMethod
    public void forgetFolder(PluginCall call) {
        Uri tree = getTreeUri();
        if (tree != null) {
            try {
                resolver().releasePersistableUriPermission(tree, flagsRW());
            } catch (Exception ignored) {
                // لا شيء
            }
        }
        prefs().edit().remove(KEY_TREE_URI).apply();
        synchronized (dirCache) {
            dirCache.clear();
        }
        call.resolve();
    }

    // ================= التنقل داخل المجلد =================

    /** يبحث عن عنصر بالاسم داخل مجلد ويعيد معرّفه، أو null. */
    private String findChild(Uri tree, String parentId, String name) throws IOException {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId);
        try (
            Cursor c = resolver()
                .query(children, new String[] { Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME }, null, null, null)
        ) {
            if (c == null) throw new IOException("تعذّر قراءة محتويات المجلد");
            while (c.moveToNext()) {
                if (name.equals(c.getString(1))) return c.getString(0);
            }
        }
        return null;
    }

    /** يعيد معرّف مجلد فرعي (أو الجذر)، مع إنشائه عند الطلب. null إن لم يوجد. */
    private String resolveDir(Uri tree, String[] parts, int count, boolean create) throws IOException {
        String current = DocumentsContract.getTreeDocumentId(tree);
        for (int i = 0; i < count; i++) {
            String key = joinPath(parts, i + 1);
            String cached;
            synchronized (dirCache) {
                cached = dirCache.get(key);
            }
            if (cached != null) {
                current = cached;
                continue;
            }
            String child = findChild(tree, current, parts[i]);
            if (child == null) {
                if (!create) return null;
                Uri created = DocumentsContract.createDocument(resolver(), docUri(tree, current), Document.MIME_TYPE_DIR, parts[i]);
                if (created == null) throw new IOException("تعذّر إنشاء المجلد: " + parts[i]);
                child = DocumentsContract.getDocumentId(created);
            }
            synchronized (dirCache) {
                dirCache.put(key, child);
            }
            current = child;
        }
        return current;
    }

    /** كل عناصر مجلد (الاسم ← المعرّف) باستعلام واحد. */
    private Map<String, String> listChildIds(Uri tree, String parentId) throws IOException {
        Map<String, String> out = new HashMap<>();
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId);
        try (
            Cursor c = resolver()
                .query(children, new String[] { Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME }, null, null, null)
        ) {
            if (c == null) throw new IOException("تعذّر قراءة محتويات المجلد");
            while (c.moveToNext()) {
                String childName = c.getString(1);
                if (childName != null && !out.containsKey(childName)) out.put(childName, c.getString(0));
            }
        }
        return out;
    }

    /**
     * ينشئ ملفاً بالاسم المطلوب حرفياً. قد يضيف النظام امتداداً للاسم إن لم يطابق
     * نوع الملف (مثلاً «x.mp4» بنوع video/quicktime ← «x.mp4.mov») فلا يعثر التطبيق
     * على الملف بعدها؛ لذلك ننشئه بنوع عام ثم نتحقق من الاسم ونصححه إن لزم.
     */
    private Uri createFileExact(Uri tree, String parentId, String name) throws IOException {
        Uri created = DocumentsContract.createDocument(resolver(), docUri(tree, parentId), MIME_BINARY, name);
        if (created == null) throw new IOException("تعذّر إنشاء الملف: " + name);
        String actual = queryDisplayName(created);
        if (actual == null || name.equals(actual)) return created;
        try {
            Uri renamed = DocumentsContract.renameDocument(resolver(), created, name);
            if (renamed != null) {
                created = renamed;
                if (name.equals(queryDisplayName(renamed))) return renamed;
            }
        } catch (Exception e) {
            Logger.debug(TAG, "rename after create failed: " + e.getMessage());
        }
        try {
            DocumentsContract.deleteDocument(resolver(), created);
        } catch (Exception ignored) {
            // أفضل محاولة
        }
        throw new IOException("غيّر نظام الملفات اسم الملف من «" + name + "» إلى «" + actual + "»");
    }

    private String resolveFile(Uri tree, String path) throws IOException {
        String[] parts = splitPath(path);
        if (parts.length == 0) throw new IOException("مسار ملف غير صالح");
        String parent = resolveDir(tree, parts, parts.length - 1, false);
        if (parent == null) return null;
        return findChild(tree, parent, parts[parts.length - 1]);
    }

    private byte[] readBytes(Uri uri) throws IOException {
        try (InputStream in = resolver().openInputStream(uri)) {
            if (in == null) throw new IOException("تعذّر فتح الملف للقراءة");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[64 * 1024];
            int n;
            while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            return out.toByteArray();
        }
    }

    /** يكتب البايتات ويستبدل المحتوى السابق بالكامل، مع مزامنة القرص إن أمكن. */
    private void writeBytes(Uri uri, byte[] bytes) throws IOException {
        ParcelFileDescriptor pfd = null;
        try {
            try {
                pfd = resolver().openFileDescriptor(uri, "wt");
            } catch (IllegalArgumentException | FileNotFoundException e) {
                pfd = null;
            }
            if (pfd != null) {
                // الوضع "wt" يفرّغ الملف قبل الكتابة (الوضع "w" وحده لا يضمن ذلك على كل الإصدارات).
                try (FileOutputStream fos = new FileOutputStream(pfd.getFileDescriptor())) {
                    fos.write(bytes);
                    fos.flush();
                    try {
                        fos.getFD().sync();
                    } catch (IOException ignored) {
                        // بعض المزوّدات لا تدعم sync
                    }
                }
                return;
            }
            try (OutputStream os = resolver().openOutputStream(uri, "w")) {
                if (os == null) throw new IOException("تعذّر فتح الملف للكتابة");
                os.write(bytes);
                os.flush();
            }
        } finally {
            if (pfd != null) {
                try {
                    pfd.close();
                } catch (IOException ignored) {
                    // لا شيء
                }
            }
        }
    }

    private void deleteDoc(Uri tree, String docId) throws IOException {
        try {
            DocumentsContract.deleteDocument(resolver(), docUri(tree, docId));
        } catch (FileNotFoundException e) {
            // محذوف مسبقاً
        }
    }

    private void writeFileInternal(Uri tree, String path, byte[] bytes, boolean atomic) throws IOException {
        String[] parts = splitPath(path);
        if (parts.length == 0) throw new IOException("مسار ملف غير صالح");
        String name = parts[parts.length - 1];
        String parentId = resolveDir(tree, parts, parts.length - 1, true);

        if (!atomic) {
            String existing = findChild(tree, parentId, name);
            Uri target = existing != null ? docUri(tree, existing) : createFileExact(tree, parentId, name);
            writeBytes(target, bytes);
            return;
        }

        // 1) كتابة ملف مؤقت كامل
        String tmpName = name + ".tmp";
        String staleTmp = findChild(tree, parentId, tmpName);
        if (staleTmp != null) deleteDoc(tree, staleTmp);
        Uri tmpUri = createFileExact(tree, parentId, tmpName);
        writeBytes(tmpUri, bytes);

        // 2) حذف القديم ثم 3) إعادة تسمية المؤقت
        String existing = findChild(tree, parentId, name);
        if (existing != null) deleteDoc(tree, existing);
        Uri renamed = null;
        try {
            renamed = DocumentsContract.renameDocument(resolver(), tmpUri, name);
        } catch (Exception e) {
            Logger.debug(TAG, "renameDocument failed, falling back: " + e.getMessage());
        }
        if (renamed != null && name.equals(queryDisplayName(renamed))) return;

        // احتياط: بعض المزوّدات لا تدعم إعادة التسمية — نكتب الملف مباشرة أولاً، ولا
        // نحذف المؤقت إلا بعد نجاح الكتابة، حتى توجد نسخة كاملة في كل لحظة.
        String again = findChild(tree, parentId, name);
        Uri target = again != null ? docUri(tree, again) : createFileExact(tree, parentId, name);
        writeBytes(target, bytes);
        Uri leftover = renamed != null ? renamed : tmpUri;
        try {
            String leftoverId = DocumentsContract.getDocumentId(leftover);
            String targetId = DocumentsContract.getDocumentId(target);
            if (!leftoverId.equals(targetId)) DocumentsContract.deleteDocument(resolver(), leftover);
        } catch (Exception ignored) {
            // يبقى ملف .tmp كامل — لا ضرر، ويُحذف في الكتابة التالية
        }
    }

    /** ينفّذ العملية، وعند الفشل يمسح ذاكرة المجلدات ويعيد المحاولة مرة واحدة. */
    private interface IoTask {
        void run() throws Exception;
    }

    private void withRetry(PluginCall call, String errorPrefix, IoTask task) {
        try {
            task.run();
        } catch (Exception first) {
            synchronized (dirCache) {
                dirCache.clear();
            }
            try {
                task.run();
            } catch (SecurityException e) {
                call.reject(errorPrefix + ": لا توجد صلاحية على المجلد — أعد اختياره من شاشة «قاعدة البيانات»", "PERMISSION", e);
            } catch (Exception e) {
                String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                call.reject(errorPrefix + ": " + msg, "IO_ERROR", e);
            }
        }
    }

    // ================= العمليات =================

    @PluginMethod
    public void readTopLevel(PluginCall call) {
        withRetry(call, "تعذّرت قراءة المجلد", () -> {
            Uri tree = requireTree();
            JSONArray suffixesJson = call.getArray("suffixes", new JSArray());
            List<String> suffixes = new ArrayList<>();
            for (int i = 0; i < suffixesJson.length(); i++) suffixes.add(suffixesJson.getString(i));

            String rootId = DocumentsContract.getTreeDocumentId(tree);
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, rootId);
            JSArray files = new JSArray();
            try (
                Cursor c = resolver()
                    .query(
                        children,
                        new String[] { Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE },
                        null,
                        null,
                        null
                    )
            ) {
                if (c == null) throw new IOException("تعذّر قراءة محتويات المجلد");
                while (c.moveToNext()) {
                    String id = c.getString(0);
                    String name = c.getString(1);
                    String mime = c.getString(2);
                    if (name == null || Document.MIME_TYPE_DIR.equals(mime)) continue;
                    boolean match = false;
                    for (String s : suffixes) {
                        if (name.endsWith(s)) {
                            match = true;
                            break;
                        }
                    }
                    if (!match) continue;
                    byte[] bytes = readBytes(docUri(tree, id));
                    JSObject f = new JSObject();
                    f.put("name", name);
                    f.put("data", new String(bytes, StandardCharsets.UTF_8));
                    files.put(f);
                }
            }
            JSObject ret = new JSObject();
            ret.put("files", files);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        String path = call.getString("path", "");
        String encoding = call.getString("encoding", "utf8");
        withRetry(call, "تعذّرت قراءة الملف " + path, () -> {
            Uri tree = requireTree();
            String id = resolveFile(tree, path);
            JSObject ret = new JSObject();
            if (id == null) {
                ret.put("exists", false);
                call.resolve(ret);
                return;
            }
            byte[] bytes = readBytes(docUri(tree, id));
            ret.put("exists", true);
            ret.put(
                "data",
                "base64".equals(encoding) ? Base64.encodeToString(bytes, Base64.NO_WRAP) : new String(bytes, StandardCharsets.UTF_8)
            );
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        String path = call.getString("path", "");
        String data = call.getString("data", "");
        String encoding = call.getString("encoding", "utf8");
        boolean atomic = Boolean.TRUE.equals(call.getBoolean("atomic", false));
        final byte[] bytes;
        try {
            bytes = "base64".equals(encoding) ? Base64.decode(data, Base64.DEFAULT) : data.getBytes(StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            call.reject("بيانات الملف غير صالحة", "BAD_DATA", e);
            return;
        }
        withRetry(call, "تعذّرت الكتابة في " + path, () -> {
            writeFileInternal(requireTree(), path, bytes, atomic);
            call.resolve();
        });
    }

    /**
     * يُلحق بيانات (base64) بنهاية ملف موجود — لكتابة الملفات الكبيرة (فيديو) على
     * دفعات صغيرة بدل تمرير الملف كاملاً عبر الجسر دفعة واحدة.
     */
    @PluginMethod
    public void appendFile(PluginCall call) {
        String path = call.getString("path", "");
        String data = call.getString("data", "");
        final byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("بيانات الملف غير صالحة", "BAD_DATA", e);
            return;
        }
        try {
            Uri tree = requireTree();
            String id = resolveFile(tree, path);
            if (id == null) throw new IOException("الملف غير موجود: " + path);
            try (OutputStream os = resolver().openOutputStream(docUri(tree, id), "wa")) {
                if (os == null) throw new IOException("تعذّر فتح الملف للإلحاق");
                os.write(bytes);
                os.flush();
            }
            call.resolve();
        } catch (SecurityException e) {
            call.reject("تعذّرت الكتابة في " + path + ": لا توجد صلاحية على المجلد", "PERMISSION", e);
        } catch (Exception e) {
            synchronized (dirCache) {
                dirCache.clear();
            }
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            call.reject("تعذّرت الكتابة في " + path + ": " + msg, "IO_ERROR", e);
        }
    }

    /** يُشعر JavaScript عند انتقال التطبيق للخلفية ليحفظ أي تعديل معلّق فوراً. */
    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        notifyListeners("appPause", new JSObject());
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        String path = call.getString("path", "");
        withRetry(call, "تعذّر حذف " + path, () -> {
            Uri tree = requireTree();
            String id = resolveFile(tree, path);
            if (id != null) deleteDoc(tree, id);
            call.resolve();
        });
    }

    @PluginMethod
    public void listDir(PluginCall call) {
        String path = call.getString("path", "");
        withRetry(call, "تعذّرت قراءة المجلد " + path, () -> {
            Uri tree = requireTree();
            String[] parts = splitPath(path);
            String dirId = resolveDir(tree, parts, parts.length, false);
            JSArray entries = new JSArray();
            if (dirId != null) {
                Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, dirId);
                try (
                    Cursor c = resolver()
                        .query(
                            children,
                            new String[] {
                                Document.COLUMN_DISPLAY_NAME,
                                Document.COLUMN_MIME_TYPE,
                                Document.COLUMN_SIZE,
                                Document.COLUMN_LAST_MODIFIED
                            },
                            null,
                            null,
                            null
                        )
                ) {
                    if (c != null) {
                        while (c.moveToNext()) {
                            JSObject e = new JSObject();
                            e.put("name", c.getString(0));
                            e.put("isDir", Document.MIME_TYPE_DIR.equals(c.getString(1)));
                            e.put("size", c.isNull(2) ? 0 : c.getLong(2));
                            e.put("lastModified", c.isNull(3) ? 0 : c.getLong(3));
                            entries.put(e);
                        }
                    }
                }
            }
            JSObject ret = new JSObject();
            ret.put("entries", entries);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void getFileUri(PluginCall call) {
        String path = call.getString("path", "");
        withRetry(call, "تعذّر الوصول إلى " + path, () -> {
            Uri tree = requireTree();
            String id = resolveFile(tree, path);
            JSObject ret = new JSObject();
            ret.put("uri", id == null ? JSONObject.NULL : docUri(tree, id).toString());
            call.resolve(ret);
        });
    }

    /**
     * روابط content:// لعدة ملفات دفعة واحدة (معرض الوسائط): يُقرأ كل مجلد مرة واحدة
     * بدل استعلام لكل صورة — الفرق كبير عند وجود مئات الصور.
     */
    @PluginMethod
    public void getFileUris(PluginCall call) {
        JSONArray paths = call.getArray("paths", new JSArray());
        withRetry(call, "تعذّر الوصول إلى ملفات الوسائط", () -> {
            Uri tree = requireTree();
            Map<String, Map<String, String>> listings = new HashMap<>();
            JSArray uris = new JSArray();
            for (int i = 0; i < paths.length(); i++) {
                String uri = null;
                String[] parts;
                try {
                    parts = splitPath(paths.optString(i, ""));
                } catch (IOException e) {
                    parts = new String[0]; // مسار غير مسموح ← غير موجود
                }
                if (parts.length > 0) {
                    String dirKey = joinPath(parts, parts.length - 1);
                    Map<String, String> children = listings.get(dirKey);
                    if (children == null) {
                        String dirId = resolveDir(tree, parts, parts.length - 1, false);
                        children = dirId == null ? new HashMap<String, String>() : listChildIds(tree, dirId);
                        listings.put(dirKey, children);
                    }
                    String id = children.get(parts[parts.length - 1]);
                    if (id != null) uri = docUri(tree, id).toString();
                }
                uris.put(uri == null ? JSONObject.NULL : uri);
            }
            JSObject ret = new JSObject();
            ret.put("uris", uris);
            call.resolve(ret);
        });
    }
}
