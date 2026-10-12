package org.inmaa.mrkzynet;

import android.content.ContentResolver;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.Logger;
import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * يعرض صور وفيديو مجلد قاعدة البيانات داخل التطبيق مع دعم صحيح لطلبات النطاق
 * (HTTP Range) — حتى يعمل تشغيل الفيديو والتقديم/التأخير فيه.
 *
 * يحوّل Capacitor روابط content:// إلى https://localhost/_capacitor_content_/...
 * لكن خادمه المحلي يردّ على طلب «من البايت X» بمحتوى الملف من أوله؛ فيفشل
 * التقديم في الفيديو، ولا تعمل أصلاً مقاطع الهاتف التي يكون فهرسها (moov) في نهاية
 * الملف. هنا نخدم هذه الروابط بأنفسنا: نقفز إلى بداية النطاق المطلوب ونرسل طوله
 * الصحيح (206 Partial Content). باقي الطلبات تذهب إلى Capacitor كما هي.
 *
 * يُركَّب من FolderDbPlugin.load().
 */
public class MediaRangeWebViewClient extends BridgeWebViewClient {

    private static final String TAG = "FolderDbMedia";
    private static final Pattern SINGLE_RANGE = Pattern.compile("^bytes=(\\d*)-(\\d*)$");

    private final Bridge bridge;

    public MediaRangeWebViewClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        WebResourceResponse media = serveContent(request);
        return media != null ? media : super.shouldInterceptRequest(view, request);
    }

    private WebResourceResponse serveContent(WebResourceRequest request) {
        Uri url = request.getUrl();
        String encodedPath = url.getEncodedPath();
        if (encodedPath == null || !encodedPath.startsWith(Bridge.CAPACITOR_CONTENT_START + "/")) return null;
        if (!"GET".equalsIgnoreCase(request.getMethod())) return null;
        String host = url.getHost();
        String localHost = bridge.getHost();
        if (host == null || localHost == null || !host.equalsIgnoreCase(localHost)) return null;

        // نفس تحويل Capacitor العكسي، مع الإبقاء على الترميز (%3A و%2F في معرّف المستند).
        Uri contentUri = Uri.parse("content:/" + encodedPath.substring(Bridge.CAPACITOR_CONTENT_START.length()));
        try {
            return open(contentUri, header(request, "Range"));
        } catch (FileNotFoundException e) {
            return status(404, "Not Found");
        } catch (SecurityException e) {
            Logger.warn(TAG, "no permission for " + contentUri + ": " + e.getMessage());
            return status(403, "Forbidden");
        } catch (Exception e) {
            Logger.error(TAG, "failed to serve " + contentUri, e);
            return status(500, "Internal Server Error");
        }
    }

    private WebResourceResponse open(Uri contentUri, String range) throws IOException {
        ContentResolver resolver = bridge.getContext().getContentResolver();
        String mimeType = mimeTypeOf(resolver, contentUri);
        ParcelFileDescriptor pfd = resolver.openFileDescriptor(contentUri, "r");
        if (pfd == null) throw new FileNotFoundException(contentUri.toString());
        long total = pfd.getStatSize(); // -1 إن لم يكن ملفاً عادياً (لا يمكن القفز داخله)
        FileInputStream in = new ParcelFileDescriptor.AutoCloseInputStream(pfd);

        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");

        long start = 0;
        long end = total - 1;
        boolean partial = false;
        if (range != null && total >= 0) {
            headers.put("Accept-Ranges", "bytes");
            Matcher m = SINGLE_RANGE.matcher(range.trim());
            boolean matched = m.matches();
            String first = matched ? m.group(1) : "";
            String last = matched ? m.group(2) : "";
            boolean valid = !first.isEmpty() || !last.isEmpty();
            if (valid) {
                try {
                    if (first.isEmpty()) {
                        // bytes=-N : آخر N بايت
                        start = Math.max(0, total - Long.parseLong(last));
                    } else {
                        start = Long.parseLong(first);
                        if (!last.isEmpty()) {
                            long lastByte = Long.parseLong(last);
                            if (lastByte < start) valid = false;
                            else end = Math.min(lastByte, total - 1);
                        }
                    }
                } catch (NumberFormatException e) {
                    valid = false;
                }
            }
            if (valid) {
                if (start >= total) {
                    closeQuietly(in);
                    Map<String, String> h = new HashMap<>(headers);
                    h.put("Content-Range", "bytes */" + total);
                    return new WebResourceResponse(mimeType, null, 416, "Range Not Satisfiable", h, empty());
                }
                partial = true;
            }
            // نطاقات متعددة أو صيغة غير صالحة: نتجاهل الطلب ونرسل الملف كاملاً (كما ينص HTTP).
        } else if (total >= 0) {
            headers.put("Accept-Ranges", "bytes");
        }

        if (!partial) {
            if (total >= 0) headers.put("Content-Length", String.valueOf(total));
            return new WebResourceResponse(mimeType, null, 200, "OK", headers, in);
        }

        try {
            seek(in, start);
        } catch (IOException e) {
            closeQuietly(in);
            throw e;
        }
        long length = end - start + 1;
        headers.put("Content-Range", "bytes " + start + "-" + end + "/" + total);
        headers.put("Content-Length", String.valueOf(length));
        return new WebResourceResponse(mimeType, null, 206, "Partial Content", headers, new BoundedInputStream(in, length));
    }

    private static void seek(FileInputStream in, long position) throws IOException {
        if (position <= 0) return;
        try {
            in.getChannel().position(position);
            return;
        } catch (Exception e) {
            // بعض المزوّدات لا تدعم القفز المباشر — نتخطى بالقراءة.
        }
        long remaining = position;
        byte[] buffer = new byte[64 * 1024];
        while (remaining > 0) {
            long skipped = in.skip(remaining);
            if (skipped > 0) {
                remaining -= skipped;
                continue;
            }
            int n = in.read(buffer, 0, (int) Math.min(buffer.length, remaining));
            if (n < 0) throw new IOException("unexpected end of file while seeking");
            remaining -= n;
        }
    }

    private static String mimeTypeOf(ContentResolver resolver, Uri contentUri) {
        String type = null;
        try {
            type = resolver.getType(contentUri);
        } catch (Exception ignored) {
            // نستنتجه من الامتداد
        }
        if (type == null || type.isEmpty() || "application/octet-stream".equals(type)) {
            String name = contentUri.getLastPathSegment();
            int dot = name == null ? -1 : name.lastIndexOf('.');
            if (dot >= 0 && dot < name.length() - 1) {
                String fromExt = MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot + 1).toLowerCase(Locale.ROOT));
                if (fromExt != null) type = fromExt;
            }
        }
        return type == null || type.isEmpty() ? "application/octet-stream" : type;
    }

    private static String header(WebResourceRequest request, String name) {
        Map<String, String> headers = request.getRequestHeaders();
        if (headers == null) return null;
        for (Map.Entry<String, String> e : headers.entrySet()) {
            if (e.getKey() != null && e.getKey().equalsIgnoreCase(name)) return e.getValue();
        }
        return null;
    }

    private static InputStream empty() {
        return new ByteArrayInputStream(new byte[0]);
    }

    private static WebResourceResponse status(int code, String reason) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");
        return new WebResourceResponse("text/plain", "utf-8", code, reason, headers, empty());
    }

    private static void closeQuietly(InputStream in) {
        try {
            in.close();
        } catch (IOException ignored) {
            // لا شيء
        }
    }

    /** يقرأ عدداً محدداً من البايتات فقط ثم ينتهي (نهاية النطاق المطلوب). */
    private static final class BoundedInputStream extends FilterInputStream {

        private long remaining;

        BoundedInputStream(InputStream in, long limit) {
            super(in);
            this.remaining = limit;
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int b = super.read();
            if (b >= 0) remaining--;
            return b;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (remaining <= 0) return -1;
            int n = super.read(b, off, (int) Math.min(len, remaining));
            if (n > 0) remaining -= n;
            return n;
        }

        @Override
        public long skip(long n) throws IOException {
            long skipped = super.skip(Math.min(n, remaining));
            if (skipped > 0) remaining -= skipped;
            return skipped;
        }

        @Override
        public int available() throws IOException {
            return (int) Math.min(super.available(), remaining);
        }

        @Override
        public boolean markSupported() {
            return false;
        }
    }
}
